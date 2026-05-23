import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { getAdmin } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

type PartnerAudienceItem = {
  id: string;
  uid: string;
  partnerAccess?: unknown;
  email?: unknown;
  displayName?: unknown;
  partnerRegion?: unknown;
} & Record<string, unknown>;

type PartnerBroadcastItem = {
  id: string;
  message?: unknown;
  recipientCount?: unknown;
  targeted?: unknown;
  createdAt?: unknown;
  createdBy?: unknown;
} & Record<string, unknown>;

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  const m = h?.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function readString(v: unknown, maxLength = 4000): string {
  return typeof v === "string" ? v.trim().slice(0, maxLength) : "";
}

function readStringArray(v: unknown, maxItems = 200): string[] {
  if (!Array.isArray(v)) return [];

  return Array.from(
    new Set(
      v
        .map((item) => readString(item, 200))
        .filter(Boolean)
        .slice(0, maxItems)
    )
  );
}

async function isAdminUser(db: FirebaseFirestore.Firestore, uid: string): Promise<boolean> {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) return false;

  const data = snap.data() ?? {};
  const roles = isRecord(data.roles) ? data.roles : {};

  return data.role === "admin" || roles.admin === true;
}

function toJsonSafe(data: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => {
      if (isRecord(value) && typeof value.toDate === "function") {
        return [key, value.toDate().toISOString()];
      }

      return [key, value];
    })
  );
}

async function requireAdmin(req: Request) {
  const token = getBearerToken(req);
  if (!token) return { error: json({ error: "Missing Authorization Bearer token" }, 401) };

  const { auth, db } = getAdmin();
  const decoded = await auth.verifyIdToken(token);
  const adminUid = decoded.uid;

  if (!adminUid || !(await isAdminUser(db, adminUid))) {
    return { error: json({ error: "No access (admin required)" }, 403) };
  }

  return { db, adminUid };
}

export async function GET(req: Request) {
  try {
    const admin = await requireAdmin(req);
    if ("error" in admin) return admin.error;

    const [snap, broadcastsSnap] = await Promise.all([
      admin.db.collection("users").where("partnerStatus", "==", "active").limit(200).get(),
      admin.db
        .collection("partnerBroadcasts")
        .orderBy("createdAt", "desc")
        .limit(20)
        .get(),
    ]);

    const partners: PartnerAudienceItem[] = snap.docs
      .map(
        (doc): PartnerAudienceItem => ({
          id: doc.id,
          uid: doc.id,
          ...toJsonSafe(doc.data() ?? {}),
        })
      )
      .filter((item) => item.partnerAccess === true);

    return json({
      ok: true,
      count: partners.length,
      partners: partners.map((partner) => ({
        uid: partner.uid,
        email: typeof partner.email === "string" ? partner.email : null,
        displayName: typeof partner.displayName === "string" ? partner.displayName : null,
        partnerRegion:
          typeof partner.partnerRegion === "string" ? partner.partnerRegion : null,
      })),
      broadcasts: broadcastsSnap.docs
        .map(
          (doc): PartnerBroadcastItem => ({
            id: doc.id,
            ...toJsonSafe(doc.data() ?? {}),
          })
        )
        .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""))),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Could not load broadcast audience" }, 500);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(req);
    if ("error" in admin) return admin.error;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const message = readString(body.message, 4000);
    const targetUids = readStringArray(body.targetUids);
    if (!message) return json({ error: "Message is required" }, 400);

    const partnerDocs =
      targetUids.length > 0
        ? await Promise.all(targetUids.map((uid) => admin.db.collection("users").doc(uid).get()))
        : (
            await admin.db
              .collection("users")
              .where("partnerStatus", "==", "active")
              .limit(200)
              .get()
          ).docs;

    const partners = partnerDocs.filter((doc) => {
      const data = doc.data() ?? {};
      return data.partnerAccess === true && data.partnerStatus === "active";
    });
    if (partners.length === 0) return json({ error: "No active partners found" }, 400);

    const batch = admin.db.batch();
    const createdAt = FieldValue.serverTimestamp();
    const broadcastRef = admin.db.collection("partnerBroadcasts").doc();

    batch.set(broadcastRef, {
      message,
      recipientCount: partners.length,
      targeted: targetUids.length > 0,
      targetUids,
      createdBy: admin.adminUid,
      createdAt,
      updatedAt: createdAt,
    });

    for (const partnerDoc of partners) {
      const communicationRef = admin.db.collection("partnerCommunications").doc();

      batch.set(communicationRef, {
        broadcastId: broadcastRef.id,
        targetUid: partnerDoc.id,
        type: "admin_broadcast",
        visibility: "partner_visible",
        message,
        createdBy: admin.adminUid,
        createdAt,
        updatedAt: createdAt,
      });
    }

    batch.set(admin.db.collection("adminAuditEvents").doc(), {
      type: "partner_broadcast_sent",
      broadcastId: broadcastRef.id,
      recipientCount: partners.length,
      targeted: targetUids.length > 0,
      actorUid: admin.adminUid,
      createdAt,
    });

    await batch.commit();

    return json({
      ok: true,
      broadcastId: broadcastRef.id,
      recipientCount: partners.length,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Could not send partner broadcast" }, 500);
  }
}
