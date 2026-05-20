// app\[locale]\(app)\producer\math\fractions\page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
    FractionTask,
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
    showHints: true,
    tasks: [],
};

function normalizeLocale(locale: string): FractionLanguage {
    if (locale === "en" || locale === "pt") return locale;
    return "nb";
}

function escapeHtml(value: unknown): string {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function fractionHtml(value: string): string {
    const match = value.trim().match(/^(-?\d+)\s*\/\s*(-?\d+)$/);

    if (!match) return `<span>${escapeHtml(value)}</span>`;

    return `
        <span class="fraction-print-fraction" aria-label="${escapeHtml(value)}">
            <span>${escapeHtml(match[1])}</span>
            <span class="fraction-print-line"></span>
            <span>${escapeHtml(match[2])}</span>
        </span>
    `;
}

function promptLabelForPrint(task: FractionTask, language: FractionLanguage): string {
    if (task.type === "shade_fraction") {
        if (language === "en") return "Shade";
        if (language === "pt") return "Pinta";
        return "Fargelegg";
    }

    if (task.type === "write_fraction") {
        if (language === "en") return "Write the fraction.";
        if (language === "pt") return "Escreve a fração.";
        return "Skriv riktig brøk.";
    }

    return task.prompt;
}

function printFigureHtml(task: FractionTask, shadedOverride?: number): string {
    const total = Math.max(1, Number(task.fraction.denominator) || 1);
    const shaded = Math.max(
        0,
        Math.min(Number(shadedOverride ?? task.shadedParts ?? task.fraction.numerator) || 0, total)
    );

    if (task.visual === "circle") {
        const cx = 100;
        const cy = 100;
        const r = 88;
        const angle = 360 / total;

        const polar = (degrees: number) => {
            const radians = ((degrees - 90) * Math.PI) / 180;
            return {
                x: cx + r * Math.cos(radians),
                y: cy + r * Math.sin(radians),
            };
        };

        const slices = Array.from({ length: total }).map((_, idx) => {
            const startAngle = idx * angle;
            const endAngle = (idx + 1) * angle;
            const start = polar(endAngle);
            const end = polar(startAngle);
            const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
            const active = idx < shaded;

            return `<path d="M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y} Z" fill="${active ? "#10b981" : "#f8fafc"}" stroke="#111827" stroke-width="2" />`;
        }).join("");

        return `
            <svg class="fraction-print-circle" viewBox="-8 -8 216 216" role="img" aria-label="${shaded} av ${total}">
                ${slices}
                <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#111827" stroke-width="3" />
            </svg>
        `;
    }

    if (task.visual === "rectangle") {
        const columns = Math.ceil(Math.sqrt(total));

        return `
            <div class="fraction-print-rect" style="grid-template-columns: repeat(${columns}, 28px);">
                ${Array.from({ length: total }).map((_, idx) => {
                    const active = idx < shaded;
                    return `<div class="fraction-print-cell${active ? " is-active" : ""}"></div>`;
                }).join("")}
            </div>
        `;
    }

    const partWidth = Math.max(14, Math.min(32, Math.floor(150 / total)));

    return `
        <div class="fraction-print-bar">
            ${Array.from({ length: total }).map((_, idx) => {
                const active = idx < shaded;
                return `<div class="fraction-print-bar-part${active ? " is-active" : ""}" style="width:${partWidth}px;"></div>`;
            }).join("")}
        </div>
    `;
}

function printTaskHtml(task: FractionTask, idx: number, worksheet: FractionWorksheet): string {
    const prompt = promptLabelForPrint(task, worksheet.language);
    const answer = task.answer || `${task.fraction.numerator}/${task.fraction.denominator}`;

    if (task.type === "shade_fraction") {
        return `
            <article class="fraction-print-task fraction-print-task-shade">
                <div class="fraction-print-head">
                    <div class="fraction-print-num">${idx + 1}</div>
                    <h4>${escapeHtml(prompt)}</h4>
                </div>
                <div class="fraction-print-shade-grid">
                    <div class="fraction-print-target">${fractionHtml(answer)}</div>
                    <div class="fraction-print-figure-box">${printFigureHtml(task, 0)}</div>
                </div>
                ${worksheet.showHints && task.hint ? `<div class="fraction-print-hint"><strong>Hint:</strong> ${escapeHtml(task.hint)}</div>` : ""}
            </article>
        `;
    }

    if (task.type === "choose_fraction" && task.options?.length) {
        return `
            <article class="fraction-print-task">
                <div class="fraction-print-head">
                    <div class="fraction-print-num">${idx + 1}</div>
                    <h4>${escapeHtml(prompt)}</h4>
                </div>
                <div class="fraction-print-choice-grid">
                    <div class="fraction-print-figure-box">${printFigureHtml(task)}</div>
                    <div class="fraction-print-options">
                        ${task.options.map((option) => `<div class="fraction-print-option">${fractionHtml(option)}</div>`).join("")}
                    </div>
                </div>
                ${worksheet.showHints && task.hint ? `<div class="fraction-print-hint"><strong>Hint:</strong> ${escapeHtml(task.hint)}</div>` : ""}
            </article>
        `;
    }

    return `
        <article class="fraction-print-task">
            <div class="fraction-print-head">
                <div class="fraction-print-num">${idx + 1}</div>
                <h4>${escapeHtml(prompt)}</h4>
            </div>
            <div class="fraction-print-write-grid">
                <div class="fraction-print-figure-box">${printFigureHtml(task)}</div>
                <div class="fraction-print-answer-box">
                    <span>Svar:</span>
                    <div class="fraction-print-answer-lines">
                        <div></div>
                        <div></div>
                    </div>
                </div>
            </div>
            ${worksheet.showHints && task.hint ? `<div class="fraction-print-hint"><strong>Hint:</strong> ${escapeHtml(task.hint)}</div>` : ""}
        </article>
    `;
}

function answerKeyHtml(worksheet: FractionWorksheet): string {
    if (!worksheet.showAnswerKey) return "";

    return `
        <section class="fraction-print-answer-key-section">
            <div class="fraction-print-page-break"></div>
            <h3>Fasit</h3>
            <div class="fraction-print-task-list">
                ${worksheet.tasks.map((task, idx) => {
                    const answer = task.answer || `${task.fraction.numerator}/${task.fraction.denominator}`;
                    return `
                        <article class="fraction-print-task fraction-print-answer-key-task">
                            <div class="fraction-print-head">
                                <div class="fraction-print-num">${idx + 1}</div>
                                <h4>Oppgave ${idx + 1}</h4>
                            </div>
                            <div class="fraction-print-answer-key-row">
                                <span>Svar:</span>
                                ${fractionHtml(answer)}
                            </div>
                        </article>
                    `;
                }).join("")}
            </div>
        </section>
    `;
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
    const [includeHints, setIncludeHints] = useState(true);
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
        }),
        [includeHints, worksheet]
    );

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
        if (worksheetWithDisplayOptions.tasks.length === 0) return;

        const printWindow = window.open("", "_blank", "width=1000,height=1400");
        if (!printWindow) return;

        const printWorksheet = worksheetWithDisplayOptions;
        const styles = `
            <style>
                @page { size: A4; margin: 14mm; }

                html, body {
                    margin: 0;
                    padding: 0;
                    background: #fff;
                    color: #0f172a;
                    font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
                }

                * {
                    box-sizing: border-box;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }

                .fraction-print-root {
                    max-width: 980px;
                    margin: 0 auto;
                }

                .fraction-print-brandbar {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 16px;
                    margin-bottom: 18px;
                    padding-bottom: 14px;
                    border-bottom: 1px solid #e2e8f0;
                }

                .fraction-print-brandleft {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .fraction-print-brandlogo {
                    width: 60px;
                    height: auto;
                    object-fit: contain;
                    flex-shrink: 0;
                }

                .fraction-print-brandtitle {
                    font-size: 20px;
                    font-weight: 800;
                    line-height: 1.1;
                }

                .fraction-print-brandsite {
                    margin-top: 2px;
                    font-size: 12px;
                    color: #64748b;
                    font-weight: 600;
                }

                .fraction-print-badge {
                    border: 1px solid #e2e8f0;
                    border-radius: 999px;
                    padding: 7px 12px;
                    font-size: 13px;
                    font-weight: 600;
                    color: #334155;
                }

                .fraction-print-title-wrap {
                    margin-bottom: 20px;
                    padding-bottom: 14px;
                    border-bottom: 1px solid #e2e8f0;
                }

                .fraction-print-title {
                    margin: 0;
                    font-size: 24px;
                    line-height: 1.2;
                    font-weight: 800;
                }

                .fraction-print-instructions {
                    margin: 8px 0 0;
                    font-size: 14px;
                    color: #475569;
                }

                .fraction-print-meta-grid {
                    margin-top: 16px;
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 10px;
                }

                .fraction-print-meta-box {
                    border: 1px solid #e2e8f0;
                    border-radius: 14px;
                    padding: 10px 12px;
                    font-size: 13px;
                    color: #334155;
                }

                .fraction-print-meta-box:last-child {
                    grid-column: 1 / -1;
                }

                .fraction-print-task-list {
                    display: grid;
                    gap: 14px;
                }

                .fraction-print-task {
                    border: 1px solid #e2e8f0;
                    border-radius: 20px;
                    padding: 14px;
                    break-inside: avoid;
                    page-break-inside: avoid;
                }

                .fraction-print-head {
                    display: flex;
                    align-items: flex-start;
                    gap: 10px;
                    margin-bottom: 10px;
                }

                .fraction-print-num {
                    width: 26px;
                    height: 26px;
                    border-radius: 999px;
                    background: #0f172a;
                    color: #fff;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 13px;
                    font-weight: 700;
                    flex-shrink: 0;
                }

                .fraction-print-head h4 {
                    margin: 1px 0 0;
                    font-size: 15px;
                    line-height: 1.25;
                    font-weight: 700;
                }

                .fraction-print-write-grid,
                .fraction-print-choice-grid,
                .fraction-print-shade-grid {
                    display: grid;
                    align-items: center;
                    gap: 14px;
                }

                .fraction-print-write-grid {
                    grid-template-columns: 220px minmax(0, 1fr);
                }

                .fraction-print-choice-grid {
                    grid-template-columns: 190px minmax(0, 1fr);
                }

                .fraction-print-shade-grid {
                    grid-template-columns: 96px minmax(0, 1fr);
                }

                .fraction-print-figure-box {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 120px;
                    border-radius: 16px;
                    background: #f8fafc;
                    padding: 10px;
                    overflow: visible;
                }

                .fraction-print-answer-box {
                    border: 1px dashed #cbd5e1;
                    border-radius: 16px;
                    background: #fff;
                    min-height: 92px;
                    padding: 12px;
                    display: flex;
                    align-items: center;
                    gap: 18px;
                }

                .fraction-print-answer-box > span,
                .fraction-print-answer-key-row > span {
                    font-size: 14px;
                    font-weight: 700;
                    color: #475569;
                }

                .fraction-print-answer-lines {
                    display: grid;
                    gap: 16px;
                    width: 90px;
                }

                .fraction-print-answer-lines div {
                    height: 2px;
                    background: #0f172a;
                    border-radius: 999px;
                }

                .fraction-print-options {
                    display: grid;
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                    gap: 10px;
                }

                .fraction-print-option {
                    border: 1px solid #cbd5e1;
                    border-radius: 16px;
                    min-height: 74px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: #fff;
                }

                .fraction-print-target {
                    display: flex;
                    justify-content: center;
                }

                .fraction-print-fraction {
                    display: inline-flex;
                    min-width: 2.4em;
                    flex-direction: column;
                    align-items: center;
                    vertical-align: middle;
                    font-size: 24px;
                    font-weight: 800;
                    line-height: 1;
                }

                .fraction-print-line {
                    width: 100%;
                    height: 2px;
                    margin: 4px 0;
                    border-radius: 999px;
                    background: currentColor;
                }

                .fraction-print-circle {
                    display: block;
                    width: 128px;
                    height: 128px;
                    background: #f1f5f9;
                    border: 3px solid #111827;
                    border-radius: 18px;
                    padding: 7px;
                }

                .fraction-print-rect {
                    display: grid;
                    padding: 8px;
                    border: 3px solid #111827;
                    background: #f1f5f9;
                    width: fit-content;
                }

                .fraction-print-cell {
                    width: 28px;
                    height: 28px;
                    border: 2px solid #111827;
                    margin-left: -2px;
                    margin-top: -2px;
                    background: #f8fafc;
                }

                .fraction-print-cell.is-active,
                .fraction-print-bar-part.is-active {
                    background: #10b981;
                }

                .fraction-print-circle path,
                .fraction-print-cell.is-active,
                .fraction-print-bar-part.is-active {
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }

                .fraction-print-bar {
                    display: inline-flex;
                    padding: 8px;
                    border: 3px solid #111827;
                    background: #f1f5f9;
                    max-width: 100%;
                }

                .fraction-print-bar-part {
                    height: 58px;
                    border: 2px solid #111827;
                    margin-left: -2px;
                    background: #f8fafc;
                }

                .fraction-print-bar-part:first-child {
                    margin-left: 0;
                }

                .fraction-print-hint {
                    margin-top: 10px;
                    border-radius: 14px;
                    background: #fffbeb;
                    padding: 10px;
                    font-size: 13px;
                    color: #334155;
                }

                .fraction-print-answer-key-section {
                    margin-top: 28px;
                    border-top: 2px solid #cbd5e1;
                    padding-top: 18px;
                }

                .fraction-print-answer-key-section h3 {
                    margin: 0 0 14px;
                    font-size: 22px;
                    font-weight: 800;
                }

                .fraction-print-answer-key-task {
                    background: #ecfdf5;
                    border-color: #a7f3d0;
                }

                .fraction-print-answer-key-row {
                    display: inline-flex;
                    align-items: center;
                    gap: 12px;
                    border: 1px solid #a7f3d0;
                    border-radius: 16px;
                    background: #fff;
                    padding: 10px 14px;
                }

                .fraction-print-page-break {
                    break-before: page;
                    page-break-before: always;
                    height: 0;
                }

                @media print {
                    .fraction-print-task {
                        break-inside: avoid;
                        page-break-inside: avoid;
                    }
                }
            </style>
        `;

        printWindow.document.open();
        printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(printWorksheet.title)}</title>
        ${styles}
      </head>
      <body>
        <main class="fraction-print-root">
            <div class="fraction-print-brandbar">
                <div class="fraction-print-brandleft">
                    <img src="/logo321ny.png" alt="321 school" class="fraction-print-brandlogo" />
                    <div>
                        <div class="fraction-print-brandtitle">321 school</div>
                        <div class="fraction-print-brandsite">321school.com</div>
                    </div>
                </div>
                <div class="fraction-print-badge">Arbeidsark</div>
            </div>

            <section class="fraction-print-title-wrap">
                <h1 class="fraction-print-title">${escapeHtml(printWorksheet.title)}</h1>
                <p class="fraction-print-instructions">${escapeHtml(printWorksheet.instructions)}</p>
                <div class="fraction-print-meta-grid">
                    <div class="fraction-print-meta-box"><strong>Navn:</strong></div>
                    <div class="fraction-print-meta-box"><strong>Dato:</strong></div>
                    <div class="fraction-print-meta-box"><strong>Klasse:</strong></div>
                </div>
            </section>

            <section class="fraction-print-task-list">
                ${printWorksheet.tasks.map((task, idx) => printTaskHtml(task, idx, printWorksheet)).join("")}
            </section>

            ${answerKeyHtml(printWorksheet)}
        </main>
      </body>
    </html>
  `);
        printWindow.document.close();

        const images = Array.from(printWindow.document.images);
        const doPrint = () => {
            printWindow.focus();
            printWindow.print();
        };

        if (images.length === 0) {
            doPrint();
            return;
        }

        let loaded = 0;
        const done = () => {
            loaded += 1;
            if (loaded >= images.length) doPrint();
        };

        images.forEach((img) => {
            if (img.complete) {
                done();
            } else {
                img.onload = done;
                img.onerror = done;
            }
        });
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

            setWorksheet({
                ...data.worksheet,
                showHints: includeHints,
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : "Kunne ikke lage brøkark.");
        } finally {
            setLoading(false);
        }
    }

    async function saveWorksheetAndGetId(): Promise<string | null> {
        if (worksheetWithDisplayOptions.tasks.length === 0) {
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
                worksheet: worksheetWithDisplayOptions,
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
                    title: worksheetWithDisplayOptions.title,
                    level: worksheetWithDisplayOptions.level,
                    language: worksheetWithDisplayOptions.language,
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

                        <button
                            type="button"
                            onClick={() => setIncludeHints((value) => !value)}
                            className={`w-full rounded-2xl border px-3 py-2 text-left text-sm ${includeHints
                                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                                : "border-slate-200 bg-white text-slate-700"
                                }`}
                        >
                            {includeHints ? "✓ Vis hint" : "Vis hint"}
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
                        includeHints={includeHints}
                        showAutoCheck={false}
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
