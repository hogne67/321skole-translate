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

export async function POST(req: Request) {
  try {
    // ✅ Les JSON body (fallback til tom)
    const body = await req.json().catch(() => ({}));

    // ✅ Støtt flere navn (så frontend/backend ikke må matche 100% mens vi bygger)
    const lesetekst = pickString(body, ["lesetekst", "leseTekst", "sourceText", "text"]);
    const oppgave = pickString(body, ["oppgave", "prompt", "task"]);
    const svar = pickString(body, ["svar", "answer"]);
    const nivå = pickString(body, ["nivå", "level"]) || "A2";

    if (!lesetekst) return Response.json({ error: "Mangler lesetekst." }, { status: 400 });
    if (!oppgave) return Response.json({ error: "Mangler oppgave." }, { status: 400 });
    if (!svar) return Response.json({ error: "Mangler svar." }, { status: 400 });

    const r = await client.responses.create({
      model: "gpt-4o-mini",
      input: [
        {
          role: "system",
          content:
            "You are a language teacher. Give short, helpful feedback adapted to the learner's CEFR level. Use simple language. Provide: (1) overall feedback, (2) 3 concrete improvements, (3) a corrected version. Keep it concise.",
        },
        {
          role: "user",
          content:
            `CEFR level: ${nivå}\n\n` +
            `Reading text (context):\n${lesetekst}\n\n` +
            `Task:\n${oppgave}\n\n` +
            `Student answer:\n${svar}`,
        },
      ],
    });

    const feedback = r.output_text?.trim() ?? "";
    return Response.json({ feedback });
  } catch (err: any) {
    console.error("Feedback route error:", err);
    return Response.json({ error: err?.message ?? "Feedback failed" }, { status: 500 });
  }
}

