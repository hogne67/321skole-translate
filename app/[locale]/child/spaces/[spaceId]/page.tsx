"use client";

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import { db } from "@/lib/firebase";
import { getAuth, onAuthStateChanged, type User } from "firebase/auth";

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

import type { ParentSpaceGoalDoc } from "@/lib/parentGoals";
import type { SpaceDoc } from "@/lib/spacesClient";

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
    status?: string;
    updatedAt?: Timestamp;
    createdAt?: Timestamp;
    [k: string]: unknown;
};

type SubmissionDoc = {
    status?: string;
    aiFeedback?: string | null;
    updatedAt?: Timestamp;
    submittedAt?: Timestamp;
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

type GoalItem = {
    id: string;
    data: ParentSpaceGoalDoc;
};

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

function isDelivered(status: string | null) {
    const s = normalizeStatus(status);
    return s === "submitted" || s === "reviewed" || s === "approved";
}

function progressLabel(status: string | null) {
    const s = normalizeStatus(status);

    if (s === "submitted") return "Du har levert";
    if (s === "reviewed" || s === "approved") return "Ferdig";
    if (s === "draft" || s === "needs_work") return "Du har begynt";

    return "Klar";
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

function buttonText(status: string | null) {
    const s = normalizeStatus(status);

    if (s === "submitted") return "Se oppgaven";
    if (s === "reviewed" || s === "approved") return "Se ferdig oppgave";
    if (s === "draft" || s === "needs_work") return "Fortsett";
    return "Start";
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

function GoalProgressCard({ goal, done }: { goal: ParentSpaceGoalDoc; done: number }) {
    const target = typeof goal.targetCount === "number" && goal.targetCount > 0 ? goal.targetCount : null;
    const cappedDone = target ? Math.min(done, target) : done;
    const percent = target ? Math.round((cappedDone / target) * 100) : 0;
    const finished = target ? cappedDone >= target : false;

    return (
        <section className="rounded-3xl border border-sky-200 bg-sky-50 p-6 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-center gap-2">
                <Badge tone={finished ? "done" : "ready"}>{finished ? "Mål nådd" : "Dagens mål"}</Badge>
                {target ? <Badge tone="neutral">{cappedDone} / {target}</Badge> : null}
            </div>

            <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-900">{goal.title}</h2>

            {safeString(goal.description) ? (
                <div className="mt-3 whitespace-pre-wrap text-base leading-8 text-slate-700">
                    {safeString(goal.description)}
                </div>
            ) : null}

            {target ? (
                <div className="mt-5">
                    <div className="mb-2 text-base font-black text-sky-950">
                        {finished
                            ? "Du klarte målet. Bra jobbet!"
                            : `Du har levert ${cappedDone} av ${target} oppgaver.`}
                    </div>

                    <div className="h-4 overflow-hidden rounded-full bg-white">
                        <div
                            className="h-full rounded-full bg-sky-500 transition-all"
                            style={{ width: `${percent}%` }}
                        />
                    </div>
                </div>
            ) : null}
        </section>
    );
}

function AddToHomeScreenButton() {
    const [canInstall, setCanInstall] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    useEffect(() => {
        if (window.__childInstallPrompt) setCanInstall(true);

        const onBeforeInstallPrompt = (event: Event) => {
            event.preventDefault();
            window.__childInstallPrompt = event as BeforeInstallPromptEvent;
            setCanInstall(true);
        };

        const onPromptReady = () => setCanInstall(true);

        window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
        window.addEventListener("childinstallpromptready", onPromptReady);

        return () => {
            window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
            window.removeEventListener("childinstallpromptready", onPromptReady);
        };
    }, []);

    async function handleInstall() {
        const promptEvent = window.__childInstallPrompt;

        if (!promptEvent) {
            setMessage("På nettbrett og mobil kan du også bruke nettleserens meny og velge Legg til på startskjerm.");
            return;
        }

        await promptEvent.prompt();
        const choice = await promptEvent.userChoice;

        if (choice.outcome === "accepted") {
            setMessage("Nå ligger rommet klart på startskjermen.");
            setCanInstall(false);
            window.__childInstallPrompt = undefined;
        } else {
            setMessage("Du kan legge det til senere.");
        }
    }

    return (
        <div className="mt-5">
            <button
                type="button"
                onClick={handleInstall}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
                Legg til på startskjerm
            </button>

            {message ? <div className="mt-2 text-xs font-bold text-slate-500">{message}</div> : null}

            {!canInstall ? (
                <div className="mt-2 text-xs text-slate-400">
                    Tips: Dette virker best når siden er satt opp som app/PWA.
                </div>
            ) : null}
        </div>
    );
}

export default function ChildSpacePage() {
    const { spaceId } = useParams<{ spaceId: string }>();

    const [user, setUser] = useState<User | null>(null);
    const [space, setSpace] = useState<SpaceDoc | null>(null);
    const [assignments, setAssignments] = useState<Array<{ id: string; data: AssignmentDoc }>>([]);
    const [goals, setGoals] = useState<GoalItem[]>([]);
    const [progressMap, setProgressMap] = useState<Record<string, AssignmentProgress>>({});
    const [err, setErr] = useState<string | null>(null);

    useEffect(() => {
        const auth = getAuth();
        return onAuthStateChanged(auth, (u) => setUser(u));
    }, []);

    useEffect(() => {
        let unsub: (() => void) | null = null;

        try {
            const dbx = requireDb(db);

            unsub = onSnapshot(
                doc(dbx, "spaces", spaceId),
                (snap) => {
                    setSpace(snap.exists() ? (snap.data() as SpaceDoc) : null);
                },
                (e) => setErr(e.message)
            );
        } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : "Could not read room.");
        }

        return () => unsub?.();
    }, [spaceId]);

    useEffect(() => {
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

                    setAssignments(out.filter((x) => !isArchived(x.data)));
                },
                (e) => setErr(e.message)
            );
        } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : "Could not read assignments.");
        }

        return () => unsub?.();
    }, [spaceId]);

    useEffect(() => {
        let unsub: (() => void) | null = null;

        try {
            const dbx = requireDb(db);
            const qy = query(collection(dbx, "spaces", spaceId, "goals"), orderBy("updatedAt", "desc"));

            unsub = onSnapshot(
                qy,
                (snap) => {
                    const out: GoalItem[] = [];

                    snap.forEach((d: QueryDocumentSnapshot<DocumentData>) => {
                        out.push({
                            id: d.id,
                            data: d.data() as ParentSpaceGoalDoc,
                        });
                    });

                    setGoals(out);
                },
                (e) => setErr(e.message)
            );
        } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : "Could not read goals.");
        }

        return () => unsub?.();
    }, [spaceId]);

    useEffect(() => {
        if (!user?.uid || assignments.length === 0) {
            setProgressMap({});
            return;
        }

        const dbx = requireDb(db);
        const unsubs: Array<() => void> = [];

        for (const item of assignments) {
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
        }

        return () => {
            for (const unsub of unsubs) unsub();
        };
    }, [assignments, spaceId, user?.uid]);

    const activeAssignmentId = useMemo(() => {
        const rec = typeof space === "object" && space ? (space as Record<string, unknown>) : null;
        return safeString(rec?.activeLessonId);
    }, [space]);

    const activeGoalId = useMemo(() => {
        const rec = typeof space === "object" && space ? (space as Record<string, unknown>) : null;
        return safeString(rec?.activeGoalId);
    }, [space]);

    const activeGoal = useMemo(() => {
        return (
            (activeGoalId ? goals.find((goal) => goal.id === activeGoalId) : null) ??
            goals.find((goal) => goal.data.status === "active") ??
            null
        );
    }, [activeGoalId, goals]);

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
    const otherAssignments = featuredAssignment
        ? sortedAssignments.filter((a) => a.id !== featuredAssignment.id)
        : [];

    const spaceTitle = safeString((space as Record<string, unknown> | null)?.title) ?? "Mitt rom";

    const completedCount = useMemo(() => {
        return assignments.filter((item) => isDelivered(progressMap[item.id]?.status ?? null)).length;
    }, [assignments, progressMap]);

    const goalCompletedCount = useMemo(() => {
        const goal = activeGoal?.data;
        const ids = goal?.assignmentIds;

        if (Array.isArray(ids) && ids.length > 0) {
            return ids.filter((id) => isDelivered(progressMap[id]?.status ?? null)).length;
        }

        return completedCount;
    }, [activeGoal?.data, completedCount, progressMap]);

    if (err) {
        return (
            <main className="mx-auto max-w-4xl p-4">
                <section className="rounded-3xl border border-red-200 bg-red-50 p-6">
                    <h1 className="text-2xl font-black text-red-900">Noe gikk galt</h1>
                    <div className="mt-3 whitespace-pre-wrap text-sm text-red-800">{err}</div>
                </section>
            </main>
        );
    }

    return (
        <main className="mx-auto flex w-full max-w-5xl flex-col gap-5">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <div className="text-sm font-black uppercase tracking-wide text-slate-400">321school</div>

                <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-900">{spaceTitle}</h1>

                <div className="mt-3 max-w-2xl text-base leading-8 text-slate-600">
                    Her finner du oppgavene dine.
                </div>

                <AddToHomeScreenButton />
            </section>

            {activeGoal ? <GoalProgressCard goal={activeGoal.data} done={goalCompletedCount} /> : null}

            {featuredAssignment ? (
                <section
                    className={`overflow-hidden rounded-3xl border shadow-sm ${cardToneClasses(
                        progressTone(progressMap[featuredAssignment.id]?.status ?? null)
                    )}`}
                >
                    <div className="grid gap-0 lg:grid-cols-2">
                        <div className="flex flex-col justify-center p-6 sm:p-8">
                            <div className="flex flex-wrap gap-2">
                                {featuredAssignment.id === activeAssignmentId ? (
                                    <Badge tone="ready">Neste oppgave</Badge>
                                ) : null}

                                <Badge tone={progressTone(progressMap[featuredAssignment.id]?.status ?? null)}>
                                    {progressLabel(progressMap[featuredAssignment.id]?.status ?? null)}
                                </Badge>

                                {progressMap[featuredAssignment.id]?.autoSummary ? (
                                    <Badge tone="neutral">Resultat: {progressMap[featuredAssignment.id].autoSummary}</Badge>
                                ) : null}

                                {progressMap[featuredAssignment.id]?.hasAiFeedback ? (
                                    <Badge tone="done">Tilbakemelding klar</Badge>
                                ) : null}
                            </div>

                            <h2 className="mt-4 text-3xl font-black tracking-tight text-slate-900">
                                {safeString(featuredAssignment.data.title) ?? "Oppgave"}
                            </h2>

                            {assignmentSnippet(featuredAssignment.data) ? (
                                <div className="mt-4 text-base leading-8 text-slate-700">
                                    {assignmentSnippet(featuredAssignment.data)}
                                </div>
                            ) : null}

                            <div className="mt-8">
                                <Link
                                    href={`/child/spaces/${spaceId}/assignments/${featuredAssignment.id}`}
                                    className="inline-flex items-center justify-center rounded-2xl bg-green-600 px-6 py-4 text-lg font-black text-white no-underline shadow-sm transition hover:bg-green-500"
                                >
                                    {buttonText(progressMap[featuredAssignment.id]?.status ?? null)}
                                </Link>
                            </div>
                        </div>

                        <div className="min-h-[260px] bg-white/40">
                            {pickImageUrl(featuredAssignment.data) ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={pickImageUrl(featuredAssignment.data) ?? ""}
                                    alt={safeString(featuredAssignment.data.title) ?? "Oppgave"}
                                    className="h-full w-full object-cover"
                                />
                            ) : (
                                <div className="flex h-full items-center justify-center text-sm font-bold text-slate-400">
                                    Oppgave
                                </div>
                            )}
                        </div>
                    </div>
                </section>
            ) : null}

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <div className="flex items-center justify-between gap-3">
                    <h2 className="text-2xl font-black text-slate-900">Oppgaver</h2>
                    <Badge tone="neutral">{assignments.length}</Badge>
                </div>

                {otherAssignments.length === 0 ? (
                    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
                        Ingen flere oppgaver akkurat nå.
                    </div>
                ) : (
                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                        {otherAssignments.map((item) => {
                            const title = safeString(item.data.title) ?? "Oppgave";
                            const snippet = assignmentSnippet(item.data);
                            const progress = progressMap[item.id] ?? null;
                            const tone = progressTone(progress?.status ?? null);

                            return (
                                <Link
                                    key={item.id}
                                    href={`/child/spaces/${spaceId}/assignments/${item.id}`}
                                    className={`group overflow-hidden rounded-3xl border no-underline shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${cardToneClasses(
                                        tone
                                    )}`}
                                >
                                    <div className="aspect-[16/9] bg-white/50">
                                        {pickImageUrl(item.data) ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={pickImageUrl(item.data) ?? ""}
                                                alt={title}
                                                className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                                            />
                                        ) : (
                                            <div className="flex h-full items-center justify-center text-sm font-bold text-slate-400">
                                                Oppgave
                                            </div>
                                        )}
                                    </div>

                                    <div className="p-5">
                                        <div className="flex flex-wrap gap-2">
                                            <Badge tone={tone}>{progressLabel(progress?.status ?? null)}</Badge>

                                            {progress?.autoSummary ? (
                                                <Badge tone="neutral">Resultat: {progress.autoSummary}</Badge>
                                            ) : null}

                                            {progress?.hasAiFeedback ? <Badge tone="done">Tilbakemelding</Badge> : null}
                                        </div>

                                        <div className="mt-4 text-xl font-black text-slate-900">{title}</div>

                                        {snippet ? (
                                            <div className="mt-3 line-clamp-3 text-sm leading-7 text-slate-600">
                                                {snippet}
                                            </div>
                                        ) : null}

                                        <div className="mt-5 text-sm font-black text-green-700">
                                            {buttonText(progress?.status ?? null)} →
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </section>
        </main>
    );
}
