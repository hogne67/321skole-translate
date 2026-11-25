// app/[locale]/child/spaces/[spaceId]/assignments/[assignmentId]/page.tsx
"use client";
import { speechHeaders } from "@/lib/audio/headers.client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { db } from "@/lib/firebase";
import { getStudentSpaceMembership } from "@/lib/studentSpaceMembership";
import {
    doc,
    onSnapshot,
    runTransaction,
    serverTimestamp,
    type Firestore,
} from "firebase/firestore";
import { useChildRoomAccess } from "@/components/child/ChildRoomAccess";
import { childRoomHref, FAMILY_GREETING_ID, familyDeviceApi, type FamilyAssignmentData, type FamilyRoomSummary } from "@/lib/familyDevice";
import { hasParentFeedback } from "@/lib/parentFeedback";
import { isParentSpaceKind } from "@/lib/spaceSharing";
import { getReadingPracticeStage, readingPracticeSpokenText } from "@/lib/a1start/readingPracticeText";
import { showsReadingPracticeWordDivisions } from "@/lib/a1start/readingPractice";
import { activeLessonSentenceIndex, readLessonSentenceStarts, splitLessonSentences } from "@/lib/audio/lessonSentenceTiming";
import ReadingPracticeText, { ReadingPracticeWordList } from "@/components/student/ReadingPracticeText";

import {
    buildParentSubmissionId, evaluateAnswers, firstLongText, getStableTaskId, isDelivered,
    safeString, safeTasksArray, sortTasksByOrder, taskOptions, taskPrompt, taskType,
    type AssignmentDoc, type ChildSelfReport, type ParentReviewDoc, type SubmissionDoc,
} from "@/lib/familyAssignments";

type TtsLang = "no" | "en" | "pt-BR";
type AudioMode = "text" | "task" | "option" | "feedback";

function requireDb(x: Firestore | null | undefined): Firestore {
    if (!x) throw new Error("Firestore is not initialized.");
    return x;
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

function AudioSpinner({ label }: { label: string }) {
    return (
        <div className="inline-flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-sky-300 border-t-sky-700" />
            <span>{label}</span>
        </div>
    );
}

export default function ChildAssignmentPage() {
    const { spaceId, assignmentId } = useParams<{
        spaceId: string;
        assignmentId: string;
    }>();
    const t = useTranslations("childAssignment");
    const access = useChildRoomAccess();
    const user = access.mode === "parent" ? access.user : null;
    const deviceApi = access.mode === "device"
        ? familyDeviceApi(spaceId) + "/assignments/" + encodeURIComponent(assignmentId)
        : null;
    const refreshRoom = access.mode === "device" ? access.refreshRoom : null;

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const greetingRef = useRef<HTMLElement | null>(null);
    const speechRequest = useRef<AbortController | null>(null);
    const deviceReadVersion = useRef(0);

    const [participantId, setParticipantId] = useState<string | null>(null);
    const [space, setSpace] = useState<FamilyRoomSummary | null>(null);
    const [assignment, setAssignment] = useState<AssignmentDoc | null>(null);
    const [submission, setSubmission] = useState<SubmissionDoc | null>(null);
    const [parentReview, setParentReview] = useState<ParentReviewDoc | null>(null);
    const [unreadFeedbackRevision, setUnreadFeedbackRevision] = useState<string | null>(null);

    const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
    const [childSelfReport, setChildSelfReport] = useState<ChildSelfReport>({});
    const [submissionReady, setSubmissionReady] = useState(false);
    const [revision, setRevision] = useState<string | null>(null);
    const [deviceRefresh, setDeviceRefresh] = useState(0);
    const [savingStatus, setSavingStatus] = useState<"draft" | "submitted" | null>(null);
    const saving = savingStatus !== null;
    const savingRef = useRef(false);
    const hasUnsavedEdits = useRef(false);
    const [msg, setMsg] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [celebrate, setCelebrate] = useState(false);
    const [feedbackChoice, setFeedbackChoice] = useState<boolean | null>(null);

    const [ttsBusy, setTtsBusy] = useState<AudioMode | null>(null);
    const [activeAudioLabel, setActiveAudioLabel] = useState<string | null>(null);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [activeSentence, setActiveSentence] = useState<number | null>(null);

    const backHref = childRoomHref(spaceId, undefined, access.mode === "parent");

    const applySubmission = useCallback((data: SubmissionDoc | null) => {
        setSubmissionReady(true);
        setSubmission(data);
        if (hasUnsavedEdits.current && !isDelivered(data?.status)) return;
        setAnswers(Object.fromEntries(Object.entries(data?.answers ?? {})
            .filter(([, value]) => typeof value === "string" || typeof value === "boolean")));
        setChildSelfReport(data?.childSelfReport ?? {});
    }, []);

    const applyDeviceView = useCallback((view: FamilyAssignmentData) => {
        setSpace(view.room);
        setAssignment(view.assignment);
        setParentReview(view.parentReview);
        setUnreadFeedbackRevision(view.unreadFeedbackRevision);
        if (!hasUnsavedEdits.current || isDelivered(view.submission?.status)) setRevision(view.revision);
        applySubmission(view.submission);
        setErr(null);
    }, [applySubmission]);

    useEffect(() => {
        if (!deviceApi) return;
        let controller: AbortController | null = null;
        async function load() {
            if (!deviceApi || savingRef.current) return;
            controller?.abort();
            const request = new AbortController();
            controller = request;
            const version = ++deviceReadVersion.current;
            try {
                const response = await fetch(deviceApi, { cache: "no-store", signal: request.signal });
                if (!response.ok) throw new Error(t(response.status === 401 ? "errors.readRoom" : "errors.readAssignment"));
                const view: FamilyAssignmentData = await response.json();
                if (!request.signal.aborted && version === deviceReadVersion.current) applyDeviceView(view);
            } catch (error) {
                if (!request.signal.aborted && version === deviceReadVersion.current) {
                    setErr(error instanceof Error ? error.message : t("errors.readAssignment"));
                }
            }
        }
        void load();
        window.addEventListener("focus", load);
        return () => {
            controller?.abort();
            window.removeEventListener("focus", load);
        };
    }, [applyDeviceView, deviceApi, deviceRefresh, t]);

    useEffect(() => {
        if (!user?.uid) {
            setParticipantId(null);
            return;
        }

        let alive = true;

        const run = async () => {
            try {
                const dbx = requireDb(db);
                const membership = await getStudentSpaceMembership(dbx, spaceId, user.uid);
                if (!alive) return;
                setParticipantId(membership.participantId || user.uid);
            } catch {
                if (alive) setParticipantId(user.uid);
            }
        };

        void run();

        return () => {
            alive = false;
        };
    }, [spaceId, user?.uid]);

    useEffect(() => {
        if (!user) return;
        let unsub: (() => void) | null = null;

        try {
            const dbx = requireDb(db);

            unsub = onSnapshot(
                doc(dbx, "spaces", spaceId),
                (snap) => {
                    const room = snap.data();
                    if (room && isParentSpaceKind(room.kind) && !room.deletedAt) setSpace(room as FamilyRoomSummary);
                    else setErr(t("errors.readRoom"));
                },
                (e) => setErr(e.message)
            );
        } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : t("errors.readRoom"));
        }

        return () => unsub?.();
    }, [spaceId, t, user]);

    useEffect(() => {
        if (!user) return;
        let unsub: (() => void) | null = null;

        try {
            const dbx = requireDb(db);

            unsub = onSnapshot(
                doc(dbx, "spaces", spaceId, "lessons", assignmentId),
                (snap) => {
                    const data = snap.data();
                    if (data && data.archived !== true && data.status !== "archived") setAssignment(data as AssignmentDoc);
                    else setErr(t("errors.readAssignment"));
                },
                (e) => setErr(e.message)
            );
        } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : t("errors.readAssignment"));
        }

        return () => unsub?.();
    }, [spaceId, assignmentId, t, user]);

    useEffect(() => {
        if (!user?.uid || !participantId) return;

        let unsub: (() => void) | null = null;

        try {
            const dbx = requireDb(db);
            const submissionId = buildParentSubmissionId(spaceId, assignmentId, participantId);

            unsub = onSnapshot(
                doc(dbx, "spaces", spaceId, "lessons", assignmentId, "submissions", submissionId),
                (snap) => applySubmission(snap.exists() ? snap.data() as SubmissionDoc : null),
                () => setErr(t("errors.readAssignment"))
            );
        } catch {
            // ignore
        }

        return () => unsub?.();
    }, [spaceId, assignmentId, user?.uid, participantId, t, applySubmission]);

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

    useEffect(() => () => {
        speechRequest.current?.abort();
        audioRef.current?.pause();
    }, []);

    const tasks = useMemo(() => {
        return safeTasksArray(assignment?.tasks).slice().sort(sortTasksByOrder);
    }, [assignment?.tasks]);

    const sourceText = assignment ? firstLongText(assignment) : "";
    const readingStage = getReadingPracticeStage(assignment?.textType ?? assignment?.texttype, assignment?.language);
    const showWordDivisions = showsReadingPracticeWordDivisions(readingStage);

    const sentences = useMemo(() => {
        if (readingStage) return splitLessonSentences(sourceText);
        return sourceText
            .split(/(?<=[.!?])\s+/)
            .map((s) => s.trim())
            .filter(Boolean);
    }, [readingStage, sourceText]);

    const img = assignment ? pickImageUrl(assignment) : null;
    const title = safeString(assignment?.title) ?? t("fallbacks.assignmentTitle");
    const spaceTitle = safeString((space as Record<string, unknown> | null)?.title) ?? t("fallbacks.spaceTitle");
    const autoSummary = renderAutoSummary(submission?.auto);
    const ttsLang = toTtsLang(assignment?.language);
    const submitted = isDelivered(submission?.status);
    const hasFamilyFeedback = hasParentFeedback(parentReview);
    const feedbackOpen = feedbackChoice ?? hasFamilyFeedback;

    useEffect(() => {
        if (!feedbackOpen || !hasFamilyFeedback || window.location.hash !== "#" + FAMILY_GREETING_ID) return;
        greetingRef.current?.scrollIntoView({ block: "start" });
        greetingRef.current?.focus({ preventScroll: true });
    }, [feedbackOpen, hasFamilyFeedback]);

    useEffect(() => {
        const greeting = greetingRef.current;
        if (!deviceApi || !refreshRoom || !unreadFeedbackRevision || !feedbackOpen || !greeting) return;
        let sending = false;
        let active = true;
        async function recordIfVisible() {
            if (!active || sending || document.hidden || !greeting) return;
            const bounds = greeting.getBoundingClientRect();
            if (bounds.top >= window.innerHeight || bounds.bottom <= 0) return;
            sending = true;
            try {
                const response = await fetch(deviceApi + "/feedback-read", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ revision: unreadFeedbackRevision }),
                    cache: "no-store",
                });
                if (response.ok) {
                    if (active) setUnreadFeedbackRevision((current) => current === unreadFeedbackRevision ? null : current);
                    refreshRoom?.();
                    return;
                }
                if (response.status === 409) {
                    if (active) setDeviceRefresh((value) => value + 1);
                    refreshRoom?.();
                }
            } catch {
                // A later visit can record the greeting if the connection is interrupted.
            }
            sending = false;
        }
        const observer = new IntersectionObserver(() => void recordIfVisible());
        observer.observe(greeting);
        document.addEventListener("visibilitychange", recordIfVisible);
        return () => {
            active = false;
            observer.disconnect();
            document.removeEventListener("visibilitychange", recordIfVisible);
        };
    }, [deviceApi, feedbackOpen, refreshRoom, unreadFeedbackRevision]);

    const hasFeedback = !!(
        submitted ||
        autoSummary ||
        submission?.aiFeedback ||
        hasFamilyFeedback
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

    async function playTTS(text: string, mode: AudioMode, label: string, taskIndex?: number, optionIndex?: number) {
        const useFullPlayer = mode === "text" || mode === "feedback";
        const readingPassage = mode === "text" && readingStage !== null;
        const clean = (readingPassage && showWordDivisions ? readingPracticeSpokenText(text) : text).trim();
        if (!clean) return;

        setTtsBusy(mode);
        setMsg(null);
        speechRequest.current?.abort();
        const request = new AbortController();
        speechRequest.current = request;

        try {
            stopAudio();

            const res = await fetch(deviceApi ? deviceApi + "/speech" : "/api/tts", {
                method: "POST",
                headers: deviceApi ? { "Content-Type": "application/json" } : await speechHeaders(),
                signal: request.signal,
                body: JSON.stringify(deviceApi ? { mode, taskIndex, optionIndex } : {
                    lessonId: assignmentId,
                    spaceId,
                    lang: ttsLang,
                    text: clean,
                    voice: "marin",
                    readingPassage: readingPassage || undefined,
                }),
            });

            const raw = await res.text();
            if (request.signal.aborted) return;

            let data: unknown = {};
            try {
                data = raw ? JSON.parse(raw) : {};
            } catch {
                throw new Error(`TTS API returned non-JSON (HTTP ${res.status})`);
            }

            const d = data as { error?: unknown; url?: unknown; sentenceStarts?: unknown };

            if (!res.ok) throw new Error(deviceApi ? t("errors.audioFailed") : d?.error ? String(d.error) : `TTS error ${res.status}`);

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
            const sentenceStarts = readingPassage ? readLessonSentenceStarts(d.sentenceStarts) : undefined;
            const timings = sentenceStarts?.length === sentences.length
                ? sentences.map((_, index) => ({ startRatio: index / sentences.length }))
                : [];

            const onPlay = () => setIsPlaying(true);
            const onPause = () => setIsPlaying(false);
            const onTime = () => {
                setCurrentTime(a.currentTime || 0);

                if (mode === "text" && a.duration && sentences.length > 0) {
                    if (timings.length > 0) {
                        setActiveSentence(activeLessonSentenceIndex(timings, a.currentTime, a.duration, sentenceStarts));
                        return;
                    }
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
            if (request.signal.aborted) return;
            setMsg(e instanceof Error ? e.message : t("errors.audioFailed"));
            stopAudio();
        } finally {
            if (speechRequest.current === request) setTtsBusy(null);
        }
    }

    function setAnswer(taskId: string, value: string | boolean) {
        if (savingRef.current || submitted) return;
        hasUnsavedEdits.current = true;
        setAnswers((prev) => ({ ...prev, [taskId]: value }));
    }

    async function saveParentPreview(status: "draft" | "submitted") {
        if (!user || !participantId) return false;
        const dbx = requireDb(db);
        const uid = user.uid;
        const submissionId = buildParentSubmissionId(spaceId, assignmentId, participantId);
        const nestedRef = doc(dbx, "spaces", spaceId, "lessons", assignmentId, "submissions", submissionId);
        const indexRef = doc(dbx, "spaceSubmissions", submissionId);

        return runTransaction(dbx, async (transaction) => {
            const current = await transaction.get(nestedRef);
            if (isDelivered(current.get("status"))) return false;
            const payload = {
                spaceId,
                assignmentId,
                uid,
                participantId,
                role: "parent",
                isParentFlow: true,
                isChildPortal: true,
                title,
                status,
                answers,
                childSelfReport,
                ...(status === "submitted" ? { auto: evaluateAnswers(tasks, answers), submittedAt: Date.now() } : {}),
                updatedAt: serverTimestamp(),
                createdAt: current.get("createdAt") ?? serverTimestamp(),
                auth: { uid, participantId },
            };
            transaction.set(nestedRef, payload, { merge: true });
            transaction.set(indexRef, payload, { merge: true });
            return true;
        });
    }

    async function saveAssignment(status: "draft" | "submitted") {
        if (!space || !assignment || (!deviceApi && (!user?.uid || !participantId)) || !submissionReady || submitted || savingRef.current) return;

        savingRef.current = true;
        deviceReadVersion.current++;
        setSavingStatus(status);
        setMsg(null);

        try {
            if (deviceApi) {
                const response = await fetch(deviceApi, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status, revision, answers, childSelfReport }),
                    cache: "no-store",
                });
                if (response.status === 409) {
                    const { error } = await response.json();
                    if (error === "already_delivered") {
                        setMsg(t("messages.delivered"));
                        setDeviceRefresh((value) => value + 1);
                    } else {
                        setMsg(t("errors.workConflict"));
                    }
                    return;
                }
                if (!response.ok) throw new Error("Could not save family work.");
                const view: FamilyAssignmentData = await response.json();
                hasUnsavedEdits.current = false;
                applyDeviceView(view);
            } else if (!await saveParentPreview(status)) {
                setMsg(t("messages.delivered"));
                return;
            }
            hasUnsavedEdits.current = false;
            if (status === "submitted") {
                setCelebrate(true);
                setFeedbackChoice(true);
                setTimeout(() => setCelebrate(false), 3500);
            }
            setMsg(t(status === "draft" ? "messages.draftSaved" : "messages.submitted"));
        } catch {
            setMsg(t("errors.saveFailed"));
        } finally {
            savingRef.current = false;
            setSavingStatus(null);
        }
    }

    if (err) {
        return (
            <main className="mx-auto max-w-3xl p-4">
                <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
                    <div className="text-5xl">😕</div>
                    <h1 className="mt-4 text-2xl font-black text-amber-900">{t("errors.title")}</h1>
                    <div className="mt-3 text-base leading-7 text-amber-800">
                        {t("errors.body")}
                    </div>

                    <Link
                        href={backHref}
                        className="mt-5 inline-flex rounded-2xl bg-amber-500 px-5 py-3 text-sm font-black text-white no-underline"
                    >
                        {t("actions.backToRoom")}
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

    if (!space || !assignment || !submissionReady) {
        return <p role="status" className="p-4 text-sm text-slate-600">{t("messages.loading")}</p>;
    }

    return (
        <main className="mx-auto w-full max-w-4xl space-y-4 pb-40">
            {celebrate ? (
                <section className="rounded-3xl border border-green-200 bg-gradient-to-br from-green-100 to-emerald-50 p-8 text-center shadow-lg motion-safe:animate-pulse">
                    <div className="text-6xl">🎉</div>
                    <h2 className="mt-4 text-4xl font-black text-green-900">{t("messages.celebrationTitle")}</h2>
                    <div className="mt-3 text-lg font-bold text-green-800">
                        {t("messages.celebrationText")}
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
                        ← {t("actions.back")}
                    </Link>
                </div>
            </section>

            {hasFeedback ? (
                <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
                    <button
                        type="button"
                        onClick={() => setFeedbackChoice(!feedbackOpen)}
                        aria-expanded={feedbackOpen}
                        aria-controls="child-assignment-feedback"
                        className="flex w-full items-center justify-between gap-3 text-left"
                    >
                        <div>
                            <div className="text-sm font-black uppercase tracking-wide text-emerald-700">
                                {t("feedback.kicker")}
                            </div>
                            <div className="mt-1 text-2xl font-black text-emerald-950">
                                {t(hasFamilyFeedback ? "feedback.homeGreeting" : submission?.aiFeedback ? "feedback.title" : "feedback.resultTitle")}
                            </div>
                            <div className="mt-1 text-sm font-semibold text-emerald-800">
                                {t("feedback.hint")}
                            </div>
                        </div>

                        <div className="rounded-full bg-white px-4 py-2 text-xl shadow-sm">
                            {feedbackOpen ? "▲" : "▼"}
                        </div>
                    </button>

                    {feedbackOpen ? (
                        <div id="child-assignment-feedback" className="mt-5 space-y-4">
                            {submitted ? (
                                <div className="rounded-2xl border border-sky-200 bg-white p-4">
                                    <div className="text-sm font-black text-sky-700">
                                        {t("feedback.submittedTitle")}
                                    </div>
                                    <div className="mt-1 text-base font-semibold leading-7 text-slate-800">
                                        {t("feedback.submittedText")}
                                    </div>
                                </div>
                            ) : null}

                            {autoSummary ? (
                                <div className="rounded-2xl border border-green-200 bg-white p-4">
                                    <div className="text-sm font-black text-green-700">
                                        {t("feedback.resultTitle")}
                                    </div>
                                    <div className="mt-1 text-xl font-black text-green-900">
                                        {t("feedback.result", { value: autoSummary })}
                                    </div>
                                    <div className="mt-1 text-base font-semibold leading-7 text-slate-800">
                                        {t("feedback.resultHint")}
                                    </div>
                                </div>
                            ) : null}

                            {submission?.aiFeedback ? (
                                <div className="rounded-2xl border border-emerald-200 bg-white p-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="text-sm font-black text-emerald-700">
                                            {t("feedback.feedbackTitle")}
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() =>
                                                playTTS(submission.aiFeedback ?? "", "feedback", t("feedback.feedbackTitle"))
                                            }
                                            disabled={ttsBusy === "feedback"}
                                            className="rounded-2xl bg-sky-100 px-4 py-3 text-sm font-black text-sky-900 hover:bg-sky-200 disabled:opacity-60"
                                        >
                                            {ttsBusy === "feedback" ? <AudioSpinner label={t("audio.loading")} /> : `🔊 ${t("actions.read")}`}
                                        </button>
                                    </div>

                                    <div className="mt-3 whitespace-pre-wrap text-base font-semibold leading-8 text-emerald-950">
                                        {submission.aiFeedback}
                                    </div>
                                </div>
                            ) : null}

                            {hasFamilyFeedback ? (
                                <section id={FAMILY_GREETING_ID} ref={greetingRef} tabIndex={-1} className="scroll-mt-4 rounded-2xl border border-yellow-200 bg-white p-4">
                                    <div className="text-sm font-black text-yellow-700">
                                        {t("feedback.homeGreeting")} 💛
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
                                </section>
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
                            <h2 className="text-2xl font-black text-slate-900">{t("content.readFirst")}</h2>

                            <button
                                type="button"
                                onClick={() => playTTS(sourceText, "text", t("content.textLabel"))}
                                disabled={ttsBusy === "text"}
                                className="rounded-2xl bg-sky-200 px-5 py-3 text-base font-black text-sky-950 transition hover:scale-[1.03] hover:bg-sky-300 disabled:opacity-60"
                            >
                                {ttsBusy === "text" ? (
                                    <AudioSpinner label={t("audio.loading")} />
                                ) : (
                                    <span>🔊 {t("actions.playText")}</span>
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
                                    showWordDivisions ? "block" : "",
                                    i === activeSentence ? "bg-yellow-200 text-slate-900" : "",
                                ].join(" ")}
                            >
                                {showWordDivisions ? <ReadingPracticeText text={sentence} /> : sentence}{" "}
                            </span>
                        ))}
                    </div>
                    {showWordDivisions && <ReadingPracticeWordList text={sourceText} />}
                </section>
            ) : null}

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
                <h2 className="text-2xl font-black text-slate-900">{t("content.tasks")}</h2>

                {tasks.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-600">{t("content.none")}</p>
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
                                            {t("content.taskNumber", { number: taskNumber })}
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => playTTS(prompt, "task", t("content.taskNumber", { number: taskNumber }), idx)}
                                            disabled={ttsBusy === "task" || !prompt}
                                            className="rounded-xl bg-sky-100 px-3 py-2 text-xs font-black text-sky-900 hover:bg-sky-200 disabled:opacity-60"
                                        >
                                            {ttsBusy === "task" ? <AudioSpinner label={t("audio.loading")} /> : `🔊 ${t("actions.read")}`}
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
                                                            disabled={submitted || saving}
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
                                                                    playTTS(opt, "option", t("content.optionLabel", { number: i + 1 }), idx, i);
                                                                }}
                                                                disabled={ttsBusy === "option"}
                                                                className="rounded-xl bg-sky-100 px-3 py-2 text-xs font-black text-sky-900 hover:bg-sky-200 disabled:opacity-60"
                                                            >
                                                                {ttsBusy === "option" ? <AudioSpinner label={t("audio.loading")} /> : "🔊"}
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
                                                disabled={submitted || saving}
                                                aria-pressed={current === true}
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
                                                {t("content.true")}
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => setAnswer(stableId, false)}
                                                disabled={submitted || saving}
                                                aria-pressed={current === false}
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
                                                {t("content.false")}
                                            </button>
                                        </div>
                                    ) : null}

                                    {type === "open" ? (
                                        <textarea
                                            value={typeof current === "string" ? current : ""}
                                            readOnly={submitted || saving}
                                            onChange={(e) => setAnswer(stableId, e.target.value)}
                                            rows={6}
                                            placeholder={t("content.answerPlaceholder")}
                                            className="mt-5 w-full rounded-3xl border border-slate-200 bg-white p-5 text-base leading-8 outline-none focus:border-green-400"
                                        />
                                    ) : null}

                                    <div className="mt-4 flex flex-wrap gap-2">
                                        {typeof current !== "undefined" && current !== "" ? (
                                            <Badge tone="good">{t("content.answerSaved")}</Badge>
                                        ) : (
                                            <Badge>{t("content.notAnswered")}</Badge>
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
                                                    ? `😊 ${t("content.correct")}`
                                                    : `🤔 ${t("content.tryAgain")}`}
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
                    {t("selfReport.title")}
                </h2>

                <p className="mt-2 text-sm font-semibold leading-6 text-emerald-900">
                    {t("selfReport.intro")}
                </p>

                <div className="mt-5 grid gap-3">
                    {[
                        ["readSilently", t("selfReport.readSilently")],
                        ["readAloud", t("selfReport.readAloud")],
                        ["completedTasks", t("selfReport.completedTasks")],
                        ["feltEasy", t("selfReport.feltEasy")],
                        ["feltHard", t("selfReport.feltHard")],
                    ].map(([key, label]) => (
                        <label
                            key={key}
                            className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-base font-bold text-slate-800"
                        >
                            <input
                                type="checkbox"
                                disabled={submitted || saving}
                                checked={Boolean(childSelfReport[key as keyof ChildSelfReport])}
                                onChange={() => {
                                    hasUnsavedEdits.current = true;
                                    setChildSelfReport((prev) => ({
                                        ...prev,
                                        [key]: !prev[key as keyof ChildSelfReport],
                                    }));
                                }}
                            />
                            {label}
                        </label>
                    ))}
                </div>

                <label htmlFor="child-comment" className="mt-5 block text-sm font-black text-emerald-950">
                    {t("selfReport.comment")}
                </label>

                <textarea
                    id="child-comment"
                    disabled={submitted || saving}
                    value={childSelfReport.comment ?? ""}
                    onChange={(e) => {
                        hasUnsavedEdits.current = true;
                        setChildSelfReport((prev) => ({
                            ...prev,
                            comment: e.target.value,
                        }));
                    }}
                    placeholder={t("selfReport.commentPlaceholder")}
                    rows={4}
                    className="mt-2 w-full rounded-2xl border border-emerald-200 bg-white p-4 text-base leading-7 text-slate-900 outline-none focus:border-emerald-500 disabled:bg-slate-100"
                />
            </section>

            <section className="sticky bottom-0 z-20 rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div role="status" className="text-sm font-semibold text-slate-600">
                        {msg ?? (submitted ? t("messages.delivered") : t("messages.readyToSubmit"))}
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {!submitted ? (
                            <button
                                type="button"
                                onClick={() => saveAssignment("draft")}
                                disabled={saving}
                                className="inline-flex min-h-12 items-center rounded-2xl border border-emerald-300 bg-white px-4 py-3 text-base font-bold text-emerald-950 hover:bg-emerald-50 disabled:opacity-60"
                            >
                                {t(savingStatus === "draft" ? "actions.saving" : "actions.saveDraft")}
                            </button>
                        ) : null}
                        <button
                            type="button"
                            onClick={() => saveAssignment("submitted")}
                            disabled={saving || submitted}
                            className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-emerald-800 px-5 py-3 text-base font-black text-white shadow-sm hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {savingStatus === "submitted" ? t("actions.saving") : submitted ? t("actions.delivered") : t("actions.save")}
                        </button>
                    </div>
                </div>
            </section>

            {audioRef.current ? (
                <div className="fixed bottom-24 left-1/2 z-30 w-[calc(100%-24px)] max-w-4xl -translate-x-1/2 rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm font-black text-slate-700">
                            🔊 {t("audio.playing", { label: activeAudioLabel ?? t("fallbacks.audio") })}
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
                            {isPlaying ? `⏸ ${t("actions.pause")}` : `▶ ${t("actions.continue")}`}
                        </button>

                        <button
                            type="button"
                            onClick={stopAudio}
                            className="rounded-2xl bg-rose-100 px-5 py-3 text-base font-black text-rose-900"
                        >
                            ⏹ {t("actions.stop")}
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
