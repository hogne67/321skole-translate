// app/api/vocab/route.ts
import OpenAI from "openai";

export const runtime = "nodejs";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function pickString(obj: any, keys: string[]) {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function pickNumber(obj: any, keys: string[], fallback: number) {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && !isNaN(Number(v))) return Number(v);
  }
  return fallback;
}

function langName(code: string) {
  const m: Record<string, string> = {
    no: "Norwegian (Bokmål)",
    en: "English",
    uk: "Ukrainian",
    ar: "Arabic",
    pl: "Polish",
    es: "Spanish",
    pt: "Portuguese (Brazil)",
  };
  return m[code] ?? code;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const text = pickString(body, ["text", "lesetekst", "sourceText"]);
    const targetLang = pickString(body, ["targetLang", "lang", "to"]) || "no";
    const targetLanguageName = langName(targetLang);

    const level = pickString(body, ["level", "nivå"]) || "A2";
    const count = Math.min(30, Math.max(5, pickNumber(body, ["count", "n"], 10)));

    if (!text) return Response.json({ error: "Mangler tekst." }, { status: 400 });

    const r = await client.responses.create({
      model: "gpt-4o-mini",
      text: { format: { type: "json_object" } },
      input: [
        {
          role: "system",
          content:
            "You are a careful language teacher and translator. Use context from the provided TEXT. Output valid JSON only.",
        },
        {
          role: "user",
          content:
            `CEFR: ${level}\n` +
            `TARGET LANGUAGE: ${targetLanguageName}\n` +
            `CRITICAL RULE: The fields "meaning" and "exampleTranslation" MUST be written ONLY in ${targetLanguageName}. No mixed languages.\n\n` +
            `TEXT:\n${text}\n\n` +
            `TASK:\n` +
            `Pick ${count} useful vocabulary items from the TEXT for a learner at this CEFR level.\n` +
            `Use context: include ONE exact example sentence copied from the TEXT that contains the term.\n\n` +
            `Return JSON exactly like this:\n` +
            `{\n` +
            `  "items": [\n` +
            `    {\n` +
            `      "term": "as it appears in the text",\n` +
            `      "baseForm": "base form/lemma if helpful, else same as term",\n` +
            `      "pos": "noun/verb/adj/etc.",\n` +
            `      "meaning": "short translation/meaning in ${targetLanguageName}",\n` +
            `      "example": "ONE sentence copied exactly from the TEXT",\n` +
            `      "exampleTranslation": "translation of example sentence into ${targetLanguageName}",\n` +
            `      "note": "optional short note (also in ${targetLanguageName})"\n` +
            `    }\n` +
            `  ]\n` +
            `}\n\n` +
            `Self-check before final output:\n` +
            `- If any "meaning" or "exampleTranslation" contains words from other languages, rewrite them fully in ${targetLanguageName}.\n`,
        },
      ],
    });

    const raw = r.output_text?.trim() ?? "{}";

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return Response.json({ error: "Ugyldig JSON fra modellen.", raw }, { status: 500 });
    }

    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    return Response.json({ items });
  } catch (err: any) {
    console.error("Vocab route error:", err);
    return Response.json({ error: err?.message ?? "Vocab failed" }, { status: 500 });
  }
}
