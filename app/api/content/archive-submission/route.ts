import { accountErrorStatus, assertActiveProfile } from "@/lib/security/accountAccess.server";
import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import { getSpaceAccess, ownsSpaceSubmission } from "@/lib/security/spaceAccess.server";
import { matchesTransferredSchoolSubmission, transferredSchoolParticipant } from "@/lib/server/transferredSchoolSubmissions";

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

        return await db.runTransaction(async tx => {
            const found = (await tx.getAll(...candidates)).find(snap => snap.exists);
            if (!found) return json({ error: `Submission not found: ${submissionId}` }, 404);
            const data = found.data() ?? {};
            const roomSubmission = found.ref.parent.id === "spaceSubmissions";
            const { spaceId } = data;
            if (roomSubmission || typeof spaceId === "string") {
                if (typeof spaceId !== "string" || !spaceId || spaceId.includes("/")) return json({ error: "Forbidden" }, 403);
                const access = await getSpaceAccess(db, spaceId, uid, tx, decoded);
                assertActiveProfile(access.profile, decoded);
                if (!access.canRead || !ownsSpaceSubmission(data, uid, access.participantId)) return json({ error: "Forbidden" }, 403);
                if (data.uid !== uid) {
                    const participantId = roomSubmission && await transferredSchoolParticipant(db, spaceId, uid, access, tx);
                    if (!participantId || !await matchesTransferredSchoolSubmission(db, spaceId, uid, participantId, found.id, data, tx)) {
                        return json({ error: "Forbidden" }, 403);
                    }
                }
            } else if (data.uid !== uid) {
                return json({ error: "Forbidden" }, 403);
            }
            tx.set(found.ref, {
                archived: true,
                archivedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
                archivedBy: uid,
            }, { merge: true });
            return json({ ok: true });
        });
    } catch (e: unknown) {
        return json(
            {
                error: e instanceof Error ? e.message : "Archive failed",
            },
            (accountErrorStatus(e) ?? 500)
        );
    }
}
