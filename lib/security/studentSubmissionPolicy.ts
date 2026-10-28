// Shared student-write policy. Server routes and client compatibility helpers use these fields.
export type SubmissionKind = "lessons" | "writingActivities";
export type SubmissionContext = { kind: SubmissionKind; spaceId: string; activityId: string; submissionId: string; uid: string; participantId: string };
export const LESSON_STUDENT_FIELDS = ["sourceType","sourceId","title","level","language","isAnon","status","taskType","lessonType","contentType","mathWorksheet","arithmeticWorksheet","measurementWorksheet","lengthWorksheet","fractionWorksheet","mathType","worksheet","answers","answersByTaskId","auto","startedAt","submittedAt","timeSpentSeconds","readingTestTimeLimitSeconds","readingTestTimeUsedSeconds","readingTestTimeSpentSeconds","readingTestSecondsLeftAtSubmit","readingTestTimedOut","readingTestSubmittedManually","readingTimerResult","audioReading","podcastWorkshop","updatedAt","createdAt","studentArchived","studentArchivedAt","displayName","studentName","studentDisplayName","role","isParentFlow","isChildPortal","childSelfReport"] as const;
export const WRITING_STUDENT_FIELDS = ["displayName","answersByFieldId","sectionDrafts","finalText","status","printProfile","sectionImprovementRequests","submittedAt","planningSubmittedAt","updatedAt","createdAt"] as const;
export const SUBMISSION_IDENTITY_FIELDS = ["uid","participantId","studentUid","userId","ownerUid","ownerId","auth","spaceId","assignmentId","activityId","lessonId","linkedMemberId","linkedStudentCode","linkedAt","linkedByUid"] as const;
const CREATE_IDENTITY_FIELDS = ["uid","participantId","studentUid","spaceId","assignmentId","activityId","lessonId","auth"] as const;
export class SubmissionWriteError extends Error { constructor(message: string, public status = 403) { super(message); } }
type Data = Record<string, unknown>;
const own = (data: Data, key: string) => Object.prototype.hasOwnProperty.call(data, key);
export function validSubmissionPart(value: unknown): value is string { return typeof value === "string" && /^[a-zA-Z0-9_-]{1,500}$/.test(value); }
function checkScope(data: Data, c: SubmissionContext) {
  for (const [field, expected] of Object.entries({ spaceId: c.spaceId, ...(c.kind === "lessons" ? { assignmentId: c.activityId, lessonId: c.activityId, activityId: c.activityId } : { activityId: c.activityId, assignmentId: c.activityId }) })) {
    if (own(data, field) && data[field] !== expected) throw new SubmissionWriteError("Submission scope mismatch");
  }
}
function validId(c: SubmissionContext, stored?: Data) {
  const identities = [c.uid, c.participantId, ...(stored ? [stored.uid, stored.studentUid] : [])].filter((value): value is string => typeof value === "string" && !!value);
  return identities.some(value => c.submissionId === `${c.spaceId}_${c.activityId}_${value}` || (!!stored && c.submissionId === value));
}
export function validateStoredStudentSubmission(data: Data | undefined, c: SubmissionContext) {
  if (!data) { if (!validId(c)) throw new SubmissionWriteError("Invalid submission id"); return; }
  checkScope(data, c);
  const participant = data.participantId;
  const anchored = participant === c.participantId || ((participant === undefined || participant === "") && [data.uid, data.studentUid].some(value => value === c.uid || value === c.participantId));
  const studentAliasConsistent = !own(data, "studentUid") || [c.uid, c.participantId, data.uid].includes(data.studentUid);
  if (!anchored || !studentAliasConsistent || !validId(c, data)) throw new SubmissionWriteError("Submission identity mismatch");
}
export function retainedSubmissionIdentity(data: Data | undefined, c: SubmissionContext): Data {
  if (!data) return { uid: c.uid, participantId: c.participantId, spaceId: c.spaceId, ...(c.kind === "lessons" ? { assignmentId: c.activityId } : { studentUid: c.participantId, activityId: c.activityId }) };
  return Object.fromEntries(SUBMISSION_IDENTITY_FIELDS.filter(key => own(data, key)).map(key => [key, data[key]]));
}
export function validateStoredSubmissionIndex(data: Data | undefined, source: Data | undefined, c: SubmissionContext) {
  if (!data) return;
  // The global index shares IDs across activity kinds. Never convert another kind's entry.
  if (c.kind === "lessons" ? !own(data, "assignmentId") && own(data, "activityId") : own(data, "assignmentId")) {
    throw new SubmissionWriteError("Submission index kind mismatch");
  }
  validateStoredStudentSubmission(data, c);
  const identity = source ?? retainedSubmissionIdentity(undefined, c);
  if (["uid", "participantId", "studentUid"].some(key => (data[key] ?? "") !== (identity[key] ?? ""))) {
    throw new SubmissionWriteError("Submission index identity mismatch");
  }
}
export function studentSubmissionPatch(payload: Data, existing: Data | undefined, c: SubmissionContext): Data {
  const editable: readonly string[] = c.kind === "lessons" ? LESSON_STUDENT_FIELDS : WRITING_STUDENT_FIELDS;
  const allowed = new Set([...editable, ...CREATE_IDENTITY_FIELDS]);
  if (Object.keys(payload).some(key => !allowed.has(key))) throw new SubmissionWriteError("Protected submission field");
  checkScope(payload, c);
  if (payload.uid !== c.uid || payload.participantId !== c.participantId) throw new SubmissionWriteError("Invalid student identity");
  if (own(payload, "studentUid") && payload.studentUid !== c.uid && payload.studentUid !== c.participantId) throw new SubmissionWriteError("Invalid student identity");
  if (own(payload, "auth")) {
    const auth = payload.auth as Data;
    if (!auth || typeof auth !== "object" || Array.isArray(auth) || Object.keys(auth).some(key => !["uid", "participantId", "isAnon"].includes(key)) ||
      auth.uid !== c.uid || (own(auth, "participantId") && auth.participantId !== c.participantId)) throw new SubmissionWriteError("Invalid auth identity");
  }
  validateStoredStudentSubmission(existing, c);
  if (own(payload, "status") && !["new", "draft", "submitted", "planning_submitted"].includes(String(payload.status)) && payload.status !== existing?.status) throw new SubmissionWriteError("Invalid student status");
  // Client UID/auth describe this login; persisted identity remains immutable across linked devices.
  return { ...Object.fromEntries(Object.entries(payload).filter(([key]) => editable.includes(key) && !["createdAt", "updatedAt"].includes(key))), ...retainedSubmissionIdentity(existing, c),
    ...(!existing && own(payload, "auth") ? { auth: payload.auth } : {}) };
}
// A writing client resends only identity fields already present on its selected persisted document.
export function writingClientIdentity(existing: Data | null, c: SubmissionContext): Data { return retainedSubmissionIdentity(existing ?? undefined, c); }

