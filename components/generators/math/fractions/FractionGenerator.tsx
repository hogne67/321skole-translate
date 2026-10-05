"use client";

import MathGeneratorBackLink from "@/components/generators/math/MathGeneratorBackLink";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { useLocale } from "next-intl";
import { onAuthStateChanged } from "firebase/auth";
import {
    collection,
    onSnapshot,
    orderBy,
    query,
    where,
    type DocumentData,
    type QueryDocumentSnapshot,
} from "firebase/firestore";

import FractionGeneratorPanel from "@/components/generators/math/fractions/FractionGeneratorPanel";
import FractionCalculationPanel from "./FractionCalculationPanel";
import { getCalculationCopy } from "@/lib/math/fractions/calculationCopy";
import { getFractionCopy } from "@/lib/math/fractions/uiCopy";
import "@/components/generators/math/fractions/fractionGenerator.css";
import FractionWorksheetView from "@/components/generators/math/fractions/FractionWorksheetView";
import type {
    FractionDifficulty,
    FractionCalculationSettings,
    FractionLanguage,
    FractionTopic,
    FractionVisualKind,
    FractionWorksheet,
} from "@/lib/math/fractions/types";
import { auth, db } from "@/lib/firebase";

type GenerateResponse =
    | { ok: true; worksheet: FractionWorksheet }
    | { ok: false; error: string };

type SaveWorksheetResponse = {
    ok?: boolean;
    error?: string;
    id?: string;
    worksheetId?: string;
    lessonId?: string;
};

type TeacherSpaceRow = {
    id: string;
    title: string;
    code: string;
    isOpen: boolean;
    createdAt?: unknown;
};

const emptyWorksheet: FractionWorksheet = {
    version: 1, title: "Brøk – del av helhet", language: "nb", level: "grade_2_4",
    topic: "mixed", difficulty: "medium", instructions: "", showAnswerKey: false, showHints: true, tasks: [],
};

function normalizeLocale(locale: string): FractionLanguage {
    return locale === "en" || locale === "pt" ? locale : "nb";
}

export default function FractionGenerator({ mode = "visual" }: { mode?: "visual" | "calculation" }) {
    const locale = useLocale();

    const language = normalizeLocale(locale);
    const copy = getFractionCopy(language);
    const calc = getCalculationCopy(language);
    const isCalculation = mode === "calculation";
    const [operation, setOperation] = useState<FractionCalculationSettings["operation"]>("addition");
    const [denominatorRelation, setDenominatorRelation] = useState<"same" | "different">("same");
    const [requireReduced, setRequireReduced] = useState(false);
    const level = "grade_2_4";
    const [topic, setTopic] = useState<FractionTopic>("mixed");
    const [denominatorMin, setDenominatorMin] = useState(2);
    const [denominatorMax, setDenominatorMax] = useState(8);
    const difficulty: FractionDifficulty = denominatorMax <= 5 ? "easy" : denominatorMax <= 8 ? "medium" : "hard";
    const validRange = Number.isInteger(denominatorMin) && denominatorMin >= 2 && denominatorMin <= (isCalculation ? 100 : 12) &&
        Number.isInteger(denominatorMax) && denominatorMax <= (isCalculation ? 100 : 12) && denominatorMin <= denominatorMax;
    const validDenominators = !isCalculation || denominatorRelation === "same" || denominatorMin < denominatorMax;
    const [taskCount, setTaskCount] = useState(isCalculation ? 36 : 6);
    const [showAnswerKey, setShowAnswerKey] = useState(false);
    const [includeHints, setIncludeHints] = useState(!isCalculation);
    const [visualKinds, setVisualKinds] = useState<FractionVisualKind[]>(["bar"]);

    const [worksheet, setWorksheet] = useState<FractionWorksheet>({
        ...emptyWorksheet,
        language: normalizeLocale(locale),
    });

    const printRef = useRef<HTMLDivElement | null>(null);

    const [saving, setSaving] = useState(false);
    const [savedWorksheetId, setSavedWorksheetId] = useState<string | null>(null);
    const [success, setSuccess] = useState("");

    const [sharing, setSharing] = useState(false);
    const [shareModalOpen, setShareModalOpen] = useState(false);
    const [assigningSpaceId, setAssigningSpaceId] = useState<string | null>(null);
    const [teacherSpaces, setTeacherSpaces] = useState<TeacherSpaceRow[]>([]);
    const [spacesLoading, setSpacesLoading] = useState(true);
    const [spaceSearch, setSpaceSearch] = useState("");

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const worksheetWithDisplayOptions = useMemo<FractionWorksheet>(
        () => ({
            ...worksheet,
            showHints: includeHints,
            showAnswerKey,
            ...(worksheet.calculation ? { calculation: { ...worksheet.calculation, requireReduced }, instructions: requireReduced ? calc.reducedInstructions : calc.instructions } : {}),
        }),
        [includeHints, showAnswerKey, worksheet, requireReduced, calc.reducedInstructions, calc.instructions]
    );

    useEffect(() => {
        let unsubscribeSpaces: (() => void) | undefined;
        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            unsubscribeSpaces?.();
            const uid = user?.uid;

            if (!uid) {
                setTeacherSpaces([]);
                setSpacesLoading(false);
                return;
            }

            setSpacesLoading(true);

            const q = query(
                collection(db, "spaces"),
                where("ownerId", "==", uid),
                orderBy("createdAt", "desc")
            );

            unsubscribeSpaces = onSnapshot(
                q,
                (snap) => {
                    const next: TeacherSpaceRow[] = snap.docs.map(
                        (d: QueryDocumentSnapshot<DocumentData>) => {
                            const data = (d.data() ?? {}) as Record<string, unknown>;

                            return {
                                id: d.id,
                                title:
                                    typeof data.title === "string" && data.title.trim()
                                        ? data.title.trim()
                                        : copy.untitledSpace,
                                code:
                                    typeof data.code === "string" && data.code.trim()
                                        ? data.code.trim()
                                        : "-",
                                isOpen: data.isOpen === true,
                                createdAt: data.createdAt,
                            };
                        }
                    );

                    setTeacherSpaces(next);
                    setSpacesLoading(false);
                },
                () => {
                    setTeacherSpaces([]);
                    setSpacesLoading(false);
                }
            );

        });
        return () => {
            unsubscribeAuth();
            unsubscribeSpaces?.();
        };
    }, [copy.untitledSpace]);

    const search = spaceSearch.trim().toLowerCase();

    const filteredSpaces = search
        ? teacherSpaces.filter((space) => {
            return (
                space.title.toLowerCase().includes(search) ||
                space.code.toLowerCase().includes(search)
            );
        })
        : teacherSpaces;



    function handlePrint() {
        if (worksheet.tasks.length) window.print();
    }

    function toggleVisual(kind: FractionVisualKind) {
        setVisualKinds((current) => {
            if (current.includes(kind)) {
                const next = current.filter((item) => item !== kind);
                return next;
            }

            return [...current, kind];
        });
    }

    async function handleGenerate() {
        if (!validRange || !validDenominators || !visualKinds.length) return;
        setLoading(true);
        setError("");
        setSuccess("");
        setSavedWorksheetId(null);

        try {
            const response = await fetch(isCalculation ? "/api/generate-fraction-calculation-worksheet" : "/api/generate-fraction-worksheet", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(isCalculation ? {
                    language, operation, denominatorRelation, denominatorMin, denominatorMax, requireReduced, taskCount, showAnswerKey,
                } : {
                    language,
                    level,
                    topic,
                    difficulty,
                    taskCount,
                    showAnswerKey,
                    visualKinds,
                    denominatorMin,
                    denominatorMax,
                }),
            });

            const rawText = await response.text();

            let data: GenerateResponse | null = null;

            try {
                data = rawText ? (JSON.parse(rawText) as GenerateResponse) : null;
            } catch {
                throw new Error(
                    `API-et returnerte ikke JSON. Status ${response.status}. Svar: ${rawText.slice(
                        0,
                        200
                    )}`
                );
            }

            if (!data) {
                throw new Error(`API-et returnerte tomt svar. Status ${response.status}.`);
            }

            if (!response.ok || !data.ok) {
                setError("error" in data && data.error === "INVALID_DENOMINATOR_RANGE" ? isCalculation ? calc.invalidRange : copy.invalidRange : "error" in data && data.error === "INVALID_DIFFERENT_DENOMINATORS" ? calc.differentRange : "error" in data ? data.error : copy.generateFailed);
                return;
            }

            setWorksheet({
                ...data.worksheet,
                showHints: includeHints,
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : copy.generateFailed);
        } finally {
            setLoading(false);
        }
    }

    async function saveWorksheetAndGetId(): Promise<string | null> {
        if (worksheetWithDisplayOptions.tasks.length === 0) {
            setError(copy.generateFailed);
            return null;
        }

        const currentUser = auth.currentUser;
        const idToken = currentUser ? await currentUser.getIdToken() : null;

        if (!idToken) {
            setError(copy.login);
            return null;
        }

        const response = await fetch("/api/producer/save-fraction-worksheet", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
                worksheet: worksheetWithDisplayOptions,
                source: isCalculation ? "math-fraction-calculation-generator" : "math-fractions-generator",
            }),
        });

        const rawText = await response.text();

        let data: SaveWorksheetResponse | null = null;

        try {
            data = rawText ? (JSON.parse(rawText) as SaveWorksheetResponse) : null;
        } catch {
            throw new Error(
                `Save-ruta returnerte ikke JSON. Status ${response.status}. Svar: ${rawText.slice(
                    0,
                    200
                )}`
            );
        }

        if (!response.ok || !data?.ok) {
            throw new Error(data?.error || copy.saveFailed);
        }

        return data.id || data.worksheetId || data.lessonId || null;
    }

    async function handleSaveToMyContent() {
        setSaving(true);
        setError("");
        setSuccess("");

        try {
            const savedId = await saveWorksheetAndGetId();
            if (!savedId) return;

            setSavedWorksheetId(savedId);
            setSuccess(copy.saved);
        } catch (err) {
            setError(err instanceof Error ? err.message : copy.saveFailed);
        } finally {
            setSaving(false);
        }
    }

    async function handleShareToSpaces() {
        setSharing(true);
        setError("");
        setSuccess("");

        try {
            const savedId = await saveWorksheetAndGetId();

            if (!savedId) return;

            setSavedWorksheetId(savedId);
            setSuccess(copy.savedChooseSpace);
            setShareModalOpen(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : copy.shareFailed);
        } finally {
            setSharing(false);
        }
    }

    async function handleAssignToSpace(spaceId: string) {
        if (!savedWorksheetId) {
            setError(copy.saveFailed);
            return;
        }

        setAssigningSpaceId(spaceId);
        setError("");
        setSuccess("");

        try {
            const currentUser = auth.currentUser;
            const idToken = currentUser ? await currentUser.getIdToken() : null;

            if (!idToken) {
                setError(copy.login);
                return;
            }

            const response = await fetch(`/api/teacher/spaces/${spaceId}/assign`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                    sourceType: "myContent",
                    sourceId: savedWorksheetId,
                    title: worksheetWithDisplayOptions.title,
                    level: worksheetWithDisplayOptions.level,
                    language: worksheetWithDisplayOptions.language,
                }),
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(text || copy.shareFailed);
            }

            setShareModalOpen(false);
            setSuccess(copy.shared);
        } catch (err) {
            setError(err instanceof Error ? err.message : copy.shareFailed);
        } finally {
            setAssigningSpaceId(null);
        }
    }

    return (
        <main className="fraction-generator min-h-screen bg-slate-50 px-4 py-6 sm:px-6">
            <div className="fraction-generator-layout mx-auto grid max-w-6xl items-start gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
                <aside className="fraction-generator-controls min-w-0 rounded-3xl bg-white p-5">
                    <MathGeneratorBackLink />
                    <div className="text-xs font-extrabold uppercase tracking-normal text-teal-700">{copy.brand}</div>
                    <h1 className="mt-2 text-2xl font-extrabold text-slate-950">{isCalculation ? calc.title : copy.title}</h1>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{isCalculation ? calc.subtitle : copy.subtitle}</p>
                    {isCalculation ? <FractionCalculationPanel
                        language={language} operation={operation} onOperationChange={setOperation}
                        denominatorRelation={denominatorRelation} onDenominatorRelationChange={setDenominatorRelation}
                        denominatorMin={denominatorMin} denominatorMax={denominatorMax}
                        onMinimumChange={setDenominatorMin} onMaximumChange={setDenominatorMax}
                        taskCount={taskCount} onTaskCountChange={setTaskCount}
                        requireReduced={requireReduced} onRequireReducedChange={setRequireReduced}
                        showAnswerKey={showAnswerKey} onAnswerKeyChange={setShowAnswerKey}
                        onGenerate={handleGenerate} onSave={handleSaveToMyContent} onShare={handleShareToSpaces} onPrint={handlePrint}
                        loading={loading} saving={saving} sharing={sharing} hasWorksheet={worksheet.tasks.length > 0} validRange={validRange} validDenominators={validDenominators}
                    /> : <FractionGeneratorPanel
                        language={language} topic={topic} taskCount={taskCount}
                        denominatorMin={denominatorMin} denominatorMax={denominatorMax}
                        visualKinds={visualKinds} includeHints={includeHints} showAnswerKey={showAnswerKey}
                        onTopicChange={setTopic} onTaskCountChange={setTaskCount}
                        onMinimumChange={setDenominatorMin} onMaximumChange={setDenominatorMax}
                        onToggleVisual={toggleVisual} onHintsChange={setIncludeHints} onAnswerKeyChange={setShowAnswerKey}
                        onGenerate={handleGenerate} onSave={handleSaveToMyContent} onShare={handleShareToSpaces} onPrint={handlePrint}
                        loading={loading} saving={saving} sharing={sharing} hasWorksheet={worksheet.tasks.length > 0} validRange={validRange}
                    />}
                    {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
                    {success ? <p role="status" className="mt-4 text-sm text-emerald-700">{success}</p> : null}
                    {savedWorksheetId ? <Link href={`/${locale}/content`} className="mt-3 inline-block text-sm font-semibold text-teal-700 underline">{copy.openContent}</Link> : null}
                </aside>
                <section className="fraction-generator-preview min-w-0 rounded-3xl bg-white p-5 sm:p-6" aria-label={copy.worksheet}>
                    {worksheet.tasks.length ? (
                        <FractionWorksheetView worksheet={worksheetWithDisplayOptions} printRef={printRef} printMode variant="generator" showAutoCheck={false} />
                    ) : (
                        <div className="flex min-h-[460px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                            <h2 className="text-xl font-bold text-slate-950">{isCalculation ? calc.emptyTitle : copy.emptyTitle}</h2>
                        </div>
                    )}
                </section>
            </div>
            {shareModalOpen ? (
                <div
                    className="fixed inset-0 z-50 bg-black/50 p-4"
                    onClick={() => setShareModalOpen(false)}
                    role="dialog"
                    aria-modal="true"
                    aria-label={copy.selectSpace}
                >
                    <div
                        className="mx-auto w-full max-w-3xl rounded-lg border border-slate-300 bg-white shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="border-b border-slate-200 p-5">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className="text-lg font-semibold text-slate-900">
                                        {copy.selectSpace}
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setShareModalOpen(false)}
                                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                                    aria-label={copy.close} title={copy.close}
                                >
                                    <X size={18} aria-hidden="true" />
                                </button>
                            </div>

                            <input
                                value={spaceSearch}
                                onChange={(e) => setSpaceSearch(e.target.value)}
                                placeholder={copy.searchSpaces}
                                className="mt-4 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
                            />
                        </div>

                        <div className="max-h-[65vh] overflow-y-auto p-5">
                            {spacesLoading ? (
                                <div className="rounded-lg border border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                                    {copy.loadingSpaces}
                                </div>
                            ) : filteredSpaces.length === 0 ? (
                                <div className="rounded-lg border border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                                    {copy.noSpaces}
                                </div>
                            ) : (
                                <div className="grid gap-3">
                                    {filteredSpaces.map((space) => (
                                        <div
                                            key={space.id}
                                            className="rounded-lg border border-slate-300 bg-white p-4"
                                        >
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                <div>
                                                    <div className="font-semibold text-slate-900">
                                                        {space.title}
                                                    </div>
                                                    <div className="mt-1 text-sm text-slate-600">
                                                        {copy.code}: {space.code} · {space.isOpen ? copy.open : copy.closed}
                                                    </div>
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={() => handleAssignToSpace(space.id)}
                                                    disabled={assigningSpaceId !== null}
                                                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                                                >
                                                    {assigningSpaceId === space.id ? copy.sharing : copy.shareHere}
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ) : null}
        </main>
    );
}
