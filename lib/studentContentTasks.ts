import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  query,
  where,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { isActiveSpaceMember } from "@/lib/security/spaceAccess";
import { getSubmissionStatus } from "@/lib/submissions/status";

type Membership = { spaceId: string; participantId: string };
type TaskKind = "lessons" | "writingActivities";
type TaskStatus = "todo" | "draft" | "submitted" | "reviewed" | "needsWork" | "planningSubmitted" | "planningReviewed";

export type StudentContentTask = {
  id: string;
  kind: TaskKind;
  title: string | null;
  href: string;
  status: TaskStatus;
  dueAt: number | null;
  updatedAt: number;
  archived: boolean;
};

export type StudentContentRoom = {
  id: string;
  title: string | null;
  tasks: StudentContentTask[];
};

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function selectStudentContentMemberships(
  rows: readonly Pick<QueryDocumentSnapshot, "id" | "data">[],
  uid: string,
  isAnonymous: boolean,
  lastSpaceId: string | null,
): { memberships: Membership[]; chooseRoom: boolean } {
  const memberships: Membership[] = [];
  for (const row of rows) {
    const member = row.data();
    const spaceId = text(member.spaceId);
    if (!spaceId || spaceId.includes("/") || row.id !== `${spaceId}_${uid}`
      || member.uid !== uid || member.role !== "student" || !isActiveSpaceMember(member)) continue;
    memberships.push({ spaceId, participantId: text(member.participantId) ?? uid });
  }

  if (!isAnonymous || memberships.length < 2) return { memberships, chooseRoom: false };
  const chosen = memberships.find(({ spaceId }) => spaceId === lastSpaceId);
  return chosen ? { memberships: [chosen], chooseRoom: false } : { memberships: [], chooseRoom: true };
}

function millis(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value instanceof Date) return value.getTime() || 0;
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
    return Number(value.toMillis()) || 0;
  }
  return 0;
}

function lastUpdated(data: Record<string, unknown>) {
  return millis(data.updatedAt) || millis(data.createdAt);
}

function taskStatus(submission?: Record<string, unknown>): TaskStatus {
  if (!submission) return "todo";
  switch (getSubmissionStatus(submission).toLowerCase()) {
    case "needs_work":
    case "needs-work":
    case "needswork":
      return "needsWork";
    case "reviewed":
    case "approved":
    case "done":
    case "passed":
    case "ok":
      return "reviewed";
    case "planning_submitted":
      return "planningSubmitted";
    case "planning_reviewed":
      return "planningReviewed";
    case "submitted":
    case "sent":
    case "delivered":
      return "submitted";
    case "draft":
    case "new":
      return "draft";
    default:
      return submission.submittedAt ? "submitted" : "draft";
  }
}

async function loadTask(
  db: Firestore,
  { spaceId, participantId }: Membership,
  uid: string,
  kind: TaskKind,
  activity: QueryDocumentSnapshot,
): Promise<StudentContentTask> {
  const { id } = activity;
  const data = activity.data();
  const submissions = collection(db, "spaces", spaceId, kind, id, "submissions");
  const isLesson = kind === "lessons";
  const accountField = isLesson ? "uid" : "studentUid";
  const activityField = isLesson ? "assignmentId" : "activityId";
  const lookups = [
    getDocsFromServer(query(submissions, where("participantId", "==", participantId))),
    getDocsFromServer(query(submissions, where(accountField, "==", uid))),
  ];
  if (!isLesson && participantId !== uid) {
    lookups.push(getDocsFromServer(query(submissions, where("studentUid", "==", participantId))));
  }

  const matches = (await Promise.all(lookups))
    .flatMap((snapshot) => snapshot.docs.map((record) => ({ id: record.id, data: record.data() })))
    .filter(({ data }) => {
      const storedParticipant = text(data.participantId);
      return (data.spaceId === undefined || data.spaceId === spaceId)
        && (data[activityField] === undefined || data[activityField] === id)
        && (!storedParticipant || storedParticipant === participantId);
    })
    .sort((a, b) => lastUpdated(b.data) - lastUpdated(a.data));

  const latest = matches[0];
  const roomPath = `/student/spaces/${encodeURIComponent(spaceId)}`;
  const taskPath = `${roomPath}/${isLesson ? "assignments" : "writing"}/${encodeURIComponent(id)}`;
  return {
    id,
    kind,
    title: text(data.title),
    href: latest && isLesson ? `${taskPath}?sid=${encodeURIComponent(latest.id)}` : taskPath,
    status: taskStatus(latest?.data),
    dueAt: millis(data.dueAt) || null,
    updatedAt: Math.max(lastUpdated(data), latest ? lastUpdated(latest.data) : 0),
    archived: data.archived === true || text(data.status)?.toLowerCase() === "archived",
  };
}

export async function loadStudentContentRoom(db: Firestore, membership: Membership, uid: string): Promise<StudentContentRoom | null> {
  const { spaceId } = membership;
  const room = (await getDocFromServer(doc(db, "spaces", spaceId))).data();
  if (!room || room.deletedAt || room.archived === true || text(room.status)?.toLowerCase() === "archived") return null;

  const [lessons, writing] = await Promise.all([
    getDocsFromServer(collection(db, "spaces", spaceId, "lessons")),
    getDocsFromServer(collection(db, "spaces", spaceId, "writingActivities")),
  ]);
  const activities: Array<{ kind: TaskKind; activity: QueryDocumentSnapshot }> = [
    ...lessons.docs.map((activity) => ({ kind: "lessons" as const, activity })),
    ...writing.docs.map((activity) => ({ kind: "writingActivities" as const, activity })),
  ];
  const tasks: StudentContentTask[] = [];
  const batchSize = 12;
  for (let offset = 0; offset < activities.length; offset += batchSize) {
    const batch = activities.slice(offset, offset + batchSize);
    tasks.push(...await Promise.all(batch.map(({ kind, activity }) => loadTask(db, membership, uid, kind, activity))));
  }
  tasks.sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) || b.updatedAt - a.updatedAt);
  return { id: spaceId, title: text(room.title), tasks };
}
