"use client";

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { db } from "@/lib/firebase";
import { useChildRoomAccess } from "@/components/child/ChildRoomAccess";
import FamilyRoomShortcut from "@/components/child/FamilyRoomShortcut";
import { isDelivered } from "@/lib/familyAssignments";
import { CHILD_PREVIEW_PARAM, childRoomHref, FAMILY_GREETING_ID, rememberChildRoom } from "@/lib/familyDevice";

import {
    collection,
    doc,
    onSnapshot,
    orderBy,
    query,
    type DocumentData,
    type Firestore,
    type QueryDocumentSnapshot,
    type Timestamp,
} from "firebase/firestore";

import { canCountArchivedLesson, familyGoalProgress, readFamilyGoal, type FamilyGoal, type FamilyGoalItem, type FamilyGoalProgress } from "@/lib/parentGoals";
import type { SpaceDoc } from "@/lib/spacesClient";
import { hasParentFeedback } from "@/lib/parentFeedback";
import { isParentSpaceKind } from "@/lib/spaceSharing";

type TFn = ReturnType<typeof useTranslations>;

type BeforeInstallPromptEvent = Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

declare global {
    interface Window {
        __childInstallPrompt?: BeforeInstallPromptEvent;
    }
}

function requireDb(x: Firestore | null | undefined): Firestore {
    if (!x) throw new Error("Firestore is not initialized.");
    return x;
}

function safeString(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v.trim() : null;
}

function safeNumber(v: unknown): number | null {
    return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function safeMillis(v: unknown): number {
    if (!v) return 0;
    if (typeof v === "number") return v;

    if (typeof v === "object" && v !== null && "toMillis" in v) {
        try {
            return (v as Timestamp).toMillis();
        } catch {
            return 0;
        }
    }

    return 0;
}

type AssignmentDoc = {
    title?: string;
    description?: string;
    instructions?: string;
    text?: string;
    sourceText?: string;
    coverImageUrl?: string;
    imageUrl?: string;
    archived?: boolean;
    archivedAt?: Timestamp | number;
    deletedAt?: Timestamp | number;
    status?: string;
    updatedAt?: Timestamp | number;
    createdAt?: Timestamp | number;
    [k: string]: unknown;
};

type SubmissionDoc = {
    status?: string;
    aiFeedback?: string | null;
    updatedAt?: Timestamp;
    submittedAt?: Timestamp | number;
    createdAt?: Timestamp;
    auto?: {
        score?: number;
        maxScore?: number;
        correctCount?: number;
        totalAutoGraded?: number;
    };
};

type AssignmentProgress = {
    status: string | null;
    hasAiFeedback: boolean;
    autoSummary: string | null;
    updatedAtMillis: number;
};

type StatusTone = "ready" | "working" | "delivered" | "done";

function buildParentSubmissionId(spaceId: string, assignmentId: string, uid: string) {
    return `${spaceId}_${assignmentId}_${uid}`;
}

function isArchived(d: AssignmentDoc) {
    return d.archived === true || String(d.status ?? "").toLowerCase() === "archived";
}

function assignmentSnippet(d: AssignmentDoc) {
    const candidates = [d.description, d.instructions, d.text, d.sourceText];

    for (const c of candidates) {
        const s = safeString(c);
        if (s) return s.length > 150 ? `${s.slice(0, 150)}…` : s;
    }

    return null;
}

function pickImageUrl(a: AssignmentDoc): string | null {
    return safeString(a.coverImageUrl) ?? safeString(a.imageUrl);
}

function renderAutoSummary(auto: SubmissionDoc["auto"]): string | null {
    if (!auto) return null;

    const score = safeNumber(auto.score);
    const maxScore = safeNumber(auto.maxScore);
    if (score !== null && maxScore !== null && maxScore > 0) return `${score}/${maxScore}`;

    const correct = safeNumber(auto.correctCount);
    const total = safeNumber(auto.totalAutoGraded);
    if (correct !== null && total !== null && total > 0) return `${correct}/${total}`;

    return null;
}

function normalizeStatus(status: string | null) {
    return String(status ?? "").trim().toLowerCase();
}

function progressTone(status: string | null): StatusTone {
    const s = normalizeStatus(status);

    if (s === "reviewed" || s === "approved") return "done";
    if (s === "submitted") return "delivered";
    if (s === "draft" || s === "needs_work") return "working";

    return "ready";
}

function cardToneClasses(tone: StatusTone) {
    if (tone === "delivered") return "border-blue-200 bg-blue-50/70 hover:bg-blue-50";
    if (tone === "done") return "border-green-200 bg-green-50/70 hover:bg-green-50";
    if (tone === "working") return "border-amber-200 bg-amber-50/70 hover:bg-amber-50";

    return "border-emerald-200 bg-emerald-50/60 hover:bg-emerald-50";
}

function buttonText(status: string | null, t: TFn) {
    const s = normalizeStatus(status);

    if (s === "submitted") return t("actions.delivered");
    if (s === "reviewed" || s === "approved") return t("actions.viewCompleted");
    if (s === "draft" || s === "needs_work") return t("actions.continue");
    return t("actions.start");
}

function Badge({
    children,
    tone = "ready",
}: {
    children: React.ReactNode;
    tone?: StatusTone | "neutral";
}) {
    const cls =
        tone === "done"
            ? "border-green-200 bg-green-100 text-green-900"
            : tone === "delivered"
                ? "border-blue-200 bg-blue-100 text-blue-900"
                : tone === "working"
                    ? "border-amber-200 bg-amber-100 text-amber-950"
                    : tone === "ready"
                        ? "border-emerald-200 bg-emerald-100 text-emerald-900"
                        : "border-slate-200 bg-slate-100 text-slate-700";

    return (
        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${cls}`}>
            {children}
        </span>
    );
}

function AssignmentActionButton({
    href,
    status,
    hasFeedback = false,
}: {
    href: string;
    status: string | null;
    hasFeedback?: boolean;
}) {
    const t = useTranslations("childSpace");
    const delivered = isDelivered(status);

    return (
        <Link
            href={href}
            className={[
                "inline-flex items-center justify-center rounded-2xl px-5 py-3 text-sm font-black text-white no-underline shadow-sm transition",
                delivered ? "bg-blue-600 hover:bg-blue-500" : "bg-green-600 hover:bg-green-500",
            ].join(" ")}
        >
            {hasFeedback ? t("actions.viewParentFeedback") : buttonText(status, t)}
        </Link>
    );
}

function GoalReward({ reward }: { reward: string }) {
    const t = useTranslations("childSpace.goal");
    return (
        <dl className="mb-0 mt-4 rounded-2xl bg-white p-4">
            <dt className="font-bold text-slate-900">{t("reward")}</dt>
            <dd className="m-0 mt-1 break-words text-base leading-7 text-slate-700">{reward}</dd>
        </dl>
    );
}

function GoalProgressCard({ goal, done }: { goal: FamilyGoal; done: number }) {
    const t = useTranslations("childSpace");
    const target = typeof goal.targetCount === "number" && goal.targetCount > 0 ? goal.targetCount : null;
    const cappedDone = target ? Math.min(done, target) : done;
    const percent = target ? Math.round((cappedDone / target) * 100) : 0;

    return (
        <section className="rounded-3xl border border-sky-200 bg-sky-50 p-5 shadow-sm sm:p-6">
            <h2 className="m-0 break-words text-2xl font-black tracking-tight text-slate-900">{goal.title}</h2>

            {safeString(goal.description) ? (
                <div className="mt-3 whitespace-pre-wrap text-base leading-8 text-slate-700">
                    {safeString(goal.description)}
                </div>
            ) : null}

            {target ? (
                <div className="mt-5">
                    <div className="mb-2 text-sm font-black text-sky-950">
                        {t("goal.progress", { done: cappedDone, target })}
                    </div>

                    <div
                        role="progressbar"
                        aria-label={goal.title}
                        aria-valuemin={0}
                        aria-valuemax={target}
                        aria-valuenow={cappedDone}
                        className="h-4 overflow-hidden rounded-full bg-white"
                    >
                        <div
                            className="h-full rounded-full bg-sky-500 transition-all"
                            style={{ width: `${percent}%` }}
                        />
                    </div>
                </div>
            ) : null}
            {goal.reward ? <GoalReward reward={goal.reward} /> : null}
        </section>
    );
}

function CompletedGoals({ goals, activeGoalId }: { goals: FamilyGoalProgress[]; activeGoalId: string | null }) {
    const t = useTranslations("childSpace.goal");
    return (
        <section aria-labelledby="completed-goals" className="rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 id="completed-goals" className="m-0 text-xl font-extrabold text-emerald-950">{t("historyTitle")}</h2>
            {goals.some(({ id }) => id === activeGoalId) ? (
                <p className="mb-0 mt-2 font-bold text-emerald-900">{t("completed")}</p>
            ) : null}
            <ul className="m-0 mt-4 grid list-none gap-3 p-0 sm:grid-cols-2">
                {goals.map(({ id, data }) => (
                    <li key={id} className="min-w-0 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                        <h3 className="m-0 flex items-start gap-2 text-base font-extrabold text-emerald-950">
                            <span aria-hidden="true" className="text-emerald-700">✓</span>
                            <span className="min-w-0 break-words">{data.title}</span>
                        </h3>
                        {data.description ? <p className="mb-0 mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{data.description}</p> : null}
                        {data.reward ? <GoalReward reward={data.reward} /> : null}
                    </li>
                ))}
            </ul>
        </section>
    );
}

function AddToHomeScreenButton() {
    const t = useTranslations("childSpace");
    const [message, setMessage] = useState<string | null>(null);

    useEffect(() => {
        const onBeforeInstallPrompt = (event: Event) => {
            event.preventDefault();
            window.__childInstallPrompt = event as BeforeInstallPromptEvent;
        };
        window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
        return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    }, []);

    async function handleInstall() {
        const promptEvent = window.__childInstallPrompt;

        if (!promptEvent) {
            setMessage(t("install.manualHint"));
            return;
        }

        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;

        if (choice.outcome === "accepted") {
            setMessage(t("install.accepted"));
            window.__childInstallPrompt = undefined;
        } else {
            setMessage(t("install.dismissed"));
        }
    }

    return (
        <div>
            <button
                type="button"
                onClick={handleInstall}
                className="rounded-2xl bg-green-600 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-green-500"
            >
                {t("install.button")}
            </button>

            {message ? <div role="status" className="mt-2 text-xs font-bold text-slate-500">{message}</div> : null}
        </div>
    );
}

export default function ChildSpacePage() {
    const { spaceId } = useParams<{ spaceId: string }>();
    const t = useTranslations("childSpace");
    const access = useChildRoomAccess();
    const showGoals = useSearchParams().get("view") === "goals";

    const user = access.mode === "parent" ? access.user : null;
    const room = access.mode === "device" ? access.room : null;
    const [previewSpace, setSpace] = useState<SpaceDoc | null>(null);
    const [previewAssignments, setAssignments] = useState<Array<{ id: string; data: AssignmentDoc }>>([]);
    const [previewGoals, setGoals] = useState<FamilyGoalItem[]>([]);
    const [previewProgressMap, setProgressMap] = useState<Record<string, AssignmentProgress & { submittedAtMillis: number }>>({});
    const [previewFeedback, setParentFeedbackByAssignment] = useState<Record<string, boolean>>({});
    const [err, setErr] = useState<string | null>(null);
    const space = room?.room ?? previewSpace;
    const activeGoalId = safeString(space?.activeGoalId);
    const visiblePreviewAssignments = useMemo(() => previewAssignments.filter(({ data }) => !isArchived(data)), [previewAssignments]);
    const previewWorkAssignments = useMemo(() => previewAssignments.filter(({ data }) => {
        if (!isArchived(data)) return true;
        const archivedAt = safeMillis(data.archivedAt);
        return previewGoals.some(({ data: goal }) => canCountArchivedLesson(goal, archivedAt));
    }), [previewAssignments, previewGoals]);
    const previewGoalProgress = useMemo(() => {
        if (previewGoals.length === 0) return [];
        const deliveries = previewWorkAssignments.map(({ id, data }) => ({
            id,
            status: previewProgressMap[id]?.status,
            submittedAtMillis: previewProgressMap[id]?.submittedAtMillis ?? 0,
            archived: isArchived(data),
            archivedAt: safeMillis(data.archivedAt),
        }));
        return previewGoals.flatMap((goal) => familyGoalProgress(goal, deliveries) ?? []);
    }, [previewGoals, previewWorkAssignments, previewProgressMap]);
    const goals = room?.goals ?? previewGoalProgress;
    const activeGoals = goals.filter(({ data }) => data.status === "active");
    const activeGoal = activeGoals.find(({ id }) => id === activeGoalId) ?? activeGoals[0];
    const completedGoals = goals.filter(({ data }) => data.status === "completed")
        .sort((a, b) => (b.data.completedAt ?? b.data.updatedAt ?? 0) - (a.data.completedAt ?? a.data.updatedAt ?? 0));
    const assignments = room?.assignments ?? visiblePreviewAssignments;
    const progressMap = useMemo(() => room
        ? Object.fromEntries(room.assignments.map(({ id, progress }) => [id, progress]))
        : previewProgressMap, [room, previewProgressMap]);
    const parentFeedbackByAssignment = useMemo(() => room
        ? Object.fromEntries(room.assignments.map(({ id, hasParentFeedback }) => [id, hasParentFeedback]))
        : previewFeedback, [room, previewFeedback]);

    useEffect(() => {
        if (space) rememberChildRoom();
    }, [space]);

    useEffect(() => {
        if (!user) return;
        let unsub: (() => void) | null = null;

        try {
            const dbx = requireDb(db);

            unsub = onSnapshot(
                doc(dbx, "spaces", spaceId),
                (snap) => {
                    const room = snap.data();
                    if (!room || !isParentSpaceKind(room.kind) || room.deletedAt) {
                        setErr(t("errors.readRoom"));
                        return;
                    }
                    setSpace(room as SpaceDoc);
                },
                (e) => setErr(e.message)
            );
        } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : t("errors.readRoom"));
        }

        return () => unsub?.();
    }, [spaceId, user, t]);

    useEffect(() => {
        if (!user) return;
        let unsub: (() => void) | null = null;

        try {
            const dbx = requireDb(db);

            const qy = query(collection(dbx, "spaces", spaceId, "lessons"), orderBy("updatedAt", "desc"));

            unsub = onSnapshot(
                qy,
                (snap) => {
                    const out: Array<{ id: string; data: AssignmentDoc }> = [];

                    snap.forEach((d: QueryDocumentSnapshot<DocumentData>) => {
                        out.push({
                            id: d.id,
                            data: d.data() as AssignmentDoc,
                        });
                    });

                    setAssignments(out.filter(({ data }) => !data.deletedAt));
                },
                (e) => setErr(e.message)
            );
        } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : t("errors.readAssignments"));
        }

        return () => unsub?.();
    }, [spaceId, user, t]);

    useEffect(() => {
        if (!user) return;
        let unsub: (() => void) | null = null;

        try {
            const dbx = requireDb(db);
            unsub = onSnapshot(
                collection(dbx, "spaces", spaceId, "goals"),
                (snap) => {
                    setGoals(snap.docs
                        .flatMap((goal) => readFamilyGoal(goal.id, goal.data(), safeMillis) ?? [])
                        .sort((a, b) => (b.data.updatedAt ?? 0) - (a.data.updatedAt ?? 0)));
                },
                (e) => setErr(e.message)
            );
        } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : t("errors.readGoals"));
        }

        return () => unsub?.();
    }, [spaceId, user, t]);

    useEffect(() => {
        if (!user?.uid || previewWorkAssignments.length === 0) {
            setProgressMap({});
            return;
        }

        const dbx = requireDb(db);
        const unsubs: Array<() => void> = [];

        for (const item of previewWorkAssignments) {
            const submissionId = buildParentSubmissionId(spaceId, item.id, user.uid);

            const unsub = onSnapshot(
                doc(dbx, "spaces", spaceId, "lessons", item.id, "submissions", submissionId),
                (snap) => {
                    if (!snap.exists()) {
                        setProgressMap((old) => ({
                            ...old,
                            [item.id]: {
                                status: null,
                                hasAiFeedback: false,
                                autoSummary: null,
                                submittedAtMillis: 0,
                                updatedAtMillis: 0,
                            },
                        }));
                        return;
                    }

                    const data = snap.data() as SubmissionDoc;

                    setProgressMap((old) => ({
                        ...old,
                        [item.id]: {
                            status: safeString(data.status),
                            hasAiFeedback: !!safeString(data.aiFeedback),
                            autoSummary: renderAutoSummary(data.auto),
                            submittedAtMillis: safeMillis(data.submittedAt),
                            updatedAtMillis:
                                safeMillis(data.submittedAt) ||
                                safeMillis(data.updatedAt) ||
                                safeMillis(data.createdAt),
                        },
                    }));
                },
                () => { }
            );
            unsubs.push(unsub);

            if (isArchived(item.data)) continue;
            const unsubscribeReview = onSnapshot(
                doc(dbx, "spaces", spaceId, "lessons", item.id, "parentReviews", user.uid),
                (snap) => {
                    const available = hasParentFeedback(snap.data());
                    setParentFeedbackByAssignment((current) =>
                        current[item.id] === available ? current : { ...current, [item.id]: available });
                },
                () => { }
            );
            unsubs.push(unsubscribeReview);
        }

        return () => {
            for (const unsub of unsubs) unsub();
        };
    }, [previewWorkAssignments, spaceId, user?.uid]);

    const activeAssignmentId = useMemo(() => {
        const rec = typeof space === "object" && space ? (space as Record<string, unknown>) : null;
        return safeString(rec?.activeLessonId);
    }, [space]);

    const sortedAssignments = useMemo(() => {
        return [...assignments].sort((a, b) => {
            if (a.id === activeAssignmentId) return -1;
            if (b.id === activeAssignmentId) return 1;

            const pa = progressMap[a.id] ?? null;
            const pb = progressMap[b.id] ?? null;

            const aTime = pa?.updatedAtMillis || safeMillis(a.data.updatedAt) || safeMillis(a.data.createdAt);
            const bTime = pb?.updatedAtMillis || safeMillis(b.data.updatedAt) || safeMillis(b.data.createdAt);

            const aStatus = normalizeStatus(pa?.status ?? null);
            const bStatus = normalizeStatus(pb?.status ?? null);

            const statusRank = (s: string) => {
                if (s === "draft" || s === "needs_work") return 4;
                if (s === "submitted") return 3;
                if (s === "reviewed" || s === "approved") return 2;
                return 1;
            };

            const rankDiff = statusRank(bStatus) - statusRank(aStatus);
            if (rankDiff !== 0) return rankDiff;

            return bTime - aTime;
        });
    }, [assignments, activeAssignmentId, progressMap]);

    const featuredAssignment = sortedAssignments[0] ?? null;
    const featuredCover = featuredAssignment ? pickImageUrl(featuredAssignment.data) : null;
    const featuredProgress = featuredAssignment ? progressMap[featuredAssignment.id] ?? null : null;
    const featuredHasParentFeedback = !!featuredAssignment && !!parentFeedbackByAssignment[featuredAssignment.id];
    const otherAssignments = featuredAssignment
        ? sortedAssignments.filter((a) => a.id !== featuredAssignment.id)
        : [];
    const unreadGreetings = room?.assignments
        .filter((item) => typeof item.unreadFeedbackAt === "number")
        .sort((a, b) => (b.unreadFeedbackAt ?? 0) - (a.unreadFeedbackAt ?? 0)) ?? [];

    const spaceTitle = safeString((space as Record<string, unknown> | null)?.title) ?? t("fallbacks.spaceTitle");

    if (err) {
        return (
            <main className="mx-auto max-w-4xl p-4">
                <section className="rounded-3xl border border-red-200 bg-red-50 p-6">
                    <h1 className="text-2xl font-black text-red-900">{t("errors.title")}</h1>
                    <p className="mt-3 text-sm text-red-800">{t("errors.askAdult")}</p>
                </section>
            </main>
        );
    }

    if (!space) return <p role="status" className="text-sm text-slate-600">{t("startPage.opening")}</p>;

    const roomPath = childRoomHref(spaceId);
    const previewQuery = access.mode === "parent" ? { [CHILD_PREVIEW_PARAM]: "parent" } : {};
    const viewLink = "inline-flex min-h-12 items-center justify-center rounded-xl border px-4 py-2 text-sm font-extrabold no-underline";
    const currentView = " border-emerald-800 bg-emerald-800 text-white";
    const inactiveView = " border-emerald-200 bg-white text-emerald-950 hover:bg-emerald-50";

    return (
        <main className="mx-auto flex w-full max-w-5xl flex-col gap-5">
            <section className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-6 shadow-sm sm:p-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                        <p className="m-0 text-sm font-bold text-emerald-800">{t("fallbacks.spaceTitle")}</p>
                        <h1 className="mb-0 mt-2 break-words text-3xl font-extrabold tracking-tight text-emerald-950 sm:text-4xl">{spaceTitle}</h1>
                    </div>

                    <div className="flex min-w-0 flex-col items-start gap-2 sm:items-end">
                        <AddToHomeScreenButton />
                        {access.mode === "device" ? <FamilyRoomShortcut spaceId={spaceId} /> : null}
                    </div>
                </div>
            </section>

            <nav aria-label={t("views.label")} className="flex flex-wrap gap-2">
                <Link
                    href={{ pathname: roomPath, query: previewQuery }}
                    aria-current={showGoals ? undefined : "page"}
                    className={viewLink + (showGoals ? inactiveView : currentView)}
                >
                    {t("assignments.title")}
                </Link>
                <Link
                    href={{ pathname: roomPath, query: { ...previewQuery, view: "goals" } }}
                    aria-current={showGoals ? "page" : undefined}
                    className={viewLink + (showGoals ? currentView : inactiveView)}
                >
                    {t("views.goals")}
                </Link>
            </nav>

            {showGoals ? (
                <>
                    {activeGoal ? <GoalProgressCard goal={activeGoal.data} done={activeGoal.done} /> : completedGoals.length === 0 ? (
                        <section className="rounded-3xl border border-sky-200 bg-sky-50 p-5 sm:p-6">
                            <h2 className="m-0 text-xl font-extrabold text-sky-950">{t("views.goals")}</h2>
                            <p className="mb-0 mt-2 leading-7 text-slate-700">{t("goal.empty")}</p>
                        </section>
                    ) : null}
                    {completedGoals.length > 0 ? <CompletedGoals goals={completedGoals} activeGoalId={activeGoalId} /> : null}
                </>
            ) : null}

            {!showGoals && unreadGreetings.length > 0 ? (
                <section aria-labelledby="new-greetings" className="rounded-3xl border border-amber-200 bg-amber-50 p-4 sm:p-6">
                    <h2 id="new-greetings" className="m-0 text-xl font-extrabold text-amber-950">
                        {t("greetings.title", { count: unreadGreetings.length })}
                    </h2>
                    <ul className="m-0 mt-3 grid list-none gap-2 p-0">
                        {unreadGreetings.map(({ id, data }) => {
                            const title = safeString(data.title) ?? t("fallbacks.assignmentTitle");
                            return (
                                <li key={id} className="min-w-0">
                                    <Link
                                        href={childRoomHref(spaceId, id) + "#" + FAMILY_GREETING_ID}
                                        aria-label={t("greetings.openFor", { assignment: title })}
                                        className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-amber-950 no-underline hover:bg-amber-100"
                                    >
                                        <span className="min-w-0 break-words font-bold">{title}</span>
                                        <span className="text-sm font-semibold">{t("greetings.open")} <span aria-hidden="true">→</span></span>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            ) : null}

            {!showGoals ? (
                <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                    <div className="flex items-center justify-between gap-3">
                        <h2 className="text-2xl font-black text-slate-900">{t("assignments.title")}</h2>
                        <Badge tone="neutral">{assignments.length}</Badge>
                    </div>

                    {featuredAssignment ? (
                        <div
                            className={`mt-5 overflow-hidden rounded-3xl border shadow-sm ${cardToneClasses(
                                progressTone(featuredProgress?.status ?? null)
                            )}`}
                        >
                            <div className={`grid ${featuredCover ? "xl:grid-cols-2" : ""}`}>
                                <div className="flex flex-col justify-center p-5 sm:p-6">
                                    <div className="flex flex-wrap gap-2">
                                        {featuredProgress?.autoSummary ? (
                                            <Badge tone="neutral">
                                                {t("assignments.result", { value: featuredProgress.autoSummary })}
                                            </Badge>
                                        ) : null}

                                        {featuredHasParentFeedback ? (
                                            <Badge tone="done">{t("assignments.parentFeedback")}</Badge>
                                        ) : featuredProgress?.hasAiFeedback ? (
                                            <Badge tone="done">{t("assignments.feedbackReady")}</Badge>
                                        ) : null}
                                    </div>

                                    <h3 className="mt-4 text-2xl font-black tracking-tight text-slate-900">
                                        {safeString(featuredAssignment.data.title) ?? t("fallbacks.assignmentTitle")}
                                    </h3>

                                    {assignmentSnippet(featuredAssignment.data) ? (
                                        <div className="mt-4 text-sm leading-7 text-slate-700">
                                            {assignmentSnippet(featuredAssignment.data)}
                                        </div>
                                    ) : null}

                                    <div className="mt-6">
                                        <AssignmentActionButton
                                            href={childRoomHref(spaceId, featuredAssignment.id, access.mode === "parent")}
                                            status={featuredProgress?.status ?? null}
                                            hasFeedback={featuredHasParentFeedback}
                                        />
                                    </div>
                                </div>

                                {featuredCover ? (
                                    <div className="min-h-[220px] bg-white/40">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={featuredCover}
                                            alt={safeString(featuredAssignment.data.title) ?? t("fallbacks.assignmentTitle")}
                                            className="h-full w-full object-cover"
                                        />
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    ) : (
                        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
                            {t("assignments.none")}
                        </div>
                    )}
                </section>

            ) : null}

            {!showGoals && otherAssignments.length > 0 ? <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <h2 className="text-2xl font-black text-slate-900">{t("assignments.moreTitle")}</h2>

                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                        {otherAssignments.map((item) => {
                            const title = safeString(item.data.title) ?? t("fallbacks.assignmentTitle");
                            const snippet = assignmentSnippet(item.data);
                            const progress = progressMap[item.id] ?? null;
                            const hasFamilyFeedback = !!parentFeedbackByAssignment[item.id];
                            const tone = progressTone(progress?.status ?? null);
                            const cover = pickImageUrl(item.data);

                            return (
                                <div
                                    key={item.id}
                                    className={`group overflow-hidden rounded-3xl border no-underline shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${cardToneClasses(
                                        tone
                                    )}`}
                                >
                                    {cover ? (
                                        <div className="aspect-[16/9] bg-white/50">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={cover}
                                                alt={title}
                                                className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                                            />
                                        </div>
                                    ) : null}

                                    <div className="p-5">
                                        <div className="flex flex-wrap gap-2">
                                            {progress?.autoSummary ? (
                                                <Badge tone="neutral">
                                                    {t("assignments.result", { value: progress.autoSummary })}
                                                </Badge>
                                            ) : null}

                                            {hasFamilyFeedback ? (
                                                <Badge tone="done">{t("assignments.parentFeedback")}</Badge>
                                            ) : progress?.hasAiFeedback ? (
                                                <Badge tone="done">{t("assignments.feedback")}</Badge>
                                            ) : null}
                                        </div>

                                        <div className="mt-4 text-xl font-black text-slate-900">{title}</div>

                                        {snippet ? (
                                            <div className="mt-3 line-clamp-3 text-sm leading-7 text-slate-600">
                                                {snippet}
                                            </div>
                                        ) : null}

                                        <div className="mt-5">
                                            <AssignmentActionButton
                                                href={childRoomHref(spaceId, item.id, access.mode === "parent")}
                                                status={progress?.status ?? null}
                                                hasFeedback={hasFamilyFeedback}
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
            </section> : null}
        </main>
    );
}
