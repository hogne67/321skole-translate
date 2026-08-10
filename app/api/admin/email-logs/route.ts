import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

type UserDoc = {
    role?: string | null;
    roles?: Record<string, unknown> | null;
    adminLevel?: string | null;
};

function isAdminProfile(profile: UserDoc | undefined) {
    if (!profile) return false;

    if (profile.role === "admin") return true;
    if (profile.adminLevel === "admin" || profile.adminLevel === "superadmin") {
        return true;
    }

    const roles = profile.roles;
    if (roles && typeof roles === "object" && roles.admin === true) return true;

    return false;
}

function serializeDate(value: unknown) {
    if (value instanceof Timestamp) return value.toDate().toISOString();
    return null;
}

export async function GET(req: Request) {
    try {
        const authHeader = req.headers.get("authorization") || "";
        const token = authHeader.startsWith("Bearer ")
            ? authHeader.slice("Bearer ".length)
            : "";

        if (!token) {
            return NextResponse.json(
                { ok: false, error: "missing_token" },
                { status: 401 }
            );
        }

        const { auth, db } = getAdmin();
        const decoded = await auth.verifyIdToken(token);

        const userSnap = await db.collection("users").doc(decoded.uid).get();
        const profile = userSnap.data() as UserDoc | undefined;

        if (!isAdminProfile(profile)) {
            return NextResponse.json(
                { ok: false, error: "forbidden" },
                { status: 403 }
            );
        }

        const snap = await db
            .collection("emailLogs")
            .orderBy("createdAt", "desc")
            .limit(100)
            .get();

        const logs = snap.docs.map((doc) => {
            const data = doc.data();

            return {
                id: doc.id,
                type: data.type ?? null,
                email: data.email ?? null,
                locale: data.locale ?? null,
                subject: data.subject ?? null,
                status: data.status ?? null,
                provider: data.provider ?? null,
                error: data.error ?? null,
                createdAt: serializeDate(data.createdAt),
            };
        });

        const totals = {
            all: logs.length,
            sent: logs.filter((log) => log.status === "sent").length,
            failed: logs.filter((log) => log.status === "failed").length,
            notConfigured: logs.filter((log) => log.status === "not_configured")
                .length,
        };

        return NextResponse.json({ ok: true, logs, totals });
    } catch (error) {
        console.error("admin email logs error", error);

        return NextResponse.json(
            { ok: false, error: "server_error" },
            { status: 500 }
        );
    }
}
