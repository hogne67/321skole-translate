import { accountErrorStatus } from "@/lib/security/accountAccess.server";
import { getActiveSpaceMembership } from "@/lib/security/spaceAccess.server";
import { studentSubmissionPatch, validateStoredSubmissionIndex, validSubmissionPart, SubmissionWriteError } from "@/lib/security/studentSubmissionPolicy";
import "server-only";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
export const runtime = "nodejs";
type RouteParams = { params: Promise<{ spaceId: string; assignmentId: string }> };
export async function POST(req: Request, ctx: RouteParams) {
  try {
    const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (!token) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    const { spaceId, assignmentId } = await ctx.params;
    if (!validSubmissionPart(spaceId) || !validSubmissionPart(assignmentId)) return NextResponse.json({ ok: false, error: "Invalid route params" }, { status: 400 });
    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;
    const body = await req.json().catch(() => ({}));
    const membership = await getActiveSpaceMembership(db, spaceId, uid);
    if (!membership.ok) throw new SubmissionWriteError("Not a member of this space");
    const participantId = membership.participantId || uid;
    const submissionId = body.submissionId ?? `${spaceId}_${assignmentId}_${participantId}`;
    if (!validSubmissionPart(submissionId)) throw new SubmissionWriteError("Invalid submission id");
    if (!body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
    const context = { kind: "lessons" as const, spaceId, activityId: assignmentId, submissionId, uid, participantId };
    const nestedRef = db.doc(`spaces/${spaceId}/lessons/${assignmentId}/submissions/${submissionId}`);
    const indexRef = db.doc(`spaceSubmissions/${submissionId}`);
    await db.runTransaction(async tx => {
      const [activity, nested, index] = await Promise.all([tx.get(db.doc(`spaces/${spaceId}/lessons/${assignmentId}`)), tx.get(nestedRef), tx.get(indexRef)]);
      if (!activity.exists) throw new SubmissionWriteError("Assignment not found", 404);
      const patch = studentSubmissionPatch(body.payload, nested.data(), context);
      // A stale or foreign index must never be silently taken over.
      validateStoredSubmissionIndex(index.data(), { ...nested.data(), ...patch }, context);
      const now = FieldValue.serverTimestamp();
      const write = { ...patch, updatedAt: now, ...(!nested.exists ? { createdAt: now } : {}) };
      tx.set(nestedRef, write, { merge: true });
      // Preserve an existing index's identities independently; canonical fields bind a new index.
      const indexPatch = studentSubmissionPatch(body.payload, index.data() ?? nested.data(), context);
      tx.set(indexRef, { ...indexPatch, spaceId, assignmentId, updatedAt: now, ...(!index.exists ? { createdAt: now } : {}) }, { merge: true });
    });
    return NextResponse.json({ ok: true, submissionId });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not save submission" }, { status: error instanceof SubmissionWriteError ? error.status : (accountErrorStatus(error) ?? 500) });
  }
}
