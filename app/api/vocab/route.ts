// app/api/vocab/route.ts
import OpenAI from "openai";

export const runtime = "nodejs";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type JsonObject = Record<string, unknown>;

function isObject(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null;
}

function pickString(obj: unknown, keys: string[]) {
  if (!isObject(obj)) return "";
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function pickNumber(obj: unknown, keys: string[], fallback: number) {
  if (!isObject(obj)) return fallback;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim()) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
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

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Vocab failed";
}

export async function POST(req: Request) {
  try {
    const body: unknown = await req.json().catch(() => ({} as unknown));

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

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return Response.json({ error: "Ugyldig JSON fra modellen.", raw }, { status: 500 });
    }

    const obj = isObject(parsed) ? parsed : {};
    const items = Array.isArray(obj.items) ? obj.items : [];
    return Response.json({ items });
  } catch (err: unknown) {
    console.error("Vocab route error:", err);
    return Response.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}
