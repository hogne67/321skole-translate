"use client";

import MathGeneratorBackLink from "@/components/generators/math/MathGeneratorBackLink";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { mathEditorHref } from "@/lib/math/editor";


import FractionGeneratorPanel from "@/components/generators/math/fractions/FractionGeneratorPanel";
import FractionCalculationPanel from "./FractionCalculationPanel";
import MathSpacePicker from "../MathSpacePicker";
import { useMathWorksheetSave } from "../useMathWorksheetSave";
import { useSavedMathWorksheet } from "../useSavedMathWorksheet";
import { restoreFractionWorksheet } from "@/lib/math/fractions/restoreWorksheet";
import { getCalculationCopy } from "@/lib/math/fractions/calculationCopy";
import { getFractionCopy } from "@/lib/math/fractions/uiCopy";
import "@/components/generators/math/fractions/fractionGenerator.css";
import FractionWorksheetView from "@/components/generators/math/fractions/FractionWorksheetView";
import type {
    FractionDifficulty,
    FractionLevel,
    FractionCalculationSettings,
    FractionLanguage,
    FractionTopic,
    FractionVisualKind,
    FractionWorksheet,
} from "@/lib/math/fractions/types";


type GenerateResponse =
    | { ok: true; worksheet: FractionWorksheet }
    | { ok: false; error: string };

const emptyWorksheet: FractionWorksheet = {
    version: 1, title: "Brøk – del av helhet", language: "nb", level: "grade_2_4",
    topic: "mixed", difficulty: "medium", instructions: "", showAnswerKey: false, showHints: true, tasks: [],
};

function normalizeLocale(locale: string): FractionLanguage {
    return locale === "en" || locale === "pt" ? locale : "nb";
}

export default function FractionGenerator({ mode = "visual" }: { mode?: "visual" | "calculation" }) {
    const locale = useLocale();
    const router = useRouter();

    const [language, setLanguage] = useState(() => normalizeLocale(locale));
    const copy = getFractionCopy(language);
    const calc = getCalculationCopy(language);
    const isCalculation = mode === "calculation";
    const [operation, setOperation] = useState<FractionCalculationSettings["operation"]>("addition");
    const [denominatorRelation, setDenominatorRelation] = useState<"same" | "different">("same");
    const [requireReduced, setRequireReduced] = useState(false);
    const [level, setLevel] = useState<FractionLevel>("grade_2_4");
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

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const worksheetWithDisplayOptions = useMemo<FractionWorksheet>(
        () => ({
            ...worksheet,
            showHints: includeHints,
            showAnswerKey,
            ...(worksheet.topic !== "calculation" ? { visualKinds: worksheet.visualKinds ?? Array.from(new Set(worksheet.tasks.map(task => task.visual))) } : {}),
            ...(worksheet.calculation ? { calculation: { ...worksheet.calculation, requireReduced }, instructions: requireReduced ? calc.reducedInstructions : calc.instructions } : {}),
        }),
        [includeHints, showAnswerKey, worksheet, requireReduced, calc.reducedInstructions, calc.instructions]
    );

    const persistence = useMathWorksheetSave({ worksheet: worksheetWithDisplayOptions.tasks.length ? worksheetWithDisplayOptions : null, endpoint: "/api/producer/save-fraction-worksheet", language: locale, source: isCalculation ? "math-fraction-calculation-generator" : "math-fractions-generator" });
    const { saving, savedId: savedWorksheetId, success, sharing: shareModalOpen, setSharing: setShareModalOpen } = persistence;
    const restored = useSavedMathWorksheet(locale, (data, id) => {
        const result = restoreFractionWorksheet(data.fractionWorksheet ?? data.mathWorksheet);
        if (!result) return false;
        if ((result.topic === "calculation") !== isCalculation) {
            router.replace(mathEditorHref(locale, id, "fractions", "", result));
            return true;
        }
        setWorksheet(result); setLanguage(result.language); setLevel(result.level);
        setTaskCount(result.tasks.length); setShowAnswerKey(result.showAnswerKey); setIncludeHints(result.showHints !== false);
        if (result.topic !== "calculation") setTopic(result.topic);
        const denominators = result.tasks.map(task => task.fraction.denominator);
        setDenominatorMin(result.calculation?.denominatorMin ?? result.denominatorRange?.min ?? Math.min(...denominators));
        setDenominatorMax(result.calculation?.denominatorMax ?? result.denominatorRange?.max ?? Math.max(...denominators));
        setVisualKinds(result.visualKinds ?? Array.from(new Set(result.tasks.map(task => task.visual))));
        if (result.calculation) {
            setOperation(result.calculation.operation);
            setDenominatorRelation(result.calculation.denominatorRelation ?? (result.calculation.denominatorMode === "fixed" ? "same" : "different"));
            setRequireReduced(result.calculation.requireReduced);
        }
        const calculationCopy = getCalculationCopy(result.language);
        persistence.rememberSaved(id, {
            ...result,
            showHints: result.showHints !== false,
            showAnswerKey: result.showAnswerKey,
            ...(result.topic !== "calculation" ? { visualKinds: result.visualKinds ?? Array.from(new Set(result.tasks.map(task => task.visual))) } : {}),
            ...(result.calculation ? { calculation: result.calculation, instructions: result.calculation.requireReduced ? calculationCopy.reducedInstructions : calculationCopy.instructions } : {}),
        });
        return true;
    });

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
                ...(!isCalculation ? { visualKinds: [...visualKinds] } : {}),
                showHints: includeHints,
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : copy.generateFailed);
        } finally {
            setLoading(false);
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
                        onGenerate={handleGenerate} onSave={() => { void persistence.save(); }} onShare={() => { void persistence.save(true); }}
                        loading={loading} saving={saving} sharing={false} loadingSaved={restored.loading} hasWorksheet={worksheet.tasks.length > 0} validRange={validRange} validDenominators={validDenominators}
                    /> : <FractionGeneratorPanel
                        language={language} topic={topic} taskCount={taskCount}
                        denominatorMin={denominatorMin} denominatorMax={denominatorMax}
                        visualKinds={visualKinds} includeHints={includeHints} showAnswerKey={showAnswerKey}
                        onTopicChange={setTopic} onTaskCountChange={setTaskCount}
                        onMinimumChange={setDenominatorMin} onMaximumChange={setDenominatorMax}
                        onToggleVisual={toggleVisual} onHintsChange={setIncludeHints} onAnswerKeyChange={setShowAnswerKey}
                        onGenerate={handleGenerate} onSave={() => { void persistence.save(); }} onShare={() => { void persistence.save(true); }}
                        loading={loading} saving={saving} sharing={false} loadingSaved={restored.loading} hasWorksheet={worksheet.tasks.length > 0} validRange={validRange}
                    />}
                    {error || persistence.error || restored.error ? <p role="alert" className="mt-4 text-sm text-red-700">{error || persistence.error || restored.error}</p> : null}
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
            {shareModalOpen && savedWorksheetId ? <MathSpacePicker worksheetId={savedWorksheetId} title={worksheet.title} language={worksheet.language} onClose={() => setShareModalOpen(false)} onShared={persistence.shared} /> : null}
        </main>
    );
}
