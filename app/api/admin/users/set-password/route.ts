import "server-only";

import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";

function json(data: unknown, status = 200) {
    return NextResponse.json(data, { status });
}

function getBearerToken(req: Request): string | null {
    const h = req.headers.get("authorization") || req.headers.get("Authorization");
    const m = h?.match(/^Bearer\s+(.+)$/i);
    return m ? m[1] : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

export async function POST(req: Request) {
    try {
        const token = getBearerToken(req);
        if (!token) return json({ error: "Missing Authorization bearer token" }, 401);

        const body = (await req.json().catch(() => ({}))) as unknown;
        if (!isRecord(body)) return json({ error: "Invalid body" }, 400);

        const uid = typeof body.uid === "string" ? body.uid.trim() : "";
        const newPassword =
            typeof body.newPassword === "string" ? body.newPassword : "";

        if (!uid) return json({ error: "Missing uid" }, 400);
        if (newPassword.length < 8) {
            return json({ error: "Password must be at least 8 characters" }, 400);
        }

        const { auth, db } = getAdmin();

        const decoded = await auth.verifyIdToken(token);
        const adminSnap = await db.collection("users").doc(decoded.uid).get();
        const adminProfile = adminSnap.exists ? adminSnap.data() || {} : {};

        const isSuperAdmin =
            adminProfile.role === "admin" &&
            adminProfile.adminLevel === "superadmin";

        if (!isSuperAdmin) {
            return json({ error: "Only superadmin can set passwords" }, 403);
        }

        await auth.updateUser(uid, {
            password: newPassword,
        });

        await db.collection("adminAuditEvents").add({
            event: "set_user_password",
            actorUid: decoded.uid,
            targetUid: uid,
            createdAt: new Date(),
        });

        return json({ ok: true });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        return json({ error: message || "Unknown error" }, 500);
    }
}