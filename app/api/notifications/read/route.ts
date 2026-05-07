import { NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import "@/lib/firebaseAdmin";

export const runtime = "nodejs";

type Body = {
    notificationId?: string;
};

export async function POST(req: Request) {
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

        const decoded = await getAuth().verifyIdToken(token);
        const body = (await req.json()) as Body;

        const notificationId = body.notificationId?.trim();

        if (!notificationId) {
            return NextResponse.json(
                { ok: false, error: "missing_notification_id" },
                { status: 400 }
            );
        }

        const db = getFirestore();

        await db
            .collection("users")
            .doc(decoded.uid)
            .collection("notifications")
            .doc(notificationId)
            .update({
                read: true,
                readAt: FieldValue.serverTimestamp(),
            });

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("notification read error", error);

        return NextResponse.json(
            { ok: false, error: "server_error" },
            { status: 500 }
        );
    }
}