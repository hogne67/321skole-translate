// app/api/translate/route.ts
import OpenAI from "openai";

export const runtime = "nodejs";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function toErrorString(err: unknown): string {
  if (!err) return "Translate failed";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;

  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    const message = typeof o.message === "string" ? o.message : "";
    const code = typeof o.code === "string" ? o.code : "";
    return message || code || "Translate failed";
  }
  return "Translate failed";
}

function pickString(obj: unknown, keys: string[]) {
  const rec = obj && typeof obj === "object" ? (obj as Record<string, unknown>) : null;

  for (const k of keys) {
    const v = rec?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

// Keep this minimal + reliable for prompts (AI-facing names)
function langName(code: string) {
  const c = (code || "").trim();

  const m: Record<string, string> = {
    nb: "Norwegian (Bokmål)",
    no: "Norwegian (Bokmål)",
    nn: "Norwegian (Nynorsk)",
    en: "English",
    uk: "Ukrainian",
    ar: "Arabic",
    pl: "Polish",
    es: "Spanish",

    // Portuguese variants
    "pt-BR": "Brazilian Portuguese",
    "pt-PT": "European Portuguese",
    pt: "Portuguese",

    // ✅ Tigrinya
    ti: "Tigrinya",
    // Also common related languages (optional but helpful)
    am: "Amharic",
    "fa-AF": "Dari",
    fa: "Persian",
    ps: "Pashto",
    sw: "Swahili",
    rw: "Kinyarwanda",
    ln: "Lingala",
  };

  return m[c] ?? c;
}

function looksLikeEthiopic(text: string) {
  const s = (text || "").trim();
  if (!s) return false;

  const ethiopic = (s.match(/[\u1200-\u137F]/g) || []).length; // Ethiopic block
  const letters = (s.match(/\p{L}/gu) || []).length;

  if (ethiopic < 10) return false;
  if (letters > 0 && ethiopic / letters < 0.2) return false;

  return true;
}

async function translateOnce(text: string, targetLang: string) {
  const targetLanguageName = langName(targetLang);

  const isTigrinya = targetLang === "ti";
  const extraHardLock = isTigrinya
    ? `\n\nTIGRINYA REQUIREMENTS:\n- Output MUST be in Tigrinya (ti) using Ethiopic script.\n- Do NOT output Amharic, Arabic, English, or any other language.\n- If you cannot comply, output exactly: __LANGUAGE_ERROR__`
    : "";

  const r = await client.responses.create({
    model: "gpt-4o-mini",
    input: [
      {
        role: "system",
        content: "You are a precise translator. Output ONLY the translation, no quotes, no explanations.",
      },
      {
        role: "user",
        content:
          `TARGET LANGUAGE: ${targetLanguageName} (code: ${targetLang})\n` +
          `CRITICAL: The output MUST be written ONLY in ${targetLanguageName}. No mixed languages.` +
          extraHardLock +
          `\n\nTEXT:\n${text}\n\n` +
          `Translate the TEXT into ${targetLanguageName}. Keep meaning, tone, and formatting. Return only the translation.`,
      },
    ],
  });

  return (r.output_text ?? "").trim();
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as unknown;

    const text = pickString(body, ["text", "sourceText", "input"]);
    const targetLang = pickString(body, ["targetLang", "to", "lang"]) || "nb";

    if (!text) return Response.json({ error: "Mangler tekst." }, { status: 400 });

    // 1) First attempt
    let translatedText = await translateOnce(text, targetLang);

    if (!translatedText) {
      return Response.json({ error: "Tom oversettelse fra modellen." }, { status: 500 });
    }

    // 2) Handle hard failure
    if (translatedText.includes("__LANGUAGE_ERROR__")) {
      translatedText = await translateOnce(text, targetLang);
    }

    // 3) Validate Tigrinya script + retry once if it looks wrong
    if (targetLang === "ti" && !looksLikeEthiopic(translatedText)) {
      const retry = await translateOnce(text, targetLang);
      if (retry && looksLikeEthiopic(retry)) translatedText = retry;
    }

    if (!translatedText) {
      return Response.json({ error: "Tom oversettelse fra modellen." }, { status: 500 });
    }

    return Response.json({ translatedText });
  } catch (err: unknown) {
    console.error("Translate route error:", err);
    return Response.json({ error: toErrorString(err) }, { status: 500 });
  }
}
