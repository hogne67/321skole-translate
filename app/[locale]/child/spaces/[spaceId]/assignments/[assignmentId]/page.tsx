// app/[locale]/child/spaces/[spaceId]/assignments/[assignmentId]/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import { db } from "@/lib/firebase";
import {
    doc,
    onSnapshot,
    serverTimestamp,
    writeBatch,
    type Firestore,
} from "firebase/firestore";
import { getAuth, onAuthStateChanged, type User } from "firebase/auth";
import type { SpaceDoc } from "@/lib/spacesClient";

type TtsLang = "no" | "en" | "pt-BR";
type AudioMode = "text" | "task" | "option" | "feedback";

type AssignmentDoc = {
    title?: string;
    description?: string;
    instructions?: string;
    text?: string;
    sourceText?: string;
    tasks?: unknown;
    coverImageUrl?: string;
    imageUrl?: string;
    sourceType?: string;
    sourceId?: string;
    language?: string;
    [k: string]: unknown;
};

type Task = {
    id?: string;
    order?: number;
    type?: string;
    prompt?: string;
    question?: string;
    text?: string;
    sentence?: string;
    options?: unknown;
    choices?: unknown;
    alternatives?: unknown;
    answer?: unknown;
    correctAnswer?: unknown;
    isTrue?: unknown;
};

type ChildSelfReport = {
    readSilently?: boolean;
    readAloud?: boolean;
    completedTasks?: boolean;
    feltEasy?: boolean;
    feltHard?: boolean;
    comment?: string;
};

type SubmissionDoc = {
    answers?: Record<string, string | boolean>;
    childSelfReport?: ChildSelfReport;
    status?: string;
    aiFeedback?: string | null;
    auto?: {
        score?: number;
        maxScore?: number;
        correctCount?: number;
        totalAutoGraded?: number;
        byTask?: Record<string, { correct?: boolean }>;
    };
};



type ParentReviewDoc = {
    uid?: string;
    comment?: string;
    stars?: number;
    updatedAt?: unknown;
};

function requireDb(x: Firestore | null | undefined): Firestore {
    if (!x) throw new Error("Firestore is not initialized.");
    return x;
}

function safeString(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v.trim() : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

function toTtsLang(lang: string | undefined | null): TtsLang {
    const v = String(lang ?? "").toLowerCase().trim();
    if (v === "pt" || v === "pt-br" || v === "pt_br") return "pt-BR";
    if (v === "en") return "en";
    return "no";
}

function fmtTime(sec: number) {
    if (!sec || !isFinite(sec)) return "0:00";
    const s = Math.floor(sec);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
}

function buildParentSubmissionId(spaceId: string, assignmentId: string, uid: string) {
    return `${spaceId}_${assignmentId}_${uid}`;
}

function safeTasksArray(tasks: unknown): Task[] {
    if (Array.isArray(tasks)) return tasks as Task[];

    if (typeof tasks === "string") {
        try {
            const parsed: unknown = JSON.parse(tasks);
            return Array.isArray(parsed) ? (parsed as Task[]) : [];
        } catch {
            return [];
        }
    }

    return [];
}

function sortTasksByOrder(a: Task, b: Task) {
    const ao = typeof a.order === "number" ? a.order : 999;
    const bo = typeof b.order === "number" ? b.order : 999;
    return ao - bo;
}

function getStableTaskId(t: Task, idx: number): string {
    if (t.id != null && String(t.id).trim()) return String(t.id).trim();

    const orderPart = t.order != null ? String(t.order) : "x";
    const prompt =
        safeString(t.prompt) ??
        safeString(t.question) ??
        safeString(t.text) ??
        safeString(t.sentence) ??
        "";

    if (prompt) return `${orderPart}__${prompt.slice(0, 80)}`;
    return `${orderPart}__idx${idx}`;
}

function taskPrompt(t: Task): string {
    return (
        safeString(t.prompt) ??
        safeString(t.question) ??
        safeString(t.text) ??
        safeString(t.sentence) ??
        ""
    );
}

function taskType(t: Task): "mcq" | "truefalse" | "open" {
    const raw = (safeString(t.type) ?? "open").toLowerCase();

    if (raw === "mcq" || raw === "multiplechoice" || raw === "multiple_choice") return "mcq";
    if (raw === "truefalse" || raw === "true_false" || raw === "boolean") return "truefalse";

    return "open";
}

function taskOptions(t: Task): string[] {
    const raw = Array.isArray(t.options)
        ? t.options
        : Array.isArray(t.choices)
            ? t.choices
            : Array.isArray(t.alternatives)
                ? t.alternatives
                : [];

    return raw
        .map((v) => {
            if (typeof v === "string") return v.trim();

            if (isRecord(v)) {
                return (
                    safeString(v.text) ??
                    safeString(v.label) ??
                    safeString(v.value) ??
                    safeString(v.title) ??
                    ""
                );
            }

            return "";
        })
        .filter(Boolean);
}

function normalizeAnswerString(v: unknown): string {
    if (typeof v === "boolean") return v ? "true" : "false";
    if (typeof v === "string") return v.trim().toLowerCase();
    return "";
}

function evaluateAnswers(tasks: Task[], answers: Record<string, string | boolean>) {
    let score = 0;
    let maxScore = 0;
    let correctCount = 0;

    const byTask: Record<string, { correct?: boolean }> = {};

    tasks.forEach((t, idx) => {
        const stableId = getStableTaskId(t, idx);
        const type = taskType(t);
        const answer = answers[stableId];

        if (type === "open") {
            byTask[stableId] = {};
            return;
        }

        maxScore += 1;

        const expectedRaw =
            typeof t.correctAnswer !== "undefined"
                ? t.correctAnswer
                : typeof t.answer !== "undefined"
                    ? t.answer
                    : typeof t.isTrue !== "undefined"
                        ? t.isTrue
                        : null;

        let correct = false;

        if (type === "truefalse") {
            const expected =
                typeof expectedRaw === "boolean"
                    ? expectedRaw
                    : normalizeAnswerString(expectedRaw) === "true";

            const actual =
                typeof answer === "boolean"
                    ? answer
                    : normalizeAnswerString(answer) === "true";

            correct = expected === actual;
        } else {
            const expected = normalizeAnswerString(expectedRaw);
            const actual = normalizeAnswerString(answer);
            correct = !!expected && expected === actual;
        }

        byTask[stableId] = { correct };

        if (correct) {
            score += 1;
            correctCount += 1;
        }
    });

    return {
        score,
        maxScore,
        correctCount,
        totalAutoGraded: maxScore,
        byTask,
    };
}

function firstLongText(d: AssignmentDoc): string {
    return (
        safeString(d.sourceText) ??
        safeString(d.text) ??
        safeString(d.description) ??
        safeString(d.instructions) ??
        ""
    );
}

function pickImageUrl(a: AssignmentDoc): string | null {
    return safeString(a.coverImageUrl) ?? safeString(a.imageUrl);
}

function renderAutoSummary(auto: SubmissionDoc["auto"]): string | null {
    if (!auto) return null;

    if (
        typeof auto.score === "number" &&
        typeof auto.maxScore === "number" &&
        auto.maxScore > 0
    ) {
        return `${auto.score} av ${auto.maxScore}`;
    }

    if (
        typeof auto.correctCount === "number" &&
        typeof auto.totalAutoGraded === "number" &&
        auto.totalAutoGraded > 0
    ) {
        return `${auto.correctCount} av ${auto.totalAutoGraded}`;
    }

    return null;
}

function renderStars(value: unknown) {
    const n =
        typeof value === "number" && Number.isFinite(value)
            ? Math.max(0, Math.min(5, Math.round(value)))
            : 0;

    if (n <= 0) return null;
    return "⭐".repeat(n);
}

function Badge({
    children,
    tone = "neutral",
}: {
    children: React.ReactNode;
    tone?: "neutral" | "good";
}) {
    const cls =
        tone === "good"
            ? "border-green-200 bg-green-100 text-green-900"
            : "border-slate-200 bg-slate-100 text-slate-700";

    return (
        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${cls}`}>
            {children}
        </span>
    );
}

function AudioSpinner() {
    return (
        <div className="inline-flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-sky-300 border-t-sky-700" />
            <span>Laster lyd…</span>
        </div>
    );
}

export default function ChildAssignmentPage() {
    const { spaceId, assignmentId } = useParams<{
        spaceId: string;
        assignmentId: string;
    }>();

    const audioRef = useRef<HTMLAudioElement | null>(null);

    const [user, setUser] = useState<User | null>(null);
    const [space, setSpace] = useState<SpaceDoc | null>(null);
    const [assignment, setAssignment] = useState<AssignmentDoc | null>(null);
    const [submission, setSubmission] = useState<SubmissionDoc | null>(null);
    const [parentReview, setParentReview] = useState<ParentReviewDoc | null>(null);

    const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
    const [childSelfReport, setChildSelfReport] = useState<ChildSelfReport>({});
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [celebrate, setCelebrate] = useState(false);
    const [feedbackOpen, setFeedbackOpen] = useState(false);

    const [ttsBusy, setTtsBusy] = useState<AudioMode | null>(null);
    const [activeAudioLabel, setActiveAudioLabel] = useState<string | null>(null);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [activeSentence, setActiveSentence] = useState<number | null>(null);

    const backHref = `/child/spaces/${spaceId}`;

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
                (snap) => setSpace(snap.exists() ? (snap.data() as SpaceDoc) : null),
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

            unsub = onSnapshot(
                doc(dbx, "spaces", spaceId, "lessons", assignmentId),
                (snap) => setAssignment(snap.exists() ? (snap.data() as AssignmentDoc) : null),
                (e) => setErr(e.message)
            );
        } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : "Could not read assignment.");
        }

        return () => unsub?.();
    }, [spaceId, assignmentId]);

    useEffect(() => {
        if (!user?.uid) return;

        let unsub: (() => void) | null = null;

        try {
            const dbx = requireDb(db);
            const submissionId = buildParentSubmissionId(spaceId, assignmentId, user.uid);

            unsub = onSnapshot(
                doc(dbx, "spaces", spaceId, "lessons", assignmentId, "submissions", submissionId),
                (snap) => {
                    if (!snap.exists()) {
                        setSubmission(null);
                        return;
                    }

                    const data = snap.data() as SubmissionDoc;
                    setSubmission(data);

                    if (isRecord(data.answers)) {
                        const next: Record<string, string | boolean> = {};

                        for (const [k, v] of Object.entries(data.answers)) {
                            if (typeof v === "string" || typeof v === "boolean") next[k] = v;
                        }

                        setAnswers(next);
                    }
                    if (isRecord(data.childSelfReport)) {
                        setChildSelfReport({
                            readSilently: data.childSelfReport.readSilently === true,
                            readAloud: data.childSelfReport.readAloud === true,
                            completedTasks: data.childSelfReport.completedTasks === true,
                            feltEasy: data.childSelfReport.feltEasy === true,
                            feltHard: data.childSelfReport.feltHard === true,
                            comment: safeString(data.childSelfReport.comment) ?? "",
                        });
                    }
                }
            );
        } catch {
            // ignore
        }

        return () => unsub?.();
    }, [spaceId, assignmentId, user?.uid]);

    useEffect(() => {
        if (!user?.uid) return;

        let unsub: (() => void) | null = null;

        try {
            const dbx = requireDb(db);

            unsub = onSnapshot(
                doc(dbx, "spaces", spaceId, "lessons", assignmentId, "parentReviews", user.uid),
                (snap) => {
                    setParentReview(snap.exists() ? (snap.data() as ParentReviewDoc) : null);
                }
            );
        } catch {
            // ignore
        }

        return () => unsub?.();
    }, [spaceId, assignmentId, user?.uid]);

    useEffect(() => {
        const a = audioRef.current;
        if (!a) return;

        a.playbackRate = playbackRate;
    }, [playbackRate]);

    const tasks = useMemo(() => {
        return safeTasksArray(assignment?.tasks).slice().sort(sortTasksByOrder);
    }, [assignment?.tasks]);

    const sourceText = assignment ? firstLongText(assignment) : "";

    const sentences = useMemo(() => {
        return sourceText
            .split(/(?<=[.!?])\s+/)
            .map((s) => s.trim())
            .filter(Boolean);
    }, [sourceText]);

    const img = assignment ? pickImageUrl(assignment) : null;
    const title = safeString(assignment?.title) ?? "Oppgave";
    const spaceTitle = safeString((space as Record<string, unknown> | null)?.title) ?? "Mitt rom";
    const autoSummary = renderAutoSummary(submission?.auto);
    const ttsLang = toTtsLang(assignment?.language);
    const submitted = submission?.status === "submitted";

    const hasFeedback = !!(
        submitted ||
        autoSummary ||
        submission?.aiFeedback ||
        parentReview?.comment ||
        parentReview?.stars
    );

    function stopAudio() {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            audioRef.current = null;
        }

        setIsPlaying(false);
        setCurrentTime(0);
        setDuration(0);
        setActiveAudioLabel(null);
        setActiveSentence(null);
    }

    function pauseAudio() {
        audioRef.current?.pause();
    }

    function resumeAudio() {
        audioRef.current?.play().catch(() => { });
    }

    async function playTTS(text: string, mode: AudioMode, label: string) {
        const useFullPlayer = mode === "text" || mode === "feedback";
        const clean = text.trim();
        if (!clean) return;

        setTtsBusy(mode);
        setMsg(null);

        try {
            stopAudio();

            const res = await fetch("/api/tts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    lessonId: assignmentId,
                    lang: ttsLang,
                    text: clean,
                    voice: "marin",
                }),
            });

            const raw = await res.text();

            let data: unknown = {};
            try {
                data = raw ? JSON.parse(raw) : {};
            } catch {
                throw new Error(`TTS API returned non-JSON (HTTP ${res.status})`);
            }

            const d = data as { error?: unknown; url?: unknown };

            if (!res.ok) throw new Error(d?.error ? String(d.error) : `TTS error ${res.status}`);

            const url = String(d.url ?? "").trim();
            if (!url) throw new Error("TTS returned no url");

            const a = new Audio(url);
            a.playbackRate = playbackRate;
            audioRef.current = a;

            if (!useFullPlayer) {
                await a.play();
                setTtsBusy(null);
                return;
            }

            setActiveAudioLabel(label);
            setCurrentTime(0);
            setDuration(0);

            const onPlay = () => setIsPlaying(true);
            const onPause = () => setIsPlaying(false);
            const onTime = () => {
                setCurrentTime(a.currentTime || 0);

                if (mode === "text" && a.duration && sentences.length > 0) {
                    const progress = a.currentTime / a.duration;
                    const adjustedProgress = Math.min(1, Math.max(0, progress + 0.02));
                    const idx = Math.min(
                        sentences.length - 1,
                        Math.floor(adjustedProgress * sentences.length)
                    );

                    setActiveSentence(idx);
                }
            };
            const onMeta = () => setDuration(a.duration || 0);
            const onEnded = () => {
                setIsPlaying(false);
                setCurrentTime(a.duration || 0);
            };

            a.addEventListener("play", onPlay);
            a.addEventListener("pause", onPause);
            a.addEventListener("timeupdate", onTime);
            a.addEventListener("loadedmetadata", onMeta);
            a.addEventListener("ended", onEnded);

            await a.play();
        } catch (e: unknown) {
            setMsg(e instanceof Error ? e.message : "Kunne ikke spille lyd.");
            stopAudio();
        } finally {
            setTtsBusy(null);
        }
    }

    function setAnswer(taskId: string, value: string | boolean) {
        setAnswers((prev) => ({ ...prev, [taskId]: value }));
    }

    async function submitAssignment() {
        if (!assignment || !user?.uid) {
            setMsg("En voksen må være innlogget.");
            return;
        }

        setSaving(true);
        setMsg(null);
        setErr(null);

        try {
            const dbx = requireDb(db);
            const auto = evaluateAnswers(tasks, answers);
            const submissionId = buildParentSubmissionId(spaceId, assignmentId, user.uid);

            const nestedRef = doc(
                dbx,
                "spaces",
                spaceId,
                "lessons",
                assignmentId,
                "submissions",
                submissionId
            );

            const indexRef = doc(dbx, "spaceSubmissions", submissionId);

            const payload = {
                spaceId,
                assignmentId,
                uid: user.uid,
                role: "parent",
                isParentFlow: true,
                isChildPortal: true,
                title,
                status: "submitted",
                answers,
                childSelfReport,
                auto,
                aiFeedback: submission?.aiFeedback ?? null,
                submittedAt: Date.now(),
                updatedAt: serverTimestamp(),
                createdAt: serverTimestamp(),
            };

            const batch = writeBatch(dbx);
            batch.set(nestedRef, payload, { merge: true });
            batch.set(indexRef, payload, { merge: true });
            await batch.commit();

            setCelebrate(true);
            setFeedbackOpen(true);
            setTimeout(() => setCelebrate(false), 3500);
            setMsg("Bra jobbet! Oppgaven er levert.");
        } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : "Kunne ikke lagre oppgaven.");
        } finally {
            setSaving(false);
        }
    }

    if (err) {
        return (
            <main className="mx-auto max-w-3xl p-4">
                <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
                    <div className="text-5xl">😕</div>
                    <h1 className="mt-4 text-2xl font-black text-amber-900">Oi, noe gikk galt</h1>
                    <div className="mt-3 text-base leading-7 text-amber-800">
                        Vi klarte ikke å åpne oppgaven akkurat nå.
                    </div>

                    <Link
                        href={backHref}
                        className="mt-5 inline-flex rounded-2xl bg-amber-500 px-5 py-3 text-sm font-black text-white no-underline"
                    >
                        Tilbake til rommet
                    </Link>

                    {process.env.NODE_ENV === "development" ? (
                        <div className="mt-5 whitespace-pre-wrap rounded-2xl bg-white/70 p-3 text-xs text-amber-900">
                            {err}
                        </div>
                    ) : null}
                </section>
            </main>
        );
    }

    if (!assignment) {
        return <main className="p-4 text-sm text-slate-600">Laster oppgave…</main>;
    }

    return (
        <main className="mx-auto w-full max-w-4xl space-y-4 pb-40">
            {celebrate ? (
                <section className="animate-pulse rounded-3xl border border-green-200 bg-gradient-to-br from-green-100 to-emerald-50 p-8 text-center shadow-lg">
                    <div className="text-6xl">🎉</div>
                    <h2 className="mt-4 text-4xl font-black text-green-900">Bra jobbet!</h2>
                    <div className="mt-3 text-lg font-bold text-green-800">
                        Oppgaven er levert.
                    </div>
                </section>
            ) : null}

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h1 className="break-words text-3xl font-black text-slate-900">
                            {title}
                        </h1>

                        <div className="mt-4 flex flex-wrap gap-2">
                            {spaceTitle ? <Badge>{spaceTitle}</Badge> : null}
                        </div>
                    </div>

                    <Link
                        href={backHref}
                        className="inline-flex rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 no-underline shadow-sm hover:bg-slate-50"
                    >
                        ← Tilbake
                    </Link>
                </div>
            </section>

            {hasFeedback ? (
                <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
                    <button
                        type="button"
                        onClick={() => setFeedbackOpen((v) => !v)}
                        className="flex w-full items-center justify-between gap-3 text-left"
                    >
                        <div>
                            <div className="text-sm font-black uppercase tracking-wide text-emerald-700">
                                Nytt fra oppgaven
                            </div>
                            <div className="mt-1 text-2xl font-black text-emerald-950">
                                Du har fått resultat og tilbakemelding ✨
                            </div>
                            <div className="mt-1 text-sm font-semibold text-emerald-800">
                                Trykk her for å se resultat, stjerner og hilsen hjemmefra.
                            </div>
                        </div>

                        <div className="rounded-full bg-white px-4 py-2 text-xl shadow-sm">
                            {feedbackOpen ? "▲" : "▼"}
                        </div>
                    </button>

                    {feedbackOpen ? (
                        <div className="mt-5 space-y-4">
                            {submitted ? (
                                <div className="rounded-2xl border border-sky-200 bg-white p-4">
                                    <div className="text-sm font-black text-sky-700">
                                        Oppgaven er levert
                                    </div>
                                    <div className="mt-1 text-base font-semibold leading-7 text-slate-800">
                                        Bra jobbet! Du har sendt inn oppgaven.
                                    </div>
                                </div>
                            ) : null}

                            {autoSummary ? (
                                <div className="rounded-2xl border border-green-200 bg-white p-4">
                                    <div className="text-sm font-black text-green-700">
                                        Resultat
                                    </div>
                                    <div className="mt-1 text-xl font-black text-green-900">
                                        Du klarte {autoSummary}
                                    </div>
                                    <div className="mt-1 text-base font-semibold leading-7 text-slate-800">
                                        Se på oppgavene under. Grønne svar er riktige. Gule svar kan du tenke litt mer på.
                                    </div>
                                </div>
                            ) : null}

                            {submission?.aiFeedback ? (
                                <div className="rounded-2xl border border-emerald-200 bg-white p-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="text-sm font-black text-emerald-700">
                                            Tilbakemelding
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() =>
                                                playTTS(submission.aiFeedback ?? "", "feedback", "Tilbakemelding")
                                            }
                                            disabled={ttsBusy === "feedback"}
                                            className="rounded-2xl bg-sky-100 px-4 py-3 text-sm font-black text-sky-900 hover:bg-sky-200 disabled:opacity-60"
                                        >
                                            {ttsBusy === "feedback" ? <AudioSpinner /> : "🔊 Les"}
                                        </button>
                                    </div>

                                    <div className="mt-3 whitespace-pre-wrap text-base font-semibold leading-8 text-emerald-950">
                                        {submission.aiFeedback}
                                    </div>
                                </div>
                            ) : null}

                            {(parentReview?.comment || parentReview?.stars) ? (
                                <div className="rounded-2xl border border-yellow-200 bg-white p-4">
                                    <div className="text-sm font-black text-yellow-700">
                                        Hilsen hjemmefra 💛
                                    </div>

                                    {renderStars(parentReview?.stars) ? (
                                        <div className="mt-2 text-2xl">
                                            {renderStars(parentReview?.stars)}
                                        </div>
                                    ) : null}

                                    {parentReview?.comment ? (
                                        <div className="mt-2 whitespace-pre-wrap text-base font-semibold leading-7 text-slate-800">
                                            {parentReview.comment}
                                        </div>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                </section>
            ) : null}

            {img ? (
                <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img} alt={title} className="h-auto w-full object-cover" />
                </section>
            ) : null}

            {sourceText ? (
                <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
                    <div className="sticky top-3 z-10 mb-5 rounded-3xl border border-sky-200 bg-sky-50/95 p-4 shadow-sm backdrop-blur">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <h2 className="text-2xl font-black text-slate-900">Les først</h2>

                            <button
                                type="button"
                                onClick={() => playTTS(sourceText, "text", "Teksten")}
                                disabled={ttsBusy === "text"}
                                className="rounded-2xl bg-sky-200 px-5 py-3 text-base font-black text-sky-950 transition hover:scale-[1.03] hover:bg-sky-300 disabled:opacity-60"
                            >
                                {ttsBusy === "text" ? (
                                    <AudioSpinner />
                                ) : (
                                    <span>🔊 Spill av teksten</span>
                                )}
                            </button>
                        </div>
                    </div>

                    <div className="text-lg leading-9 text-slate-800">
                        {sentences.map((sentence, i) => (
                            <span
                                key={i}
                                className={[
                                    "rounded-xl px-1 py-0.5 transition-all duration-300",
                                    i === activeSentence ? "bg-yellow-200 text-slate-900" : "",
                                ].join(" ")}
                            >
                                {sentence}{" "}
                            </span>
                        ))}
                    </div>
                </section>
            ) : null}

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
                <h2 className="text-2xl font-black text-slate-900">Oppgaver</h2>

                {tasks.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-600">Det er ingen oppgaver her ennå.</p>
                ) : (
                    <div className="mt-5 grid gap-5">
                        {tasks.map((task, idx) => {
                            const stableId = getStableTaskId(task, idx);
                            const type = taskType(task);
                            const prompt = taskPrompt(task);
                            const options = taskOptions(task);
                            const current = answers[stableId];
                            const taskAuto = submission?.auto?.byTask?.[stableId];
                            const taskNumber = typeof task.order === "number" ? task.order : idx + 1;

                            const taskDoneClass =
                                typeof taskAuto?.correct === "boolean"
                                    ? taskAuto.correct
                                        ? "border-green-200 bg-green-50"
                                        : "border-yellow-200 bg-yellow-50"
                                    : "border-slate-200 bg-white";

                            return (
                                <div
                                    key={stableId}
                                    className={`rounded-3xl border p-5 shadow-sm ${taskDoneClass}`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="text-xs font-black uppercase tracking-wide text-slate-400">
                                            Oppgave {taskNumber}
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => playTTS(prompt, "task", `Oppgave ${taskNumber}`)}
                                            disabled={ttsBusy === "task" || !prompt}
                                            className="rounded-xl bg-sky-100 px-3 py-2 text-xs font-black text-sky-900 hover:bg-sky-200 disabled:opacity-60"
                                        >
                                            {ttsBusy === "task" ? <AudioSpinner /> : "🔊 Les"}
                                        </button>
                                    </div>

                                    <div className="mt-3 whitespace-pre-wrap text-lg font-bold leading-8 text-slate-900">
                                        {prompt}
                                    </div>

                                    {type === "mcq" && options.length > 0 ? (
                                        <div className="mt-5 grid gap-3">
                                            {options.map((opt, i) => {
                                                const checked = current === opt;

                                                return (
                                                    <label
                                                        key={`${stableId}-${i}`}
                                                        className={[
                                                            "flex cursor-pointer items-start gap-3 rounded-2xl border p-4",
                                                            checked
                                                                ? typeof taskAuto?.correct === "boolean"
                                                                    ? taskAuto.correct
                                                                        ? "border-green-300 bg-green-100"
                                                                        : "border-yellow-300 bg-yellow-100"
                                                                    : "border-green-300 bg-green-50"
                                                                : "border-slate-200 bg-white hover:bg-slate-50",
                                                        ].join(" ")}
                                                    >
                                                        <input
                                                            type="radio"
                                                            name={stableId}
                                                            checked={checked}
                                                            onChange={() => setAnswer(stableId, opt)}
                                                            className="mt-1"
                                                        />

                                                        <div className="flex w-full items-center justify-between gap-3">
                                                            <span className="text-base font-semibold text-slate-800">
                                                                {opt}
                                                            </span>

                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    playTTS(opt, "option", `Svaralternativ ${i + 1}`);
                                                                }}
                                                                disabled={ttsBusy === "option"}
                                                                className="rounded-xl bg-sky-100 px-3 py-2 text-xs font-black text-sky-900 hover:bg-sky-200 disabled:opacity-60"
                                                            >
                                                                {ttsBusy === "option" ? <AudioSpinner /> : "🔊"}
                                                            </button>
                                                        </div>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    ) : null}

                                    {type === "truefalse" ? (
                                        <div className="mt-5 flex flex-wrap gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setAnswer(stableId, true)}
                                                className={[
                                                    "rounded-2xl border px-6 py-4 text-base font-black",
                                                    current === true
                                                        ? typeof taskAuto?.correct === "boolean"
                                                            ? taskAuto.correct
                                                                ? "border-green-300 bg-green-600 text-white"
                                                                : "border-yellow-300 bg-yellow-500 text-white"
                                                            : "border-green-300 bg-green-600 text-white"
                                                        : "border-slate-200 bg-white text-slate-800",
                                                ].join(" ")}
                                            >
                                                Sant
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => setAnswer(stableId, false)}
                                                className={[
                                                    "rounded-2xl border px-6 py-4 text-base font-black",
                                                    current === false
                                                        ? typeof taskAuto?.correct === "boolean"
                                                            ? taskAuto.correct
                                                                ? "border-green-300 bg-green-600 text-white"
                                                                : "border-yellow-300 bg-yellow-500 text-white"
                                                            : "border-green-300 bg-green-600 text-white"
                                                        : "border-slate-200 bg-white text-slate-800",
                                                ].join(" ")}
                                            >
                                                Usant
                                            </button>
                                        </div>
                                    ) : null}

                                    {type === "open" ? (
                                        <textarea
                                            value={typeof current === "string" ? current : ""}
                                            onChange={(e) => setAnswer(stableId, e.target.value)}
                                            rows={6}
                                            placeholder="Skriv svaret ditt her..."
                                            className="mt-5 w-full rounded-3xl border border-slate-200 bg-white p-5 text-base leading-8 outline-none focus:border-green-400"
                                        />
                                    ) : null}

                                    <div className="mt-4 flex flex-wrap gap-2">
                                        {typeof current !== "undefined" && current !== "" ? (
                                            <Badge tone="good">Svar lagret</Badge>
                                        ) : (
                                            <Badge>Ikke svart ennå</Badge>
                                        )}

                                        {typeof taskAuto?.correct === "boolean" ? (
                                            <div
                                                className={[
                                                    "mt-2 w-full rounded-2xl border px-4 py-3 text-sm font-black",
                                                    taskAuto.correct
                                                        ? "border-green-200 bg-green-100 text-green-900"
                                                        : "border-yellow-200 bg-yellow-100 text-yellow-900",
                                                ].join(" ")}
                                            >
                                                {taskAuto.correct
                                                    ? "😊 Dette klarte du!"
                                                    : "🤔 Nesten! Prøv en gang til."}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>

            <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm sm:p-7">
                <h2 className="text-2xl font-black text-emerald-950">
                    Før du leverer
                </h2>

                <p className="mt-2 text-sm font-semibold leading-6 text-emerald-900">
                    Kryss av det du har gjort. Dette hjelper den voksne å gi deg bedre tilbakemelding.
                </p>

                <div className="mt-5 grid gap-3">
                    {[
                        ["readSilently", "Jeg har lest teksten stille."],
                        ["readAloud", "Jeg har lest teksten høyt."],
                        ["completedTasks", "Jeg har gjort alle oppgavene."],
                        ["feltEasy", "Dette var lett."],
                        ["feltHard", "Dette var vanskelig."],
                    ].map(([key, label]) => (
                        <label
                            key={key}
                            className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-base font-bold text-slate-800"
                        >
                            <input
                                type="checkbox"
                                disabled={submitted}
                                checked={Boolean(childSelfReport[key as keyof ChildSelfReport])}
                                onChange={() =>
                                    setChildSelfReport((prev) => ({
                                        ...prev,
                                        [key]: !prev[key as keyof ChildSelfReport],
                                    }))
                                }
                            />
                            {label}
                        </label>
                    ))}
                </div>

                <label className="mt-5 block text-sm font-black text-emerald-950">
                    Vil du skrive noe til den voksne?
                </label>

                <textarea
                    disabled={submitted}
                    value={childSelfReport.comment ?? ""}
                    onChange={(e) =>
                        setChildSelfReport((prev) => ({
                            ...prev,
                            comment: e.target.value,
                        }))
                    }
                    placeholder="Skriv her hvis du vil..."
                    rows={4}
                    className="mt-2 w-full rounded-2xl border border-emerald-200 bg-white p-4 text-base leading-7 text-slate-900 outline-none focus:border-emerald-500 disabled:bg-slate-100"
                />
            </section>

            <section className="sticky bottom-0 z-20 rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm font-semibold text-slate-600">
                        {msg ?? (submitted ? "Oppgaven er levert." : "Når du er ferdig, kan du levere oppgaven.")}
                    </div>

                    <button
                        type="button"
                        onClick={submitAssignment}
                        disabled={saving || submitted}
                        className={[
                            "inline-flex items-center justify-center rounded-2xl px-6 py-4 text-base font-black text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-90",
                            submitted
                                ? "bg-sky-600"
                                : "bg-green-600 hover:bg-green-500",
                        ].join(" ")}
                    >
                        {saving ? "Lagrer..." : submitted ? "Du har levert" : "Lever oppgave"}
                    </button>
                </div>
            </section>

            {audioRef.current ? (
                <div className="fixed bottom-24 left-1/2 z-30 w-[calc(100%-24px)] max-w-4xl -translate-x-1/2 rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm font-black text-slate-700">
                            🔊 Spiller av: {activeAudioLabel ?? "Lyd"}
                        </div>

                        <div className="flex items-center gap-3 rounded-2xl bg-slate-100 px-4 py-2">
                            <div className="text-xs font-black text-slate-500">🐢</div>

                            <input
                                type="range"
                                min="0.75"
                                max="1.5"
                                step="0.05"
                                value={playbackRate}
                                onChange={(e) => setPlaybackRate(Number(e.target.value))}
                                className="w-28"
                            />

                            <div className="text-xs font-black text-slate-500">🐇</div>

                            <div className="min-w-[48px] text-center text-xs font-black text-slate-700">
                                {playbackRate.toFixed(2)}x
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={isPlaying ? pauseAudio : resumeAudio}
                            className="rounded-2xl bg-yellow-100 px-5 py-3 text-base font-black text-yellow-900"
                        >
                            {isPlaying ? "⏸ Pause" : "▶ Fortsett"}
                        </button>

                        <button
                            type="button"
                            onClick={stopAudio}
                            className="rounded-2xl bg-rose-100 px-5 py-3 text-base font-black text-rose-900"
                        >
                            ⏹ Stopp
                        </button>

                        <div className="flex min-w-[220px] flex-1 items-center gap-2">
                            <span className="w-10 text-xs font-bold text-slate-500">
                                {fmtTime(currentTime)}
                            </span>

                            <input
                                type="range"
                                min={0}
                                max={Math.max(0.01, duration || 0)}
                                step={0.05}
                                value={Math.min(currentTime, duration || currentTime)}
                                onChange={(e) => {
                                    const a = audioRef.current;
                                    if (!a) return;
                                    const v = Number(e.target.value);
                                    a.currentTime = v;
                                    setCurrentTime(v);
                                }}
                                className="w-full"
                            />

                            <span className="w-10 text-xs font-bold text-slate-500">
                                {fmtTime(duration)}
                            </span>
                        </div>
                    </div>
                </div>
            ) : null}
        </main>
    );
}