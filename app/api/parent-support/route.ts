// app/api/parent-support/route.ts
import "server-only";

import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v);
}

function safeString(v: unknown): string {
    return typeof v === "string" ? v.trim() : "";
}

export async function POST(req: Request) {
    try {
        const body: unknown = await req.json().catch(() => ({}));

        if (!isRecord(body)) {
            return NextResponse.json({ error: "Invalid body" }, { status: 400 });
        }

        const assignmentTitle = safeString(body.assignmentTitle);
        const sourceText = safeString(body.sourceText);
        const autoSummary = safeString(body.autoSummary);
        const aiFeedback = safeString(body.aiFeedback);
        const childComment = safeString(body.childComment);
        const childSelfReport = Array.isArray(body.childSelfReport)
            ? body.childSelfReport.map(String).filter(Boolean)
            : [];

        const answersSummary = safeString(body.answersSummary);
        const parentGoal = safeString(body.parentGoal);

        const system = `
Du er en varm, konkret og pedagogisk veileder for foreldre.

Forelderen er en viktig læringsstøtte hjemme. Du skal hjelpe forelderen å forstå barnets arbeid og kommunisere godt med barnet.

Du skal IKKE skrive som en streng lærer.
Du skal IKKE gi karakter.
Du skal IKKE bruke CEFR-nivåer med mindre det er helt nødvendig.
Du skal IKKE overdrive feil.
Du skal løfte innsats, lesing, refleksjon og utvikling.

Svar alltid som gyldig JSON med nøyaktig disse feltene:
{
  "parentMessage": "...",
  "childMessage": "...",
  "nextStep": "..."
}

parentMessage:
- Råd til forelderen.
- Varmt og konkret.
- 80–140 ord.
- Forklar hva barnet viser, og hvordan forelderen kan støtte videre.

childMessage:
- En melding forelderen kan lime inn til barnet.
- Skriv direkte til barnet.
- 100–180 ord.
- Struktur:
  1. Noe positivt først.
  2. Kort kommentar om resultat/arbeidsmåte.
  3. Konkret språk/grammatikk hvis relevant, maks tre eksempler.
  4. Positiv avslutning og neste steg.
- Bruk enkel, trygg og motiverende språkføring.

nextStep:
- Ett konkret forslag til hva forelder og barn kan gjøre hjemme.
- Kort og praktisk.
`.trim();

        const user = `
Oppgave: ${assignmentTitle || "Uten tittel"}

Barnets egenmelding:
${childSelfReport.length ? childSelfReport.map((x) => `- ${x}`).join("\n") : "Ingen egenmelding registrert."}

Kommentar fra barnet:
${childComment || "Ingen kommentar."}

Autokorrekt/resultat:
${autoSummary || "Ikke tilgjengelig."}

Eksisterende AI-feedback/retting:
${aiFeedback || "Ikke tilgjengelig."}

Kort sammendrag av svar:
${answersSummary || "Ikke tilgjengelig."}

Eventuelt mål hjemme:
${parentGoal || "Ikke oppgitt."}

Tekst/oppgavegrunnlag:
${sourceText.slice(0, 6000) || "Ikke tilgjengelig."}
`.trim();

        const completion = await client.chat.completions.create({
            model: "gpt-4.1-mini",
            temperature: 0.5,
            response_format: { type: "json_object" },
            messages: [
                { role: "system", content: system },
                { role: "user", content: user },
            ],
        });

        const raw = completion.choices[0]?.message?.content ?? "{}";

        let parsed: unknown = {};
        try {
            parsed = JSON.parse(raw);
        } catch {
            return NextResponse.json(
                { error: "AI returned invalid JSON", raw },
                { status: 500 }
            );
        }

        if (!isRecord(parsed)) {
            return NextResponse.json({ error: "Invalid AI response" }, { status: 500 });
        }

        return NextResponse.json({
            parentMessage: safeString(parsed.parentMessage),
            childMessage: safeString(parsed.childMessage),
            nextStep: safeString(parsed.nextStep),
        });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Could not generate parent support.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}