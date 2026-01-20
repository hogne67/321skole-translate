// app/api/translate/route.ts
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
    const text = pickString(body, ["text", "sourceText", "input"]);
    const targetLang = pickString(body, ["targetLang", "to", "lang"]) || "no";
    const targetLanguageName = langName(targetLang);

    if (!text) return Response.json({ error: "Mangler tekst." }, { status: 400 });

    const r = await client.responses.create({
      model: "gpt-4o-mini",
      input: [
        {
          role: "system",
          content:
            "You are a precise translator. Output ONLY the translation, no quotes, no explanations.",
        },
        {
          role: "user",
          content:
            `TARGET LANGUAGE: ${targetLanguageName}\n` +
            `CRITICAL: The output MUST be written ONLY in ${targetLanguageName}. No mixed languages.\n\n` +
            `TEXT:\n${text}\n\n` +
            `Translate the TEXT into ${targetLanguageName}. Keep meaning, tone, and formatting. Return only the translation.`,
        },
      ],
    });

    const translatedText = (r.output_text ?? "").trim();

    if (!translatedText) {
      return Response.json({ error: "Tom oversettelse fra modellen." }, { status: 500 });
    }

    // ✅ This is the only shape the frontend expects
    return Response.json({ translatedText });
  } catch (err: any) {
    console.error("Translate route error:", err);
    return Response.json({ error: err?.message ?? "Translate failed" }, { status: 500 });
  }
}
