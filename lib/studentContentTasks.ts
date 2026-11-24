import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { isActiveSpaceMember } from "@/lib/security/spaceAccess";
import { getSubmissionStatus } from "@/lib/submissions/status";

type Membership = { spaceId: string; participantId: string };
export type StudentContentRoomChoice = Membership & { title: string | null };
const taskKinds = ["lessons", "writingActivities"] as const;
type TaskKind = (typeof taskKinds)[number];
type TaskStatus = "todo" | "draft" | "submitted" | "reviewed" | "needsWork" | "planningSubmitted" | "planningReviewed";

export type StudentContentTask = {
  id: string;
  kind: TaskKind;
  title: string | null;
  href: string;
  status: TaskStatus;
  assignedAt: number | null;
  dueAt: number | null;
  updatedAt: number;
  archived: boolean;
};

export type StudentContentRoom = {
  id: string;
  title: string | null;
  tasks: StudentContentTask[];
};

export type StudentContentRoomUpdate =
  | { status: "loading" | "unavailable" | "error"; choice?: StudentContentRoomChoice }
  | { status: "ready"; choice: StudentContentRoomChoice; tasks: StudentContentTask[] };

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function listStudentContentMemberships(
  rows: readonly Pick<QueryDocumentSnapshot, "id" | "data">[],
  uid: string,
): Membership[] {
  const memberships: Membership[] = [];
  for (const row of rows) {
    const member = row.data();
    const spaceId = text(member.spaceId);
    if (!spaceId || spaceId.includes("/") || row.id !== `${spaceId}_${uid}`
      || member.uid !== uid || member.role !== "student" || !isActiveSpaceMember(member)) continue;
    memberships.push({ spaceId, participantId: text(member.participantId) ?? uid });
  }

  return memberships;
}

function roomChoice(membership: Membership, room: DocumentData | undefined): StudentContentRoomChoice | null {
  if (!room || room.deletedAt || room.archived === true || text(room.status)?.toLowerCase() === "archived") return null;
  return { ...membership, title: text(room.title) };
}

export async function loadStudentContentRoomChoice(db: Firestore, membership: Membership): Promise<StudentContentRoomChoice | null> {
  return roomChoice(membership, (await getDocFromServer(doc(db, "spaces", membership.spaceId))).data());
}

export type StudentReturnRooms = { codeRoomId: string | null; roomId: string | null };

export function isStudentCodeMembership(member: Record<string, unknown>) {
  return member.schoolPupilCodeAccess === true || (!member.schoolPupilId && (
    member.linkedByStudentCode === true
    || (text(member.studentCode) !== null && (member.isAnon === true || Boolean(member.approvedAt)))
  ));
}

export async function loadStudentReturnRooms(
  db: Firestore, uid: string, preferredRoomId: string | null,
): Promise<StudentReturnRooms> {
  const snapshot = await getDocsFromServer(query(collection(db, "spaceMembers"), where("uid", "==", uid)));
  const rows = snapshot.docs.filter((row) => !row.metadata.hasPendingWrites);
  const codeRows = rows.filter((row) => isStudentCodeMembership(row.data()));
  const codeMemberIds = new Set(codeRows.map((row) => row.id));
  const memberships = listStudentContentMemberships(rows, uid);
  const choices = await Promise.allSettled(memberships.map((member) => loadStudentContentRoomChoice(db, member)));
  const rooms = choices.flatMap((choice) => choice.status === "fulfilled" && choice.value ? [choice.value] : []);
  const preferred = rooms.find((room) => room.spaceId === preferredRoomId);
  const isCodeRoom = (room: StudentContentRoomChoice) => codeMemberIds.has(`${room.spaceId}_${uid}`);
  const codeRoom = preferred && isCodeRoom(preferred) ? preferred : rooms.find(isCodeRoom);
  return {
    codeRoomId: codeRoom?.spaceId ?? null,
    roomId: preferred?.spaceId ?? codeRoom?.spaceId ?? rooms[0]?.spaceId ?? null,
  };
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
    assignedAt: millis(data.assignedAt) || millis(data.createdAt) || null,
    dueAt: millis(data.dueAt) || null,
    updatedAt: Math.max(lastUpdated(data), latest ? lastUpdated(latest.data) : 0),
    archived: data.archived === true || text(data.status)?.toLowerCase() === "archived",
  };
}

export async function loadStudentContentRoom(db: Firestore, membership: Membership, uid: string): Promise<StudentContentRoom | null> {
  const { spaceId } = membership;
  const room = await loadStudentContentRoomChoice(db, membership);
  if (!room) return null;

  const [lessons, writing] = await Promise.all([
    getDocsFromServer(collection(db, "spaces", spaceId, "lessons")),
    getDocsFromServer(collection(db, "spaces", spaceId, "writingActivities")),
  ]);
  const activities = [
    ...lessons.docs.map((activity) => ({ kind: "lessons" as const, activity })),
    ...writing.docs.map((activity) => ({ kind: "writingActivities" as const, activity })),
  ];
  const tasks = await loadTasks(db, membership, uid, activities);
  tasks.sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) || b.updatedAt - a.updatedAt);
  return { id: spaceId, title: room.title, tasks };
}

async function loadTasks(
  db: Firestore,
  membership: Membership,
  uid: string,
  activities: { kind: TaskKind; activity: QueryDocumentSnapshot }[],
) {
  const tasks: StudentContentTask[] = [];
  const batchSize = 12;
  for (let offset = 0; offset < activities.length; offset += batchSize) {
    const batch = activities.slice(offset, offset + batchSize);
    tasks.push(...await Promise.all(batch.map(({ kind, activity }) => loadTask(db, membership, uid, kind, activity))));
  }
  return tasks;
}

function watchStudentContentTasks(
  db: Firestore,
  membership: Membership,
  uid: string,
  update: (tasks: StudentContentTask[] | null, failed: boolean) => void,
) {
  let stopped = false;
  const results: Record<TaskKind, StudentContentTask[] | "error" | null> = {
    lessons: null,
    writingActivities: null,
  };
  const stop = taskKinds.map((kind) => {
    let generation = 0;
    const setResult = (tasks: StudentContentTask[] | "error" | null, version: number) => {
      if (stopped || version !== generation) return;
      results[kind] = tasks;
      const { lessons, writingActivities } = results;
      update(
        Array.isArray(lessons) && Array.isArray(writingActivities) ? [...lessons, ...writingActivities] : null,
        lessons === "error" || writingActivities === "error",
      );
    };
    return onSnapshot(collection(db, "spaces", membership.spaceId, kind), { includeMetadataChanges: true }, (snapshot) => {
      const version = ++generation;
      if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) {
        setResult(null, version);
        return;
      }
      void loadTasks(db, membership, uid, snapshot.docs.map((activity) => ({ kind, activity }))).then(
        (tasks) => setResult(tasks, version),
        () => setResult("error", version),
      );
    }, () => setResult("error", ++generation));
  });
  return () => {
    stopped = true;
    stop.forEach((unsubscribe) => unsubscribe());
  };
}

export function watchStudentContentRoom(
  db: Firestore,
  membership: Membership,
  uid: string,
  update: (room: StudentContentRoomUpdate) => void,
) {
  let choice: StudentContentRoomChoice | null = null;
  let tasks: StudentContentTask[] | null = null;
  let failed = false;
  let stopTasks: (() => void) | null = null;
  const publish = () => {
    if (!choice) return;
    if (failed) update({ status: "error", choice });
    else if (tasks) update({ status: "ready", choice, tasks });
    else update({ status: "loading", choice });
  };
  const reset = (status: "loading" | "unavailable" | "error") => {
    stopTasks?.();
    stopTasks = null;
    choice = null;
    tasks = null;
    failed = false;
    update({ status });
  };
  const stopRoom = onSnapshot(doc(db, "spaces", membership.spaceId), { includeMetadataChanges: true }, (snapshot) => {
    if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) {
      reset("loading");
      return;
    }
    choice = roomChoice(membership, snapshot.data());
    if (!choice) {
      reset("unavailable");
      return;
    }
    if (!stopTasks) {
      stopTasks = watchStudentContentTasks(db, membership, uid, (roomTasks, tasksFailed) => {
        tasks = roomTasks;
        failed = tasksFailed;
        publish();
      });
    }
    publish();
  }, () => reset("error"));

  return () => {
    stopRoom();
    stopTasks?.();
  };
}
