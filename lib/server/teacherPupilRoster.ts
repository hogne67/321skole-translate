import "server-only";
import { randomUUID, randomInt } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { getBucketLimit, getEffectivePlan, type AppRole } from "@/lib/featureAccess";
import { isActiveTeacherPupil, teacherStudentIdentity } from "@/lib/teacherStudentIdentity";

const ownerFields = ["ownerId", "ownerUid", "teacherId", "createdByUid", "createdBy", "uid"];
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
class RosterError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
type Context = { params: Promise<{ spaceId: string }> };

async function access(req: Request, ctx: Context) {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new RosterError("Missing Authorization Bearer token", 401);
  const { auth, db } = getAdmin();
  let uid: string;
  try { uid = (await auth.verifyIdToken(token, true)).uid; }
  catch { throw new RosterError("Invalid token", 401); }
  const { spaceId } = await ctx.params;
  const [room, requester] = await Promise.all([db.doc(`spaces/${spaceId}`).get(), db.doc(`users/${uid}`).get()]);
  if (!room.exists) throw new RosterError("Room not found", 404);
  const data = room.data()!;
  const owner = ownerFields.map(field => text(data[field])).find(Boolean);
  if (!owner) throw new RosterError("Room owner missing", 409);
  const admin = requester.data()?.role === "admin" || requester.data()?.roles?.admin === true;
  if (uid !== owner && !admin) throw new RosterError("No access to manage members for this space", 403);
  // Query failures must not silently undercount licence usage.
  const owned = await Promise.all(ownerFields.map(field => db.collection("spaces").where(field, "==", owner).get()));
  const spaces = new Map(owned.flatMap(snap => snap.docs).filter(doc =>
    ownerFields.map(field => text(doc.data()[field])).find(Boolean) === owner
  ).map(doc => [doc.id, doc.data()]));
  const ownerProfile = uid === owner ? requester : await db.doc(`users/${owner}`).get();
  const profile = ownerProfile.data() ?? {};
  const plan = getEffectivePlan(profile);
  const role = text(profile.role) || "teacher";
  return { db, uid, owner, spaceId, spaces, room, limit: getBucketLimit(role as AppRole, plan, "members") };
}

async function members(a: Awaited<ReturnType<typeof access>>, tx?: FirebaseFirestore.Transaction) {
  const ids = [...a.spaces.keys()];
  const rows: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  for (let i = 0; i < ids.length; i += 10) {
    const q = a.db.collection("spaceMembers").where("spaceId", "in", ids.slice(i, i + 10));
    rows.push(...(tx ? await tx.get(q) : await q.get()).docs.filter(doc => doc.data().role === "student"));
  }
  return rows;
}

function handleError(error: unknown) {
  if (error instanceof RosterError) return json({ error: error.message }, error.status);
  console.error("Teacher pupil roster request failed", error);
  return json({ error: "Could not update pupil roster." }, 500);
}

export async function getTeacherPupilRoster(req: Request, ctx: Context) {
  try {
    const a = await access(req, ctx);
    const roster = new Map<string, { id: string; sourceMemberId: string; displayName: string; spaces: { spaceId: string; title: string; displayName: string }[] }>();
    for (const doc of await members(a)) {
      const data = doc.data();
      const id = teacherStudentIdentity(data);
      if (!id || !isActiveTeacherPupil(data)) continue;
      const spaceId = text(data.spaceId);
      const item = roster.get(id) ?? { id, sourceMemberId: doc.id, displayName: text(data.displayName), spaces: [] };
      if (!item.spaces.some(room => room.spaceId === spaceId)) item.spaces.push({ spaceId, title: text(a.spaces.get(spaceId)?.title), displayName: text(data.displayName) });
      roster.set(id, item);
    }
    return json({ students: [...roster.values()].sort((a, b) => a.displayName.localeCompare(b.displayName)), limit: a.limit });
  } catch (error) { return handleError(error); }
}

export async function createOrLinkTeacherPupil(req: Request, ctx: Context) {
  try {
    const a = await access(req, ctx);
    const rawBody = await req.json().catch(() => ({}));
    const body = rawBody && typeof rawBody === "object" ? rawBody : {};
    const sourceMemberId = text(body.sourceMemberId);
    const targetMemberId = text(body.targetMemberId);
    if (targetMemberId && !sourceMemberId) throw new RosterError("Select an existing pupil first.");
    const name = text(body.displayName).replace(/\s+/g, " ").slice(0, 80);
    if (!sourceMemberId && !name) throw new RosterError("Display name is required");
    const result = await a.db.runTransaction(async tx => {
      // Serialise changes to this teacher's roster, including concurrent imports.
      const lock = a.db.doc(`teacherRosterLocks/${a.owner}`);
      await tx.get(lock);
      const currentRoom = await tx.get(a.room.ref);
      if (!currentRoom.exists || ownerFields.map(field => text(currentRoom.data()?.[field])).find(Boolean) !== a.owner) throw new RosterError("Room ownership changed", 409);
      if (currentRoom.data()?.archived === true || currentRoom.data()?.status === "archived") throw new RosterError("Room is archived", 409);
      const rows = await members(a, tx);
      const source = sourceMemberId ? rows.find(doc => doc.id === sourceMemberId && isActiveTeacherPupil(doc.data())) : undefined;
      if (sourceMemberId && !source) throw new RosterError("Pupil must belong to the same teacher and have an active registration.", 403);
      const identity = source ? teacherStudentIdentity(source.data()) : `teacher_pupil_${randomUUID()}`;
      const active = rows.filter(doc => isActiveTeacherPupil(doc.data()));
      const already = active.find(doc => doc.data().spaceId === a.spaceId && teacherStudentIdentity(doc.data()) === identity);
      const target = targetMemberId ? active.find(doc => doc.id === targetMemberId && doc.data().spaceId === a.spaceId) : undefined;
      if (targetMemberId && !target) throw new RosterError("Target pupil not found in this room", 404);
      if (target && already && text(already.data().participantId) !== text(target.data().participantId)) throw new RosterError("This pupil is already registered in the room. Contact admin to resolve the duplicate.", 409);
      if (!source && new Set(active.map(doc => teacherStudentIdentity(doc.data())).filter(Boolean)).size >= a.limit) throw new RosterError("Elevgrensen er nådd. Gjenbruk en eksisterende elev eller oppgrader lisensen.", 403);
      const oldIdentity = target ? teacherStudentIdentity(target.data()) : "";
      const changed = rows.filter(doc => teacherStudentIdentity(doc.data()) === identity || (oldIdentity && teacherStudentIdentity(doc.data()) === oldIdentity));
      // Only the licence identity changes. Room identities, names, codes and answers stay intact.
      for (const doc of changed) tx.update(doc.ref, { teacherStudentId: identity, updatedAt: FieldValue.serverTimestamp() });
      tx.set(lock, { updatedAt: FieldValue.serverTimestamp() });
      if (target) {
        tx.set(a.db.collection("teacherRosterAudit").doc(), {
          teacherUid: a.owner, actorUid: a.uid, targetIdentity: oldIdentity, teacherStudentId: identity,
          previous: changed.map(doc => ({ memberId: doc.id, teacherStudentId: doc.data().teacherStudentId ?? null })),
          createdAt: FieldValue.serverTimestamp(),
        });
        return { linked: true };
      }
      if (already) return { member: { id: already.id, ...already.data() }, reused: true };
      const participantId = `participant_${randomUUID()}`;
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let studentCode = "";
      for (let attempt = 0; attempt < 30; attempt++) {
        studentCode = Array.from({ length: 5 }, () => alphabet[randomInt(alphabet.length)]).join("");
        if (!active.some(doc => doc.data().spaceId === a.spaceId && doc.data().studentCode === studentCode)) break;
        studentCode = "";
      }
      if (!studentCode) throw new RosterError("Could not generate pupil code", 409);
      const displayName = name || text(source?.data().displayName);
      if (!displayName) throw new RosterError("Display name is required");
      const id = `${a.spaceId}_${participantId}`;
      tx.create(a.db.doc(`spaceMembers/${id}`), {
        spaceId: a.spaceId, participantId, teacherStudentId: identity, role: "student", displayName, studentName: displayName,
        studentCode, studentCodeKey: `${a.spaceId}:${studentCode}`, isAnon: true, teacherManaged: true,
        active: true, archived: false, status: "active", createdByUid: a.uid,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
      return { member: { id, participantId, teacherStudentId: identity, displayName, studentCode } };
    });
    return json({ ok: true, ...result });
  } catch (error) { return handleError(error); }
}
