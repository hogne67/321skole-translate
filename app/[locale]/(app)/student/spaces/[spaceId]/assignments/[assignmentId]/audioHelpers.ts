import type { SentenceSeg } from "./types";

export function segmentSentences(fullText: string): {
    clean: string;
    segs: SentenceSeg[];
} {
    const clean = (fullText || "").replace(/\r\n/g, "\n").trim();
    if (!clean) return { clean: "", segs: [] };

    const parts = clean
        .split(/(?<=[.!?])\s+|\n+/g)
        .map((s) => s.trim())
        .filter(Boolean);

    if (parts.length === 0) return { clean, segs: [] };

    const segsRaw: Array<{
        text: string;
        startChar: number;
        endChar: number;
        weight: number;
    }> = [];

    let cursor = 0;

    for (const p of parts) {
        const idx = clean.indexOf(p, cursor);
        const startChar = idx >= 0 ? idx : cursor;
        const endChar = startChar + p.length;
        cursor = endChar;

        const weight = Math.max(8, p.replace(/\s+/g, " ").length);
        segsRaw.push({ text: p, startChar, endChar, weight });
    }

    const total = segsRaw.reduce((sum, s) => sum + s.weight, 0) || 1;

    let acc = 0;

    const segs: SentenceSeg[] = segsRaw.map((s) => {
        const startRatio = acc / total;
        acc += s.weight;
        const endRatio = acc / total;

        return {
            text: s.text,
            startChar: s.startChar,
            endChar: s.endChar,
            startRatio,
            endRatio,
        };
    });

    if (segs.length) {
        segs[segs.length - 1].endRatio = 1;
    }

    return { clean, segs };
}