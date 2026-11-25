import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { accountErrorStatus, assertActiveProfile } from "@/lib/security/accountAccess.server";
import { getSpaceAccess } from "@/lib/security/spaceAccess.server";
import { isParentSpaceAvailableForSharing } from "@/lib/spaceSharing";
import {
    FAMILY_DEVICE_DAYS, FAMILY_DEVICE_LIMIT, FAMILY_INVITE_MINUTES, FAMILY_LINK_TOKEN, familyDeviceApi,
    type FamilyDevice, type FamilyDeviceStatus,
} from "@/lib/familyDevice";

type SecretDevice = FamilyDevice & { digest: string };
type Invite = { digest: string; createdAt: number; expiresAt: number };
type RoomAccess = { ownerUid: string; invite: Invite | null; devices: SecretDevice[] };
const SECURE_COOKIE = process.env.NODE_ENV === "production";
const CHILD_COOKIE = SECURE_COOKIE ? "__Secure-family_room_device" : "family_room_device";
const SESSION_AGE = FAMILY_DEVICE_DAYS * 24 * 60 * 60;
export const FAMILY_NO_STORE = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

export class FamilyAccessError extends Error {
    constructor(public status: number, public code: string) { super(code); }
}

export function familyJson(body: unknown, status = 200) {
    return NextResponse.json(body, { status, headers: FAMILY_NO_STORE });
}

export function familyError(error: unknown) {
    if (error instanceof FamilyAccessError) return familyJson({ error: error.code }, error.status);
    const status = accountErrorStatus(error);
    return familyJson({ error: status ? "account_unavailable" : "room_unavailable" }, status ?? 503);
}

export function assertFamilyId(id: string) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id) || ["__proto__", "constructor", "prototype"].includes(id)) {
        throw new FamilyAccessError(404, "room_unavailable");
    }
}

export function assertLocalRequest(req: Request) {
    const origin = req.headers.get("origin");
    const site = req.headers.get("sec-fetch-site");
    const target = new URL(req.url);
    // Next may use an internal hostname for the request URL, including localhost in development.
    const requestedHost = req.headers.get("host");
    const browserOrigin = requestedHost ? target.protocol + "//" + requestedHost : target.origin;
    if ((origin && origin !== browserOrigin && origin !== target.origin) || site === "cross-site" || site === "same-site") {
        throw new FamilyAccessError(403, "invalid_origin");
    }
}

export async function familyRequestBody(req: Request, maxLength: number): Promise<Record<string, unknown>> {
    assertLocalRequest(req);
    if (Number(req.headers.get("content-length")) > maxLength) throw new FamilyAccessError(413, "body_too_large");
    const raw = await req.text();
    if (raw.length > maxLength) throw new FamilyAccessError(413, "body_too_large");
    let value: unknown;
    try { value = JSON.parse(raw); } catch { throw new FamilyAccessError(400, "invalid_request"); }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new FamilyAccessError(400, "invalid_request");
    return value as Record<string, unknown>;
}

const digest = (secret: string) => createHash("sha256").update(secret).digest("hex");
const newSecret = () => randomBytes(32).toString("base64url");
const configRef = (db: Firestore, spaceId: string) => db.doc(`spaces/${spaceId}/childAccess/config`);

function grantedAfterAccountRevocation(createdAt: number, profile?: Record<string, unknown>) {
    const cutoff = profile?.authRevokedBefore;
    return cutoff === undefined || (typeof cutoff === "number" && Number.isFinite(cutoff)
        && cutoff >= 0 && Math.floor(createdAt / 1000) > cutoff);
}

function currentAccess(data: FirebaseFirestore.DocumentData | undefined, now: number, profile?: Record<string, unknown>): RoomAccess | null {
    if (!data) return null;
    const stored = data as RoomAccess;
    const active = (grant: { createdAt: number; expiresAt: number }) => grant.expiresAt > now
        && grantedAfterAccountRevocation(grant.createdAt, profile);
    return {
        ownerUid: stored.ownerUid,
        invite: stored.invite && active(stored.invite) ? stored.invite : null,
        devices: (stored.devices ?? []).filter(active),
    };
}

function publicStatus(access: RoomAccess | null): FamilyDeviceStatus {
    return {
        inviteExpiresAt: access?.invite?.expiresAt ?? null,
        devices: access?.devices.map(({ id, createdAt, expiresAt }) => ({ id, createdAt, expiresAt })) ?? [],
    };
}

async function requireFamilyOwner(db: Firestore, spaceId: string, uid: string, tx?: Transaction) {
    const access = await getSpaceAccess(db, spaceId, uid, tx);
    if (!access.owner || access.profile?.role !== "parent" || access.space?.kind !== "family"
        || !isParentSpaceAvailableForSharing(access.space)) return null;
    return { profile: access.profile, room: access.space, participantId: access.participantId.trim() || uid };
}

export async function verifyFamilyParentSignIn(req: Request) {
    const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!bearer) throw new FamilyAccessError(401, "parent_sign_in_required");
    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(bearer);
    if (decoded.firebase.sign_in_provider === "anonymous") throw new FamilyAccessError(403, "parent_required");
    return { db, decoded };
}

export async function manageFamilyDevice(req: NextRequest, spaceId: string) {
    assertFamilyId(spaceId);
    const { db, decoded } = await verifyFamilyParentSignIn(req);
    const ref = configRef(db, spaceId);

    if (req.method === "GET") {
        const owner = await requireFamilyOwner(db, spaceId, decoded.uid);
        if (!owner) throw new FamilyAccessError(403, "parent_required");
        const stored = currentAccess((await ref.get()).data(), Date.now(), owner.profile);
        return familyJson(publicStatus(stored?.ownerUid === decoded.uid ? stored : null));
    }

    const { action, deviceId } = await familyRequestBody(req, 1024);
    if (action !== "invite" && action !== "cancel" && (action !== "revoke" || typeof deviceId !== "string" || !/^[0-9a-f]{24}$/.test(deviceId))) {
        throw new FamilyAccessError(400, "invalid_request");
    }
    const secret = action === "invite" ? newSecret() : null;

    return db.runTransaction(async (tx) => {
        const owner = await requireFamilyOwner(db, spaceId, decoded.uid, tx);
        if (!owner) throw new FamilyAccessError(403, "parent_required");
        assertActiveProfile(owner.profile, decoded);
        const snapshot = await tx.get(ref);
        const now = Date.now();
        const stored = currentAccess(snapshot.data(), now, owner.profile);
        const access = stored?.ownerUid === decoded.uid ? stored : { ownerUid: decoded.uid, invite: null, devices: [] };
        if (secret) {
            if (access.devices.length >= FAMILY_DEVICE_LIMIT) throw new FamilyAccessError(409, "device_limit");
            access.invite = { digest: digest(secret), createdAt: now, expiresAt: now + FAMILY_INVITE_MINUTES * 60_000 };
        } else if (action === "cancel") {
            access.invite = null;
        } else {
            access.devices = access.devices.filter((device) => device.id !== deviceId);
        }
        tx.set(ref, access);
        return familyJson({ ...publicStatus(access), ...(secret ? { secret } : {}) });
    });
}

export async function connectFamilyDevice(req: NextRequest, spaceId: string) {
    assertFamilyId(spaceId);
    const { secret } = await familyRequestBody(req, 1024);
    if (typeof secret !== "string" || !FAMILY_LINK_TOKEN.test(secret)) throw new FamilyAccessError(400, "invalid_invite");
    const { db } = getAdmin();
    const ref = configRef(db, spaceId);
    const deviceSecret = newSecret();
    const id = randomBytes(12).toString("hex");
    const inviteDigest = digest(secret);

    await db.runTransaction(async (tx) => {
        const snapshot = await tx.get(ref);
        const now = Date.now();
        const stored = currentAccess(snapshot.data(), now);
        if (!stored?.invite || stored.invite.digest !== inviteDigest || !stored.ownerUid) {
            throw new FamilyAccessError(401, "invalid_invite");
        }
        const owner = await requireFamilyOwner(db, spaceId, stored.ownerUid, tx);
        const access = owner && currentAccess(snapshot.data(), now, owner.profile);
        if (!access?.invite) {
            throw new FamilyAccessError(401, "invalid_invite");
        }
        if (access.devices.length >= FAMILY_DEVICE_LIMIT) throw new FamilyAccessError(409, "device_limit");
        access.devices.push({ id, digest: digest(deviceSecret), createdAt: now, expiresAt: now + SESSION_AGE * 1000 });
        access.invite = null;
        tx.set(ref, access);
    });

    const response = familyJson({ ok: true });
    response.cookies.set(CHILD_COOKIE, deviceSecret, {
        path: familyDeviceApi(spaceId),
        httpOnly: true,
        secure: SECURE_COOKIE,
        sameSite: "strict",
        maxAge: SESSION_AGE,
    });
    return response;
}

export async function requireFamilyDevice(req: NextRequest, db: Firestore, spaceId: string, tx?: Transaction) {
    assertFamilyId(spaceId);
    const secret = req.cookies.get(CHILD_COOKIE)?.value;
    if (!secret || !FAMILY_LINK_TOKEN.test(secret)) throw new FamilyAccessError(401, "device_required");
    const ref = configRef(db, spaceId);
    const snapshot = await (tx ? tx.get(ref) : ref.get());
    const access = currentAccess(snapshot.data(), Date.now());
    const tokenDigest = digest(secret);
    const device = access?.devices.find((candidate) => candidate.digest === tokenDigest);
    if (!access || !device) {
        throw new FamilyAccessError(401, "device_required");
    }
    const owner = await requireFamilyOwner(db, spaceId, access.ownerUid, tx);
    if (!owner || !grantedAfterAccountRevocation(device.createdAt, owner.profile)) {
        throw new FamilyAccessError(401, "device_required");
    }
    return { ...owner, ownerUid: access.ownerUid };
}
