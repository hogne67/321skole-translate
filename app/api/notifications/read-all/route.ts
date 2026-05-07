import { NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import "@/lib/firebaseAdmin";

export const runtime = "nodejs";

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
        const db = getFirestore();

        const snap = await db
            .collection("users")
            .doc(decoded.uid)
            .collection("notifications")
            .where("read", "==", false)
            .limit(50)
            .get();

        const batch = db.batch();

        snap.docs.forEach((doc) => {
            batch.update(doc.ref, {
                read: true,
                readAt: FieldValue.serverTimestamp(),
            });
        });

        await batch.commit();

        return NextResponse.json({ ok: true, updated: snap.size });
    } catch (error) {
        console.error("notification read all error", error);

        return NextResponse.json(
            { ok: false, error: "server_error" },
            { status: 500 }
        );
    }
}