import "server-only";

import { FieldValue, Timestamp, type DocumentSnapshot, type Firestore, type QueryDocumentSnapshot, type Transaction } from "firebase-admin/firestore";
import type { DecodedIdToken } from "firebase-admin/auth";
import type { NextRequest } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { FamilyAccessError, assertFamilyId, familyRequestBody, requireFamilyDevice, verifyFamilyParentSignIn } from "@/lib/familyDevice.server";
import {
    buildParentSubmissionId, evaluateAnswers, getStableTaskId, isDelivered, isRecord, safeString,
    safeTasksArray, sortTasksByOrder, taskOptions, taskPrompt, taskType,
    type ChildSelfReport, type ParentReviewDoc, type SubmissionDoc,
} from "@/lib/familyAssignments";
import type { FamilyAssignmentData, FamilyRoomData, FamilyRoomSummary } from "@/lib/familyDevice";
import { hasParentFeedback, needsParentReply, type ParentFollowUpData } from "@/lib/parentFeedback";
import { canCountArchivedLesson, familyGoalProgress, readFamilyGoal, type FamilyGoalItem, type FamilyGoalProgress, type ParentSpaceGoalDoc } from "@/lib/parentGoals";
import { assertActiveProfile } from "@/lib/security/accountAccess.server";
import { listOwnedSpaces } from "@/lib/security/ownedSpaces.server";
import { getSpaceAccess, submissionBelongsToPath } from "@/lib/security/spaceAccess.server";
import { isParentSpaceAvailableForSharing, isParentSpaceKind } from "@/lib/spaceSharing";

type FamilyAccess = Awaited<ReturnType<typeof requireFamilyDevice>>;
type FamilyLearner = Pick<FamilyAccess, "ownerUid" | "participantId">;
type Fields = Record<string, unknown>;
const assignmentTextFields = ["title", "description", "instructions", "text", "sourceText", "coverImageUrl", "imageUrl"] as const;
const selfReportFlags = ["readSilently", "readAloud", "completedTasks", "feltEasy", "feltHard"] as const;

function textFields<T extends string>(data: Fields, keys: readonly T[]) {
    const result: Partial<Record<T, string>> = {};
    for (const key of keys) {
        const value = safeString(data[key]);
        if (value) result[key] = value;
    }
    return result;
}

function millis(value: unknown): number {
    const time = value instanceof Date ? value.getTime() :
        typeof value === "number" ? value :
        isRecord(value) && typeof value.toMillis === "function" ? value.toMillis() : 0;
    return typeof time === "number" && Number.isFinite(time) && Math.abs(time) <= 8_640_000_000_000_000 ? time : 0;
}

function roomSummary(access: FamilyAccess): FamilyRoomSummary {
    return textFields(access.room, ["title", "activeLessonId", "activeGoalId"]);
}

function isVisibleAssignment(data: Fields | undefined): data is Fields {
    return !!data && !data.deletedAt && data.archived !== true && safeString(data.status)?.toLowerCase() !== "archived";
}

function taskList(data: Fields) {
    return safeTasksArray(data.tasks).slice().sort(sortTasksByOrder);
}

function assignmentView(data: Fields) {
    return {
        ...textFields(data, [...assignmentTextFields, "language", "textType", "texttype"]),
        tasks: taskList(data).map((task, index) => ({
            id: getStableTaskId(task, index),
            prompt: taskPrompt(task),
            type: taskType(task),
            options: taskOptions(task),
            ...(typeof task.order === "number" && Number.isFinite(task.order) ? { order: task.order } : {}),
        })),
    };
}

function readSelfReport(value: unknown): ChildSelfReport {
    if (!isRecord(value)) return {};
    return { ...Object.fromEntries(selfReportFlags.map((key) => [key, value[key] === true])), comment: safeString(value.comment) ?? "" };
}

function readAnswers(value: unknown): Record<string, string | boolean> {
    if (!isRecord(value)) return {};
    return Object.fromEntries(Object.entries(value)
        .filter((entry): entry is [string, string | boolean] => typeof entry[1] === "string" || typeof entry[1] === "boolean"));
}

function ownSubmission(data: Fields | undefined, spaceId: string, assignmentId: string, uid: string): data is Fields {
    return !!data && (data.uid ?? data.userId ?? data.studentUid) === uid && submissionBelongsToPath(data, spaceId, assignmentId);
}

function displaySubmission(data: Fields | undefined): SubmissionDoc | null {
    if (!data) return null;
    const delivered = isDelivered(data.status);
    return {
        ...textFields(data, ["status"]),
        answers: readAnswers(data.answers),
        childSelfReport: readSelfReport(data.childSelfReport),
        aiFeedback: safeString(data.aiFeedback),
        ...(delivered && isRecord(data.auto) ? { auto: showAuto(data.auto) } : {}),
    };
}

function showAuto(data: Fields): NonNullable<SubmissionDoc["auto"]> {
    const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : undefined;
    return {
        score: finite(data.score),
        maxScore: finite(data.maxScore),
        correctCount: finite(data.correctCount),
        totalAutoGraded: finite(data.totalAutoGraded),
        byTask: isRecord(data.byTask) ? Object.fromEntries(Object.entries(data.byTask)
            .filter(([, result]) => isRecord(result) && typeof result.correct === "boolean")
            .map(([id, result]) => [id, { correct: (result as { correct: boolean }).correct }])) : undefined,
    };
}

function autoSummary(data: SubmissionDoc["auto"]): string | null {
    if (typeof data?.score === "number" && (data.maxScore ?? 0) > 0) return `${data.score}/${data.maxScore}`;
    if (typeof data?.correctCount === "number" && (data.totalAutoGraded ?? 0) > 0) return `${data.correctCount}/${data.totalAutoGraded}`;
    return null;
}

function displayReview(data: Fields | undefined, uid: string): ParentReviewDoc | null {
    if (!data || (data.uid && data.uid !== uid)) return null;
    return {
        ...textFields(data, ["comment"]),
        ...(typeof data.stars === "number" && Number.isFinite(data.stars) ? { stars: data.stars } : {}),
    };
}

function revisionOf(snapshot?: DocumentSnapshot) {
    const time = snapshot?.updateTime;
    return time ? `${time.seconds}:${time.nanoseconds}` : null;
}

function reviewNotice(snapshot: DocumentSnapshot | undefined, uid: string) {
    const data = snapshot?.data();
    const revision = revisionOf(snapshot);
    if (!revision || data?.notifyChild !== true || !hasParentFeedback(displayReview(data, uid))) return null;
    return { revision, sentAt: millis(data.updatedAt) || snapshot?.updateTime?.toMillis() || 0 };
}

function workRefs(db: Firestore, spaceId: string, assignmentId: string, access: FamilyLearner) {
    const lesson = db.doc(`spaces/${spaceId}/lessons/${assignmentId}`);
    const submissionId = buildParentSubmissionId(spaceId, assignmentId, access.ownerUid);
    const legacyParticipant = access.participantId !== access.ownerUid && !access.participantId.includes("/");
    const legacyId = legacyParticipant ? buildParentSubmissionId(spaceId, assignmentId, access.participantId) : null;
    return {
        lesson,
        nested: lesson.collection("submissions").doc(submissionId),
        legacy: legacyId ? lesson.collection("submissions").doc(legacyId) : null,
        index: db.doc(`spaceSubmissions/${submissionId}`),
        review: lesson.collection("parentReviews").doc(access.ownerUid),
        feedbackRead: lesson.collection("childFeedbackReads").doc(access.ownerUid),
    };
}

function familyLessonQuery(db: Firestore, spaceId: string, fields: readonly string[]) {
    return db.collection(`spaces/${spaceId}/lessons`)
        .select(...fields, "status", "deletedAt", "archived");
}

function familyWork(snapshot: DocumentSnapshot | undefined, spaceId: string, assignmentId: string, uid: string) {
    const data = snapshot?.data();
    return ownSubmission(data, spaceId, assignmentId, uid) ? data : undefined;
}

function familyLessonRows(db: Firestore, spaceId: string, docs: QueryDocumentSnapshot[], access: FamilyLearner, goals: FamilyGoalItem[]) {
    return docs.flatMap((doc) => {
        const data = doc.data();
        if (data.deletedAt) return [];
        const archived = !isVisibleAssignment(data);
        const archivedAt = millis(data.archivedAt);
        if (archived && !goals.some(({ data }) => canCountArchivedLesson(data, archivedAt))) return [];
        return [{ id: doc.id, data, archived, archivedAt, refs: workRefs(db, spaceId, doc.id, access) }];
    });
}

function submissionRefs(refs: ReturnType<typeof workRefs>) {
    return refs.legacy ? [refs.nested, refs.legacy] : [refs.nested];
}

function attachFamilyWork(
    lessons: ReturnType<typeof familyLessonRows>,
    snapshots: Map<string, DocumentSnapshot>,
    spaceId: string,
    ownerUid: string,
) {
    return lessons.map((lesson) => {
        const { refs, id } = lesson;
        const nested = snapshots.get(refs.nested.path);
        const legacy = refs.legacy ? snapshots.get(refs.legacy.path) : undefined;
        const work = familyWork(nested?.exists ? nested : legacy, spaceId, id, ownerUid);
        return { ...lesson, work };
    });
}

function familyDeliveries(lessons: ReturnType<typeof attachFamilyWork>) {
    return lessons.map(({ id, archived, archivedAt, work }) => ({
        id,
        archived,
        archivedAt,
        status: work?.status,
        submittedAtMillis: millis(work?.submittedAt),
    }));
}

function familyGoalItems(docs: QueryDocumentSnapshot[]) {
    return docs
        .sort((a, b) => millis(b.get("updatedAt")) - millis(a.get("updatedAt")))
        .flatMap((goal) => readFamilyGoal(goal.id, goal.data(), millis) ?? []);
}

async function requireParentGoalOwner(db: Firestore, spaceId: string, decoded: DecodedIdToken, tx?: Transaction) {
    const { owner, space, profile, participantId } = await getSpaceAccess(db, spaceId, decoded.uid, tx);
    if (!owner || !space || space.deletedAt || !isParentSpaceKind(space.kind) ||
        (profile?.role !== "parent" && profile?.roles?.parent !== true)) {
        throw new FamilyAccessError(403, "parent_required");
    }
    assertActiveProfile(profile, decoded);
    return { space, ownerUid: decoded.uid, participantId: participantId.trim() || decoded.uid };
}

async function readFamilyGoalProgress(
    db: Firestore,
    spaceId: string,
    learner: FamilyLearner,
    goals: FamilyGoalItem[],
    tx?: Transaction,
): Promise<FamilyGoalProgress[]> {
    const unresolved = goals.filter(({ data }) => data.status === "active" || (data.status === "archived" && data.endedAt));
    if (unresolved.length === 0) return goals.flatMap((goal) => familyGoalProgress(goal, []) ?? []);
    const relevantIds = unresolved.every(({ data }) => data.assignmentIds?.length)
        ? new Set(unresolved.flatMap(({ data }) => data.assignmentIds ?? []))
        : null;
    const query = familyLessonQuery(db, spaceId, ["archivedAt"]);
    const assignmentDocs = tx ? await tx.get(query) : await query.get();
    const lessons = familyLessonRows(db, spaceId, assignmentDocs.docs.filter((doc) => !relevantIds || relevantIds.has(doc.id)), learner, unresolved);
    const sources = lessons.flatMap(({ refs }) => submissionRefs(refs));
    const snapshots = sources.length ? await (tx ?? db).getAll(...sources, {
        fieldMask: ["uid", "userId", "studentUid", "spaceId", "assignmentId", "status", "submittedAt"],
    }) : [];
    const work = attachFamilyWork(lessons, new Map(snapshots.map((doc) => [doc.ref.path, doc])), spaceId, learner.ownerUid);
    const deliveries = familyDeliveries(work);
    return goals.flatMap((goal) => familyGoalProgress(goal, deliveries) ?? []);
}

export async function readParentFollowUp(req: Request): Promise<ParentFollowUpData> {
    const { db, decoded } = await verifyFamilyParentSignIn(req);
    const uid = decoded.uid;
    if ((await db.doc(`users/${uid}`).get()).get("role") !== "parent") throw new FamilyAccessError(403, "parent_required");
    const rooms = (await listOwnedSpaces(db, uid)).filter(({ data }) => isParentSpaceAvailableForSharing(data));
    const groups = await Promise.all(rooms.map(async ({ id: spaceId, data }) => {
        const lessonDocs = await familyLessonQuery(db, spaceId, ["title"]).get();
        const lessons = lessonDocs.docs.filter((doc) => isVisibleAssignment(doc.data()));
        if (!lessons.length) return [];
        const items = lessons.map((lesson) => ({
            assignmentId: lesson.id,
            title: safeString(lesson.get("title")),
            refs: workRefs(db, spaceId, lesson.id, { ownerUid: uid, participantId: uid }),
        }));
        const submissions = await db.getAll(...items.map(({ refs }) => refs.nested), {
            fieldMask: ["uid", "userId", "studentUid", "spaceId", "assignmentId", "status", "isChildPortal", "submittedAt", "updatedAt", "createdAt"],
        });
        const submissionsByPath = new Map(submissions.map((submission) => [submission.ref.path, submission]));
        const delivered = items.flatMap((item) => {
            const work = familyWork(submissionsByPath.get(item.refs.nested.path), spaceId, item.assignmentId, uid);
            return needsParentReply(work?.status, work?.isChildPortal, false)
                ? [{ ...item, submittedAt: millis(work?.submittedAt) || millis(work?.updatedAt) || millis(work?.createdAt) }]
                : [];
        });
        if (!delivered.length) return [];
        const reviews = await db.getAll(...delivered.map(({ refs }) => refs.review), { fieldMask: ["uid", "comment", "stars"] });
        const reviewsByPath = new Map(reviews.map((review) => [review.ref.path, review.data()]));
        return delivered.flatMap(({ assignmentId, title, submittedAt, refs }) =>
            hasParentFeedback(displayReview(reviewsByPath.get(refs.review.path), uid))
                ? []
                : [{ spaceId, spaceTitle: safeString(data.title), assignmentId, title, submittedAt }]);
    }));
    return { roomCount: rooms.length, pending: groups.flat().sort((a, b) => b.submittedAt - a.submittedAt) };
}

export async function readFamilyRoom(req: NextRequest, spaceId: string): Promise<FamilyRoomData> {
    const { db } = getAdmin();
    const access = await requireFamilyDevice(req, db, spaceId);
    const room = roomSummary(access);
    const ref = db.doc(`spaces/${spaceId}`);
    const [lessonDocs, goalDocs] = await Promise.all([
        familyLessonQuery(db, spaceId, [...assignmentTextFields, "createdAt", "updatedAt", "archivedAt"]).get(),
        ref.collection("goals").get(),
    ]);
    const goals = familyGoalItems(goalDocs.docs);
    const lessons = familyLessonRows(db, spaceId, lessonDocs.docs, access, goals);
    const rows = lessons.length > 0
        ? await db.getAll(...lessons.flatMap(({ refs, archived }) => [
            ...submissionRefs(refs),
            ...(archived ? [] : [refs.review, refs.feedbackRead]),
        ]), {
            fieldMask: [
                "uid", "userId", "studentUid", "spaceId", "assignmentId", "status", "aiFeedback",
                "comment", "stars", "notifyChild", "reviewRevision", "submittedAt", "updatedAt", "createdAt",
                "auto.score", "auto.maxScore", "auto.correctCount", "auto.totalAutoGraded",
            ],
        })
        : [];
    const workByPath = new Map(rows.map((row) => [row.ref.path, row]));
    const lessonsWithWork = attachFamilyWork(lessons, workByPath, spaceId, access.ownerUid);
    const deliveries = familyDeliveries(lessonsWithWork);
    return {
        room,
        goals: goals.flatMap((goal) => familyGoalProgress(goal, deliveries) ?? []),
        assignments: lessonsWithWork.flatMap(({ id, data, refs, archived, work }) => {
            if (archived) return [];
            const review = workByPath.get(refs.review.path);
            const notice = reviewNotice(review, access.ownerUid);
            const readRevision = workByPath.get(refs.feedbackRead.path)?.get("reviewRevision");
            return [{
                id,
                data: {
                    ...textFields(data, assignmentTextFields),
                    updatedAt: millis(data.updatedAt),
                    createdAt: millis(data.createdAt),
                },
                progress: {
                    status: safeString(work?.status),
                    hasAiFeedback: !!safeString(work?.aiFeedback),
                    autoSummary: isDelivered(work?.status) && isRecord(work?.auto) ? autoSummary(showAuto(work.auto)) : null,
                    updatedAtMillis: millis(work?.submittedAt) || millis(work?.updatedAt) || millis(work?.createdAt),
                },
                hasParentFeedback: hasParentFeedback(displayReview(review?.data(), access.ownerUid)),
                unreadFeedbackAt: notice && notice.revision !== readRevision ? notice.sentAt : null,
            }];
        }),
    };
}

export async function readParentFamilyGoals(req: NextRequest, spaceId: string) {
    assertFamilyId(spaceId);
    const { db, decoded } = await verifyFamilyParentSignIn(req);
    const owner = await requireParentGoalOwner(db, spaceId, decoded);
    const snapshot = await db.collection(`spaces/${spaceId}/goals`).get();
    return { goals: await readFamilyGoalProgress(db, spaceId, owner, familyGoalItems(snapshot.docs)) };
}

export async function createFamilyGoal(req: NextRequest, spaceId: string) {
    assertFamilyId(spaceId);
    const { db, decoded } = await verifyFamilyParentSignIn(req);
    const body = await familyRequestBody(req, 2048);
    const title = safeString(body.title);
    const reward = safeString(body.reward);
    const { targetCount } = body;
    if (!title || title.length > 120 || (body.reward !== undefined && typeof body.reward !== "string") ||
        (reward && reward.length > 160) || typeof targetCount !== "number" ||
        !Number.isInteger(targetCount) || targetCount < 1 || targetCount > 100) {
        throw new FamilyAccessError(400, "invalid_request");
    }

    const spaceRef = db.doc(`spaces/${spaceId}`);
    const goals = spaceRef.collection("goals");
    const next = goals.doc();
    await db.runTransaction(async (tx) => {
        const owner = await requireParentGoalOwner(db, spaceId, decoded, tx);

        const activeGoalId = safeString(owner.space.activeGoalId);
        const pointed = activeGoalId && !activeGoalId.includes("/") ? await tx.get(goals.doc(activeGoalId)) : null;
        const previous = pointed?.get("status") === "active" ? pointed :
            (await tx.get(goals.where("status", "==", "active"))).docs.sort((a, b) => millis(b.get("updatedAt")) - millis(a.get("updatedAt")))[0];
        const previousGoal = previous ? readFamilyGoal(previous.id, previous.data(), millis) : null;
        const now = FieldValue.serverTimestamp();
        if (previous && previousGoal) {
            const [progress] = await readFamilyGoalProgress(db, spaceId, owner, [previousGoal], tx);
            const completed = progress?.data.status === "completed";
            const reachedAt = progress?.data.completedAt;
            tx.update(previous.ref, {
                status: completed ? "completed" : "archived",
                completedAt: completed ? (reachedAt ? Timestamp.fromMillis(Math.min(reachedAt, Date.now())) : now) : null,
                updatedAt: now,
            });
        }

        tx.create(next, {
            title,
            status: "active",
            kind: "complete_assignments",
            targetCount,
            assignmentIds: [],
            ...(reward ? { reward } : {}),
            createdByUid: decoded.uid,
            createdAt: now,
            countFrom: now,
            updatedAt: now,
        } satisfies ParentSpaceGoalDoc);
        tx.update(spaceRef, { activeGoalId: next.id, activeGoalTitle: title, updatedAt: now });
    });
    return { id: next.id };
}

export async function markFamilyRewardGiven(req: NextRequest, spaceId: string) {
    assertFamilyId(spaceId);
    const { db, decoded } = await verifyFamilyParentSignIn(req);
    const body = await familyRequestBody(req, 512);
    const goalId = safeString(body.goalId);
    if (!goalId) throw new FamilyAccessError(400, "invalid_request");
    assertFamilyId(goalId);
    const ref = db.doc(`spaces/${spaceId}/goals/${goalId}`);

    return db.runTransaction(async (tx) => {
        const owner = await requireParentGoalOwner(db, spaceId, decoded, tx);
        const snapshot = await tx.get(ref);
        const goal = readFamilyGoal(goalId, snapshot.data(), millis);
        if (!goal) throw new FamilyAccessError(404, "goal_unavailable");
        if (!goal.data.reward) throw new FamilyAccessError(409, "reward_not_set");

        const [progress] = await readFamilyGoalProgress(db, spaceId, owner, [goal], tx);
        if (progress?.data.status !== "completed") throw new FamilyAccessError(409, "goal_not_completed");
        if (progress.data.rewardGivenAt) return { rewardGivenAt: progress.data.rewardGivenAt };

        const now = Timestamp.now();
        const reachedAt = progress.data.completedAt;
        tx.update(ref, {
            rewardGivenAt: now,
            ...(snapshot.get("status") !== "completed" ? {
                status: "completed",
                completedAt: reachedAt ? Timestamp.fromMillis(Math.min(reachedAt, now.toMillis())) : now,
            } : {}),
        });
        return { rewardGivenAt: now.toMillis() };
    });
}

export async function readFamilyAssignment(req: NextRequest, spaceId: string, assignmentId: string) {
    assertFamilyId(assignmentId);
    const { db } = getAdmin();
    const access = await requireFamilyDevice(req, db, spaceId);
    const refs = workRefs(db, spaceId, assignmentId, access);
    const [lesson, nested, review, feedbackRead, legacy] = await Promise.all([
        refs.lesson.get(), refs.nested.get(), refs.review.get(), refs.feedbackRead.get(), refs.legacy?.get(),
    ]);
    const assignment = lesson.data();
    if (!isVisibleAssignment(assignment)) throw new FamilyAccessError(404, "assignment_unavailable");
    const snapshot = nested.exists || !legacy ? nested : legacy;
    const work = familyWork(snapshot, spaceId, assignmentId, access.ownerUid);
    const notice = reviewNotice(review, access.ownerUid);
    const view: FamilyAssignmentData = {
        room: roomSummary(access),
        assignment: assignmentView(assignment),
        submission: displaySubmission(work),
        parentReview: displayReview(review.data(), access.ownerUid),
        unreadFeedbackRevision: notice && notice.revision !== feedbackRead.get("reviewRevision") ? notice.revision : null,
        revision: work ? revisionOf(snapshot) : null,
    };
    return { view, ownerUid: access.ownerUid };
}

export async function markFamilyFeedbackRead(req: NextRequest, spaceId: string, assignmentId: string) {
    assertFamilyId(assignmentId);
    const { revision } = await familyRequestBody(req, 256);
    if (typeof revision !== "string" || !/^\d{1,12}:\d{1,9}$/.test(revision)) throw new FamilyAccessError(400, "invalid_request");
    const { db } = getAdmin();
    await db.runTransaction(async (tx) => {
        const access = await requireFamilyDevice(req, db, spaceId, tx);
        const refs = workRefs(db, spaceId, assignmentId, access);
        const [lesson, review, receipt] = await tx.getAll(refs.lesson, refs.review, refs.feedbackRead);
        if (!isVisibleAssignment(lesson.data())) throw new FamilyAccessError(404, "assignment_unavailable");
        const notice = reviewNotice(review, access.ownerUid);
        if (!notice || notice.revision !== revision) throw new FamilyAccessError(409, "feedback_changed");
        if (receipt.get("reviewRevision") !== revision) tx.set(refs.feedbackRead, { reviewRevision: revision });
    });
}

export async function saveFamilyAssignment(req: NextRequest, spaceId: string, assignmentId: string) {
    assertFamilyId(assignmentId);
    const { status, revision, answers, childSelfReport } = await familyRequestBody(req, 180_000);
    if ((status !== "draft" && status !== "submitted") ||
        (revision !== null && (typeof revision !== "string" || !/^\d+:\d+$/.test(revision))) ||
        !isRecord(answers) || !isRecord(childSelfReport)) throw new FamilyAccessError(400, "invalid_request");
    const { db } = getAdmin();
    return db.runTransaction(async (tx: Transaction) => {
        const access = await requireFamilyDevice(req, db, spaceId, tx);
        const refs = workRefs(db, spaceId, assignmentId, access);
        const [lesson, nested, indexed, legacy] = await Promise.all([
            tx.get(refs.lesson), tx.get(refs.nested), tx.get(refs.index), refs.legacy ? tx.get(refs.legacy) : null,
        ]);
        const assignment = lesson.data();
        if (!isVisibleAssignment(assignment)) throw new FamilyAccessError(404, "assignment_unavailable");
        const current = nested.exists || !legacy ? nested : legacy;
        const work = familyWork(current, spaceId, assignmentId, access.ownerUid);
        const index = familyWork(indexed, spaceId, assignmentId, access.ownerUid);
        if ((current.exists && !work) || (indexed.exists && !index)) throw new FamilyAccessError(409, "work_conflict");
        if (isDelivered(work?.status) || isDelivered(index?.status)) throw new FamilyAccessError(409, "already_delivered");
        if (revision !== revisionOf(current)) throw new FamilyAccessError(409, "work_conflict");

        const tasks = taskList(assignment);
        const allowedTasks = new Set(tasks.map(getStableTaskId));
        const savedAnswers = Object.fromEntries(Object.entries(readAnswers(answers))
            .filter(([id]) => allowedTasks.has(id)));
        const selfReport = readSelfReport(childSelfReport);
        const now = FieldValue.serverTimestamp();
        const payload = {
            spaceId,
            assignmentId,
            uid: access.ownerUid,
            participantId: access.participantId,
            role: "parent",
            isParentFlow: true,
            isChildPortal: true,
            auth: { uid: access.ownerUid, participantId: access.participantId },
            title: safeString(assignment.title) ?? "",
            status,
            answers: savedAnswers,
            childSelfReport: selfReport,
            updatedAt: now,
            createdAt: work?.createdAt ?? now,
            ...(status === "submitted" ? { auto: evaluateAnswers(tasks, savedAnswers), submittedAt: Date.now() } : {}),
        };
        const mergeFields = Object.keys(payload);
        tx.set(refs.nested, payload, { mergeFields });
        tx.set(refs.index, payload, { mergeFields });
        return { ok: true };
    });
}
