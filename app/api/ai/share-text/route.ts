import { NextResponse } from "next/server";

type ShareTone = "short" | "professional" | "friendly";
type ShareKind = "lesson" | "space" | "generic";

function fallbackVariants(locale: string, kind: ShareKind, title: string): string[] {
  if (locale === "nb") {
    if (kind === "space") {
      return [
        `Leter du etter en enklere måte å organisere læring på? Med 321skole kan du lage innhold med KI og dele det i Spaces. ${title ? `Her er et eksempel: ${title}.` : ""}`.trim(),
        `321skole samler oppgaver, KI-assistent, KI-tilbakemelding og deling i Spaces på ett sted. ${title ? `Dette viser det i praksis: ${title}.` : ""}`.trim(),
        `Vil du samle elever, oppgaver og deling i én løsning? 321skole gjør det enkelt å jobbe i Spaces.${title ? ` ${title}.` : ""}`.trim(),
        `Lag. Del. Samarbeid. 321skole gjør læring enklere med KI og Spaces.${title ? ` ${title}.` : ""}`.trim(),
      ];
    }

    return [
      `Har du prøvd en læringsplattform der du kan lage egne oppgaver med KI, gi KI-tilbakemelding og dele i Spaces? ${title ? `Her er et eksempel: ${title}.` : ""}`.trim(),
      `321skole gir lærere, elever og foreldre én plattform for egne oppgaver, KI-assistent, KI-tilbakemelding og deling i Spaces. ${title ? `Dette opplegget viser det i praksis: ${title}.` : ""}`.trim(),
      `Så fint når du kan lage oppgaver med KI, få hjelp underveis og samle alt i egne Spaces. ${title ? `${title} er et lite glimt av hva 321skole kan gjøre.` : "321skole gjør det enkelt."}`.trim(),
      `Lag egne oppgaver. Få KI-hjelp. Del i Spaces. Det er 321skole.${title ? ` ${title}.` : ""}`.trim(),
    ];
  }

  if (locale === "pt") {
    if (kind === "space") {
      return [
        `Quer uma forma mais simples de organizar a aprendizagem? Com o 321skole você cria conteúdo com IA e compartilha nos Spaces. ${title ? `Aqui está um exemplo: ${title}.` : ""}`.trim(),
        `O 321skole reúne tarefas, assistente de IA, feedback com IA e compartilhamento em Spaces em um só lugar. ${title ? `Um exemplo prático: ${title}.` : ""}`.trim(),
        `Quer reunir alunos, tarefas e compartilhamento em uma única solução? O 321skole facilita tudo com Spaces.${title ? ` ${title}.` : ""}`.trim(),
        `Criar. Compartilhar. Colaborar. O 321skole facilita a aprendizagem com IA e Spaces.${title ? ` ${title}.` : ""}`.trim(),
      ];
    }

    return [
      `Você já experimentou uma plataforma de aprendizagem onde pode criar suas próprias tarefas com IA, receber feedback com IA e compartilhar nos Spaces? ${title ? `Aqui vai um exemplo: ${title}.` : ""}`.trim(),
      `O 321skole oferece uma plataforma completa para professores, alunos e pais, com criação de conteúdo, assistente de IA, feedback com IA e compartilhamento em Spaces. ${title ? `Este exemplo mostra isso na prática: ${title}.` : ""}`.trim(),
      `Muito bom quando você pode criar atividades com IA, receber ajuda no processo e reunir tudo em seus próprios Spaces. ${title ? `${title} mostra um pouco do que o 321skole pode fazer.` : "O 321skole facilita tudo."}`.trim(),
      `Crie suas próprias tarefas. Use IA. Compartilhe nos Spaces. Isso é 321skole.${title ? ` ${title}.` : ""}`.trim(),
    ];
  }

  if (kind === "space") {
    return [
      `Looking for a simpler way to organize learning? With 321skole you can create content with AI and share it in Spaces. ${title ? `Here is one example: ${title}.` : ""}`.trim(),
      `321skole brings tasks, AI assistance, AI feedback and sharing in Spaces together in one platform. ${title ? `A practical example: ${title}.` : ""}`.trim(),
      `Want one place for students, tasks and collaboration? 321skole makes it easier with Spaces.${title ? ` ${title}.` : ""}`.trim(),
      `Create. Share. Collaborate. 321skole makes learning easier with AI and Spaces.${title ? ` ${title}.` : ""}`.trim(),
    ];
  }

  return [
    `Have you tried a learning platform where you can create your own tasks with AI, get AI feedback and share in Spaces? ${title ? `Here is one example: ${title}.` : ""}`.trim(),
    `321skole gives teachers, students and parents one platform for custom tasks, AI assistance, AI feedback and sharing in Spaces. ${title ? `This example shows it in practice: ${title}.` : ""}`.trim(),
    `It is great when you can create learning content with AI, get help along the way and keep everything in your own Spaces. ${title ? `${title} is a small glimpse of what 321skole can do.` : "321skole makes it simple."}`.trim(),
    `Create your own tasks. Use AI. Share in Spaces. That is 321skole.${title ? ` ${title}.` : ""}`.trim(),
  ];
}

function extractTextFromResponsesApi(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const root = data as Record<string, unknown>;
  const output = Array.isArray(root.output) ? root.output : [];

  const texts: string[] = [];

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? ((item as Record<string, unknown>).content as unknown[])
      : [];

    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const p = part as Record<string, unknown>;
      if (typeof p.text === "string" && p.text.trim()) {
        texts.push(p.text.trim());
      }
    }
  }

  return texts.join("\n").trim();
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const tone: ShareTone =
      body?.tone === "short" || body?.tone === "friendly" || body?.tone === "professional"
        ? body.tone
        : "professional";
    const locale = typeof body?.locale === "string" ? body.locale : "en";
    const kind: ShareKind =
      body?.kind === "lesson" || body?.kind === "space" || body?.kind === "generic"
        ? body.kind
        : "generic";

    const language =
      locale === "nb"
        ? "Norwegian Bokmål"
        : locale === "pt"
          ? "Brazilian Portuguese"
          : "English";

    const toneInstruction =
      tone === "short"
        ? "Prefer compact wording and keep each variant tighter."
        : tone === "friendly"
          ? "Use a warm, inviting tone. You may use one light emoji in only one variant if it feels natural."
          : "Use a clear, confident and professional tone.";

    const kindInstruction =
      kind === "space"
        ? `The shared item is a Space. Emphasize collaboration, sharing, organizing students, and using Spaces inside 321skole.`
        : kind === "lesson"
          ? `The shared item is a task or lesson. Mention the specific item naturally, but still promote 321skole as the main message.`
          : `The shared item is generic. Keep the focus on 321skole overall.`;

    const prompt = `
Write exactly 4 different social media post suggestions in ${language}.

The goal is to promote both the item and the platform "321skole", not just the specific shared item.

${toneInstruction}
${kindInstruction}

Core benefits to highlight across the 4 variants:
- create, share and give feedback in your own space.
- Create and generate amazing lessons in minutes.
- lessons with translation, audio and instant feedback.
- learning platform for teachers, students and parents
- Made by teachers for the best learning!

Shared item title:
"${title}"

Style requirements:
1. Question-based opening
2. Professional
3. Friendly
4. Short and punchy

Rules:
- 2 to 4 short lines per variant
- No hashtags
- No salesy exaggeration
- No emojis except maybe one light emoji in the friendly version
- Make them sound naturally different
- Mention 321skole clearly in each variant
- Mention the shared item title naturally when it fits

Return ONLY valid JSON in this exact format:
{
  "variants": [
    "variant 1",
    "variant 2",
    "variant 3",
    "variant 4"
  ]
}
`.trim();

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}`,
      },
      body: JSON.stringify({
        model: "gpt-5.3",
        input: prompt,
      }),
    });

    if (!response.ok) {
      return NextResponse.json(
        { variants: fallbackVariants(locale, kind, title) },
        { status: 200 }
      );
    }

    const data = await response.json();
    const text = extractTextFromResponsesApi(data);

    let variants: string[] = [];

    try {
      const parsed = JSON.parse(text) as { variants?: unknown };
      if (Array.isArray(parsed.variants)) {
        variants = parsed.variants.filter((v): v is string => typeof v === "string" && !!v.trim());
      }
    } catch {
      // ignore and use fallback below
    }

    if (variants.length < 4) {
      variants = fallbackVariants(locale, kind, title);
    }

    return NextResponse.json({ variants });
  } catch {
    return NextResponse.json(
      { variants: fallbackVariants("en", "generic", "") },
      { status: 200 }
    );
  }
}