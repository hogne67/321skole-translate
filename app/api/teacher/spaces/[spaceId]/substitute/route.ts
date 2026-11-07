import "server-only";
import { FieldPath, FieldValue, type CollectionReference, type Transaction } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdmin, getAdminApp } from "@/lib/firebaseAdmin";
import { AccountAccessError, accountErrorStatus, assertActiveProfile } from "@/lib/security/accountAccess.server";
import { getSpaceAccess, submissionBelongsToPath } from "@/lib/security/spaceAccess.server";
import { spaceSubstituteExpiry } from "@/lib/security/spaceAccess";
import { assertSubstituteExpiry } from "@/lib/security/spaceSubstituteExpiry.server";

type Context = { params: Promise<{ spaceId: string }> };
const readLimit = 40;

function validId(id: unknown): id is string {
  return typeof id === "string" && /^[^/\s]+$/.test(id) && id.length <= 200 && id !== "." && id !== "..";
}

function text(value: unknown) { return typeof value === "string" ? value : ""; }

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

function failure(error: unknown) {
  return json({ error: "Substitute access unavailable" }, accountErrorStatus(error) ?? 503);
}

async function session(req: Request, context: Context) {
  const { spaceId } = await context.params;
  if (!validId(spaceId)) throw new AccountAccessError("Invalid room", 403, "space/invalid-id");
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new AccountAccessError("Sign in", 401, "auth/missing");
  const verifiedToken = token;
  const { auth, db } = getAdmin();
  const projectId = getAdminApp().options.projectId;
  if (!projectId) throw new AccountAccessError("Substitute check unavailable", 503, "space/substitute-check-unavailable");
  const target = { projectId, databaseId: db.databaseId };
  const actor = await auth.verifyIdToken(token, true);
  async function access(tx?: Transaction) {
    const room = await getSpaceAccess(db, spaceId, actor.uid, tx);
    assertActiveProfile(room.profile, actor);
    const expiresAt = spaceSubstituteExpiry(room.member);
    if (!room.substitute || expiresAt === null || expiresAt <= Date.now()) {
      throw new AccountAccessError("Substitute access ended", 403, "space/substitute-ended");
    }
    const scope = { uid: actor.uid, spaceId, schoolId: text(room.member?.substituteSchoolId),
      grantId: text(room.member?.substituteGrantId), expiresAt };
    await assertSubstituteExpiry(target, verifiedToken, scope);
    return { ...scope, title: text(room.space?.title) };
  }
  return { db, actor, spaceId, access, confirmExpiry: (scope: Parameters<typeof assertSubstituteExpiry>[2]) => assertSubstituteExpiry(target, verifiedToken, scope) };
}

async function page(collection: CollectionReference, after: string | null) {
  const ordered = collection.orderBy(FieldPath.documentId()).limit(readLimit + 1);
  const { docs } = await (after ? ordered.startAfter(after) : ordered).get();
  return { rows: docs.slice(0, readLimit), next: docs.length > readLimit ? docs[readLimit - 1].id : null };
}

function reviewable(data: Record<string, unknown>) {
  return ["submitted", "reviewed", "needs_work", "approved"].includes(text(data.status));
}

export async function GET(req: Request, context: Context) {
  try {
    const { db, spaceId, access } = await session(req, context);
    await access();
    const query = new URL(req.url).searchParams;
    const assignmentId = query.get("assignmentId"), after = query.get("after");
    if ((assignmentId !== null && !validId(assignmentId)) || (after !== null && !validId(after))) return json({ error: "Invalid selection" }, 400);
    const lessons = db.collection(`spaces/${spaceId}/lessons`);
    if (assignmentId === null) {
      const { rows, next } = await page(lessons, after);
      const { expiresAt, title } = await access();
      return json({ expiresAt, title, lessons: rows.map(row => ({ id: row.id, title: text(row.get("title")) })), next });
    }
    const lesson = lessons.doc(assignmentId);
    const snapshot = await lesson.get();
    if (!snapshot.exists) return json({ error: "Assignment unavailable" }, 404);
    const { rows, next } = await page(lesson.collection("submissions"), after);
    const submissions = rows.flatMap(row => {
      const data = row.data();
      if (!reviewable(data) || !submissionBelongsToPath(data, spaceId, assignmentId)) return [];
      return [{ id: row.id, studentName: text(data.studentDisplayName) || text(data.studentName), status: text(data.status),
        answers: data.answersByTaskId ?? data.answers ?? null, feedback: text(row.get("teacherFeedback.text")) }];
    });
    const tasks = snapshot.get("tasks");
    const prompts = Array.isArray(tasks) ? tasks.map((task, index) => ({ id: text(task?.id) || String(index + 1), prompt: text(task?.prompt) })) : [];
    const { expiresAt, title } = await access();
    return json({ expiresAt, title, assignment: { title: text(snapshot.get("title")), prompts }, submissions, next });
  } catch (error) { return failure(error); }
}

export async function POST(req: Request, context: Context) {
  try {
    const { db, spaceId, actor, access, confirmExpiry } = await session(req, context);
    const body = await req.json().catch(() => null);
    const feedback = text(body?.feedback).trim();
    if (!validId(body?.assignmentId) || !validId(body?.submissionId) || !feedback || feedback.length > 5000) {
      return json({ error: "Invalid feedback" }, 400);
    }
    const assignmentId: string = body.assignmentId;
    const lesson = db.doc(`spaces/${spaceId}/lessons/${assignmentId}`);
    const submission = lesson.collection("submissions").doc(body.submissionId);
    const mirror = db.doc(`spaceSubmissions/${body.submissionId}`);
    const saved = await db.runTransaction(async tx => {
      const scope = await access(tx);
      const [assignment, answer, index] = await Promise.all([tx.get(lesson), tx.get(submission), tx.get(mirror)]);
      const data = answer.data();
      if (!assignment.exists || !data || !reviewable(data) || !submissionBelongsToPath(data, spaceId, assignmentId)) return false;
      if (scope.expiresAt <= Date.now()) {
        throw new AccountAccessError("Substitute access ended", 403, "space/substitute-ended");
      }
      await confirmExpiry(scope);
      const now = FieldValue.serverTimestamp();
      const update = { teacherFeedback: { text: feedback, teacherUid: actor.uid, updatedAt: now }, updatedAt: now };
      tx.update(submission, update);
      if (index.exists && index.get("spaceId") === spaceId && index.get("assignmentId") === assignmentId &&
          typeof data.uid === "string" && index.get("uid") === data.uid) tx.update(mirror, update);
      return true;
    });
    return saved ? json({ ok: true }) : json({ error: "Submission unavailable" }, 404);
  } catch (error) { return failure(error); }
}
