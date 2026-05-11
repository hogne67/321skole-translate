// app\[locale]\(app)\producer\math\fractions\page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import {
    collection,
    onSnapshot,
    orderBy,
    query,
    where,
    type DocumentData,
    type QueryDocumentSnapshot,
} from "firebase/firestore";

import FractionWorksheetView from "@/components/generators/math/fractions/FractionWorksheetView";
import type {
    FractionDifficulty,
    FractionLanguage,
    FractionLevel,
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
    version: 1,
    title: "Brøk – del av helhet",
    language: "nb",
    level: "grade_2_4",
    topic: "mixed",
    difficulty: "easy",
    instructions: "Se på figuren og svar på oppgavene.",
    showAnswerKey: false,
    tasks: [],
};

function normalizeLocale(locale: string): FractionLanguage {
    if (locale === "en" || locale === "pt") return locale;
    return "nb";
}

export default function FractionsPage() {
    const locale = useLocale();

    const [language, setLanguage] = useState<FractionLanguage>(
        normalizeLocale(locale)
    );
    const [level, setLevel] = useState<FractionLevel>("grade_2_4");
    const [topic, setTopic] = useState<FractionTopic>("mixed");
    const [difficulty, setDifficulty] = useState<FractionDifficulty>("easy");
    const [taskCount, setTaskCount] = useState(6);
    const [showAnswerKey, setShowAnswerKey] = useState(false);
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

    useEffect(() => {
        const uid = auth.currentUser?.uid;

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

        const unsub = onSnapshot(
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
                                    : "Untitled space",
                            code:
                                typeof data.code === "string" && data.code.trim()
                                    ? data.code.trim()
                                    : "—",
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

        return () => unsub();
    }, []);

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
        const content = printRef.current;
        if (!content) return;

        const printWindow = window.open("", "_blank", "width=1000,height=1400");
        if (!printWindow) return;

        printWindow.document.open();
        printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${worksheet.title}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          html, body {
            margin: 0;
            padding: 0;
            background: white;
            font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
            color: #0f172a;
          }
          * { box-sizing: border-box; }
          svg { max-width: 100%; height: auto; }
        </style>
      </head>
      <body>
        ${content.outerHTML}
      </body>
    </html>
  `);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
    }

    function toggleVisual(kind: FractionVisualKind) {
        setVisualKinds((current) => {
            if (current.includes(kind)) {
                const next = current.filter((item) => item !== kind);
                return next.length > 0 ? next : current;
            }

            return [...current, kind];
        });
    }

    async function handleGenerate() {
        setLoading(true);
        setError("");

        try {
            const response = await fetch("/api/generate-fraction-worksheet", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    language,
                    level,
                    topic,
                    difficulty,
                    taskCount,
                    showAnswerKey,
                    visualKinds,
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
                setError("error" in data ? data.error : "Kunne ikke lage brøkark.");
                return;
            }

            setWorksheet(data.worksheet);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Kunne ikke lage brøkark.");
        } finally {
            setLoading(false);
        }
    }

    async function saveWorksheetAndGetId(): Promise<string | null> {
        if (worksheet.tasks.length === 0) {
            setError("Lag et brøkark før du lagrer.");
            return null;
        }

        const currentUser = auth.currentUser;
        const idToken = currentUser ? await currentUser.getIdToken() : null;

        if (!idToken) {
            setError("Du må være logget inn for å lagre.");
            return null;
        }

        const response = await fetch("/api/producer/save-fraction-worksheet", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
                worksheet,
                source: "math-fractions-generator",
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
            throw new Error(data?.error || "Kunne ikke lagre brøkarket.");
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
            setSuccess("Brøkarket er lagret i mitt innhold.");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Kunne ikke lagre brøkarket.");
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

            if (!savedId) {
                setError("Arket ble ikke lagret.");
                return;
            }

            setSavedWorksheetId(savedId);
            setSuccess("Brøkarket er lagret. Velg klasserom.");
            setShareModalOpen(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Kunne ikke dele brøkarket.");
        } finally {
            setSharing(false);
        }
    }

    async function handleAssignToSpace(spaceId: string) {
        if (!savedWorksheetId) {
            setError("Brøkarket må lagres før det kan deles.");
            return;
        }

        setAssigningSpaceId(spaceId);
        setError("");
        setSuccess("");

        try {
            const currentUser = auth.currentUser;
            const idToken = currentUser ? await currentUser.getIdToken() : null;

            if (!idToken) {
                setError("Du må være logget inn.");
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
                    title: worksheet.title,
                    level: worksheet.level,
                    language: worksheet.language,
                }),
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(text || "Kunne ikke dele til klasserom.");
            }

            setShareModalOpen(false);
            setSuccess("Brøkarket er delt til klasserommet.");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Kunne ikke dele til klasserom.");
        } finally {
            setAssigningSpaceId(null);
        }
    }

    return (
        <main className="min-h-screen bg-slate-50 p-6">
            <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
                <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h1 className="text-2xl font-bold text-slate-900">Brøkgenerator</h1>
                    <p className="mt-2 text-sm text-slate-600">
                        Første versjon: del av helhet, skriv brøk og velg riktig brøk.
                    </p>

                    <div className="mt-6 space-y-4">
                        <label className="block">
                            <span className="mb-1.5 block text-sm font-medium text-slate-700">
                                Språk
                            </span>
                            <select
                                value={language}
                                onChange={(e) => setLanguage(e.target.value as FractionLanguage)}
                                className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm"
                            >
                                <option value="nb">Norsk</option>
                                <option value="en">English</option>
                                <option value="pt">Português</option>
                            </select>
                        </label>

                        <label className="block">
                            <span className="mb-1.5 block text-sm font-medium text-slate-700">
                                Nivå
                            </span>
                            <select
                                value={level}
                                onChange={(e) => setLevel(e.target.value as FractionLevel)}
                                className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm"
                            >
                                <option value="grade_2_4">2.–4. trinn</option>
                                <option value="grade_5_7">5.–7. trinn</option>
                                <option value="grade_8_10">8.–10. trinn</option>
                            </select>
                        </label>

                        <label className="block">
                            <span className="mb-1.5 block text-sm font-medium text-slate-700">
                                Tema
                            </span>
                            <select
                                value={topic}
                                onChange={(e) => setTopic(e.target.value as FractionTopic)}
                                className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm"
                            >
                                <option value="mixed">Blandet</option>
                                <option value="part_of_whole">Fargelegg brøk</option>
                                <option value="write_fraction">Skriv brøken</option>
                                <option value="choose_fraction">Velg riktig brøk</option>
                            </select>
                        </label>

                        <label className="block">
                            <span className="mb-1.5 block text-sm font-medium text-slate-700">
                                Vanskelighetsgrad
                            </span>
                            <select
                                value={difficulty}
                                onChange={(e) =>
                                    setDifficulty(e.target.value as FractionDifficulty)
                                }
                                className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm"
                            >
                                <option value="easy">Lett</option>
                                <option value="medium">Middels</option>
                                <option value="hard">Vanskelig</option>
                            </select>
                        </label>

                        <label className="block">
                            <span className="mb-1.5 block text-sm font-medium text-slate-700">
                                Antall oppgaver
                            </span>
                            <input
                                type="number"
                                min={3}
                                max={12}
                                value={taskCount}
                                onChange={(e) => setTaskCount(Number(e.target.value))}
                                className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm"
                            />
                        </label>

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <p className="mb-3 text-sm font-medium text-slate-700">
                                Visuell modell
                            </p>

                            <div className="grid gap-2">
                                <button
                                    type="button"
                                    onClick={() => toggleVisual("bar")}
                                    className={`rounded-2xl border px-3 py-2 text-left text-sm ${visualKinds.includes("bar")
                                        ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                                        : "border-slate-200 bg-white text-slate-700"
                                        }`}
                                >
                                    Stolpe / brøkstripe
                                </button>

                                <button
                                    type="button"
                                    onClick={() => toggleVisual("rectangle")}
                                    className={`rounded-2xl border px-3 py-2 text-left text-sm ${visualKinds.includes("rectangle")
                                        ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                                        : "border-slate-200 bg-white text-slate-700"
                                        }`}
                                >
                                    Rektangel / rutenett
                                </button>
                                <button
                                    type="button"
                                    onClick={() => toggleVisual("circle")}
                                    className={`rounded-2xl border px-3 py-2 text-left text-sm ${visualKinds.includes("circle")
                                        ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                                        : "border-slate-200 bg-white text-slate-700"
                                        }`}
                                >
                                    Sirkel
                                </button>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => setShowAnswerKey((value) => !value)}
                            className={`w-full rounded-2xl border px-3 py-2 text-left text-sm ${showAnswerKey
                                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                                : "border-slate-200 bg-white text-slate-700"
                                }`}
                        >
                            {showAnswerKey ? "✓ Vis fasit" : "Vis fasit"}
                        </button>

                        {error ? (
                            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                {error}
                            </div>
                        ) : null}

                        {success ? (
                            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                                {success}
                                {savedWorksheetId ? (
                                    <span className="ml-1 text-emerald-600">
                                        ID: {savedWorksheetId}
                                    </span>
                                ) : null}
                            </div>
                        ) : null}

                        <button
                            type="button"
                            onClick={handleGenerate}
                            disabled={loading}
                            className="w-full rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                            {loading ? "Lager..." : "Lag brøkark"}
                        </button>

                        <button
                            type="button"
                            onClick={handleSaveToMyContent}
                            disabled={saving || worksheet.tasks.length === 0}
                            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                        >
                            {saving ? "Lagrer..." : "Lagre i mitt innhold"}
                        </button>

                        <button
                            type="button"
                            onClick={handleShareToSpaces}
                            disabled={sharing || saving || worksheet.tasks.length === 0}
                            className="w-full rounded-2xl border border-sky-300 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-900 hover:bg-sky-100 disabled:opacity-50"
                        >
                            {sharing ? "Lagrer..." : "Del til klasserom"}
                        </button>

                        <button
                            type="button"
                            onClick={handlePrint}
                            disabled={worksheet.tasks.length === 0}
                            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                        >
                            Skriv ut
                        </button>

                    </div>
                </aside>

                <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <FractionWorksheetView
                        worksheet={worksheet}
                        printRef={printRef}
                    />
                </section>
            </div>
            {shareModalOpen ? (
                <div
                    className="fixed inset-0 z-50 bg-black/50 p-4"
                    onClick={() => setShareModalOpen(false)}
                    role="dialog"
                    aria-modal="true"
                >
                    <div
                        className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-300 bg-white shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="border-b border-slate-200 p-5">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className="text-lg font-semibold text-slate-900">
                                        Velg klasserom
                                    </div>
                                    <div className="mt-1 text-sm text-slate-600">
                                        Velg hvilket klasserom du vil dele brøkarket til.
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setShareModalOpen(false)}
                                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
                                >
                                    Lukk
                                </button>
                            </div>

                            <input
                                value={spaceSearch}
                                onChange={(e) => setSpaceSearch(e.target.value)}
                                placeholder="Søk etter klasserom eller kode"
                                className="mt-4 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none"
                            />
                        </div>

                        <div className="max-h-[65vh] overflow-y-auto p-5">
                            {spacesLoading ? (
                                <div className="rounded-xl border border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                                    Laster klasserom...
                                </div>
                            ) : filteredSpaces.length === 0 ? (
                                <div className="rounded-xl border border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                                    Ingen klasserom funnet.
                                </div>
                            ) : (
                                <div className="grid gap-3">
                                    {filteredSpaces.map((space) => (
                                        <div
                                            key={space.id}
                                            className="rounded-xl border border-slate-300 bg-white p-4"
                                        >
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                <div>
                                                    <div className="font-semibold text-slate-900">
                                                        {space.title}
                                                    </div>
                                                    <div className="mt-1 text-sm text-slate-600">
                                                        Kode: {space.code} · {space.isOpen ? "Åpent" : "Lukket"}
                                                    </div>
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={() => handleAssignToSpace(space.id)}
                                                    disabled={assigningSpaceId !== null}
                                                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                                                >
                                                    {assigningSpaceId === space.id ? "Deler..." : "Del hit"}
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