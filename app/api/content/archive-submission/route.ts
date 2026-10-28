import { accountErrorStatus } from "@/lib/security/accountAccess.server";
import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import { getSpaceAccess, ownsSpaceSubmission } from "@/lib/security/spaceAccess.server";

function json(data: unknown, status = 200) {
    return NextResponse.json(data, { status });
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

function getBearerToken(req: Request): string | null {
    const h = req.headers.get("authorization") || req.headers.get("Authorization");
    const m = h?.match(/^Bearer\s+(.+)$/i);
    return m ? m[1] : null;
}

export async function POST(req: Request) {
    console.log("ARCHIVE SUBMISSION API HIT");
    try {
        const token = getBearerToken(req);
        if (!token) {
            return json({ error: "Missing Authorization bearer token" }, 401);
        }

        const admin = getAdmin();

        const decoded = await admin.auth.verifyIdToken(token);
        const uid = decoded.uid;

        const body = (await req.json().catch(() => ({}))) as unknown;
        if (!isRecord(body)) {
            return json({ error: "Invalid body" }, 400);
        }

        const submissionId =
            typeof body.submissionId === "string" ? body.submissionId.trim() : "";

        if (!submissionId) {
            return json({ error: "Missing submissionId" }, 400);
        }

        const db = admin.db;

        const candidates = [
            db.collection("practiceSubmissions").doc(submissionId),
            db.collection("submissions").doc(submissionId),
            db.collection("spaceSubmissions").doc(submissionId),
        ];

        let foundRef: FirebaseFirestore.DocumentReference | null = null;

        for (const ref of candidates) {
            const snap = await ref.get();

            if (snap.exists) {
                const data = snap.data() ?? {};
                if (data.uid !== uid) return json({ error: "Forbidden" }, 403);
                if (ref.parent.id === "spaceSubmissions" || typeof data.spaceId === "string") {
                    if (typeof data.spaceId !== "string" || data.spaceId.includes("/")) return json({ error: "Forbidden" }, 403);
                    const access = await getSpaceAccess(db, data.spaceId, uid);
                    if (!access.canRead || !ownsSpaceSubmission(data, uid, access.participantId)) return json({ error: "Forbidden" }, 403);
                }
                foundRef = ref;
                break;
            }
        }

        if (!foundRef) {
            return json({ error: `Submission not found: ${submissionId}` }, 404);
        }

        await foundRef.set(
            {
                archived: true,
                archivedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
                archivedBy: uid,
            },
            { merge: true }
        );

        return json({ ok: true });
    } catch (e: unknown) {
        return json(
            {
                error: e instanceof Error ? e.message : "Archive failed",
            },
            (accountErrorStatus(e) ?? 500)
        );
    }
}
