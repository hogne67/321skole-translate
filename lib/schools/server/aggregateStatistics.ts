import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { teacherStudentIdentity } from "@/lib/teacherStudentIdentity";
import { isActiveSpaceMember } from "@/lib/security/spaceAccess";

export const SCHOOL_STATISTICS_MIN_COHORT = 5;
export type SubmissionAggregate = { period: string; countRange: { minimum: number; maximum: number } | null; policyVersion: 1 };
export type SchoolStatistics = { totalSpaceCount: number; totalActivityCount: number; submissions: SubmissionAggregate };
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const millis = (value: unknown): number => value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function" ? value.toMillis() : NaN;

export function lastCompletedSchoolMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Europe/Oslo", year: "numeric", month: "numeric" }).formatToParts(now);
  const year = Number(parts.find(part => part.type === "year")!.value);
  const month = Number(parts.find(part => part.type === "month")!.value);
  const previous = new Date(Date.UTC(year, month - 2, 1));
  function boundary(year: number, month: number) {
    const utc = new Date(Date.UTC(year, month, 1));
    const hour = Number(new Intl.DateTimeFormat("en", { timeZone: "Europe/Oslo", hour: "numeric", hourCycle: "h23" }).format(utc));
    return utc.getTime() - hour * 3_600_000;
  }
  return { period: previous.toISOString().slice(0, 7), start: boundary(previous.getUTCFullYear(), previous.getUTCMonth()), end: boundary(year, month - 1) };
}

/** Whole-school disclosure only: never return contributor counts or partial suppressed totals. */
export function protectSubmissionCount(rooms: { pupils: number; contributors: number; submissions: number }[], incomplete = false) {
  const k = SCHOOL_STATISTICS_MIN_COHORT;
  if (incomplete || !rooms.length || rooms.some(room => room.submissions > 0 &&
    (room.pupils < k || room.contributors < k || room.pupils < room.contributors ||
      (room.pupils - room.contributors > 0 && room.pupils - room.contributors < k)))) return null;
  const total = rooms.reduce((sum, room) => sum + room.submissions, 0);
  if (total < k) return null; // Zero and small positive counts have the same representation.
  const minimum = Math.floor(total / k) * k;
  return { minimum, maximum: minimum + k - 1 };
}

export async function getSchoolStatistics(db: Firestore, schoolId: string, now = new Date()): Promise<SchoolStatistics> {
  const spaces = await db.collection("spaces").where("schoolId", "==", schoolId).select().get();
  const month = lastCompletedSchoolMonth(now);
  const reportRef = db.doc(`schoolAggregateReports/${schoolId}/months/${month.period}`);
  const saved = await reportRef.get();
  let totalActivityCount = 0;
  const roomData = new Map<string, { pupils: Set<string>; aliases: Map<string, string>; contributors: Set<string>; submissions: number }>();
  const rows: { path: string; spaceId: string; activityId: string; data: FirebaseFirestore.DocumentData }[] = [];
  await Promise.all(spaces.docs.map(async space => {
    const [lessons, writing] = await Promise.all([space.ref.collection("lessons").select().get(), space.ref.collection("writingActivities").select().get()]);
    totalActivityCount += lessons.size + writing.size;
    if (saved.exists) return;
    const members = await db.collection("spaceMembers").where("spaceId", "==", space.id)
      .select("role", "uid", "userId", "participantId", "teacherStudentId", "active", "archived", "status").get();
    const room = { pupils: new Set<string>(), aliases: new Map<string, string>(), contributors: new Set<string>(), submissions: 0 };
    for (const member of members.docs) {
      const data = member.data();
      const identity = teacherStudentIdentity(data);
      if (data.role !== "student" || !identity || !isActiveSpaceMember(data)) continue;
      room.pupils.add(identity);
      for (const alias of [data.uid, data.userId, data.participantId, data.teacherStudentId]) if (text(alias)) room.aliases.set(text(alias), identity);
    }
    roomData.set(space.id, room);
    for (const activity of [...lessons.docs, ...writing.docs]) {
      const submissions = await activity.ref.collection("submissions")
        .select("spaceId", "assignmentId", "activityId", "uid", "studentUid", "participantId", "auth.uid", "status", "submittedAt", "createdAt", "updatedAt").get();
      for (const doc of submissions.docs) rows.push({ path: doc.ref.path, spaceId: space.id, activityId: activity.ref.path, data: doc.data() });
    }
  }));
  if (saved.exists) return { totalSpaceCount: spaces.size, totalActivityCount, submissions: saved.data() as SubmissionAggregate };

  let incomplete = false;
  const seen = new Set<string>();
  function collect(spaceId: string, activityId: string, data: FirebaseFirestore.DocumentData) {
    if (["draft", "archived", "deleted"].includes(text(data.status))) return;
    const submitted = millis(data.submittedAt) || millis(data.createdAt) || millis(data.updatedAt);
    if (!Number.isFinite(submitted)) { incomplete = true; return; }
    if (submitted < month.start || submitted >= month.end) return;
    const room = roomData.get(spaceId);
    const identity = [data.participantId, data.studentUid, data.uid, data.auth?.uid].map(alias => room?.aliases.get(text(alias))).find(Boolean);
    if (!room || !identity || !activityId || (data.spaceId && data.spaceId !== spaceId)) { incomplete = true; return; }
    const key = JSON.stringify([activityId, identity]);
    if (seen.has(key)) return;
    seen.add(key);
    room.contributors.add(identity);
    room.submissions++;
  }
  for (const row of rows) collect(row.spaceId, row.activityId, row.data);
  // Legacy index-only submissions remain counted, but never double-count a canonical row.
  for (let offset = 0; offset < spaces.docs.length; offset += 10) {
    const ids = spaces.docs.slice(offset, offset + 10).map(doc => doc.id);
    const index = await db.collection("spaceSubmissions").where("spaceId", "in", ids)
      .select("spaceId", "assignmentId", "activityId", "uid", "studentUid", "participantId", "auth.uid", "status", "submittedAt", "createdAt", "updatedAt").get();
    for (const doc of index.docs) {
      const data = doc.data();
      const spaceId = text(data.spaceId);
      const id = text(data.assignmentId) || text(data.activityId);
      const kind = text(data.assignmentId) ? "lessons" : "writingActivities";
      collect(spaceId, id ? `spaces/${spaceId}/${kind}/${id}` : "", data);
    }
  }
  const candidate: SubmissionAggregate = { period: month.period, policyVersion: 1,
    countRange: protectSubmissionCount([...roomData.values()].map(room => ({ pupils: room.pupils.size, contributors: room.contributors.size, submissions: room.submissions })), incomplete) };
  // Immutable, content-free monthly result prevents repeated polling/differencing.
  // A concurrent first request must return the winning snapshot as well.
  const submissions = await db.runTransaction(async tx => {
    const existing = await tx.get(reportRef);
    if (existing.exists) return existing.data() as SubmissionAggregate;
    tx.create(reportRef, candidate);
    return candidate;
  });
  return { totalSpaceCount: spaces.size, totalActivityCount, submissions };
}
