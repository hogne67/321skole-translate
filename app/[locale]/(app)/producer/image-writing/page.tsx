"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { getAuth } from "firebase/auth";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase";

type Language = "nb" | "en" | "pt";
type Level = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
type TaskType = "describe" | "story" | "dialogue" | "reflection";
type ImageMode = "uploaded" | "ai_generated";

const levels: Level[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
const languages: Language[] = ["nb", "en", "pt"];

const copy = {
  nb: {
    taskTypes: {
      describe: "Beskriv bildet",
      story: "Skriv en historie",
      dialogue: "Skriv en dialog",
      reflection: "Reflekter",
    },
    defaults: {
      instruction: "Skriv 10 setninger eller en tekst på mellom 50 og 100 ord som passer til bildet.",
      supportWords: [
        "Jeg ser ...",
        "Det er ...",
        "Der er det ...",
        "Til venstre ser jeg ...",
        "Til høyre er det ...",
        "I bakgrunnen kan jeg se ...",
        "Foran / bak ... står det ...",
        "Personen ser ... ut.",
        "Jeg tror at ...",
        "Kanskje ...",
        "Bildet viser ...",
        "Det virker som ...",
        "Jeg synes at ...",
        "Dette minner meg om ...",
        "Kanskje personen føler seg ... fordi ...",
      ].join("\n"),
      successCriteria: [
        "Hva ser jeg på bildet, og hvor?",
        "Hva skjer på bildet?",
        "Har jeg skrevet både fakta og egne tanker?",
        "Hva synes du om bildet?",
      ].join("\n"),
    },
    ui: {
      pageTitle: "Skriv til bilde",
      pageIntro: "Første versjon lagrer én bildebasert skriveoppgave som vanlig innhold.",
      myContent: "Mitt innhold",
      title: "Tittel",
      language: "Språk",
      level: "Nivå",
      taskType: "Oppgavetype",
      uploadMode: "Last opp / bilde-URL",
      aiMode: "AI-generert",
      uploadImage: "Last opp bilde",
      imageUrl: "Eller lim inn bilde-URL",
      imageUrlShort: "Bilde-URL",
      prompt: "Prompt til AI-bilde",
      promptPlaceholder: "Beskriv bildet du vil lage. Unngå tekst i selve bildet.",
      generate: "Generer bilde",
      generating: "Genererer...",
      storageHint: "Bildet lagres i Firebase Storage og kan brukes før oppgaven lagres.",
      imageDescription: "Bildebeskrivelse / imageDescription",
      imageDescriptionPlaceholder: "Beskriv motiv, personer, sted, handling og viktige detaljer som AI skal vurdere teksten mot.",
      instruction: "Instruksjon til eleven",
      support: "Forslag til støtteord",
      criteria: "Forslag til suksesskriterier",
      printHelp: "Ekstra hjelp på utskrift",
      none: "Ingen",
      save: "Lagre til Mitt innhold",
      saving: "Lagrer...",
      openPreview: "Åpne/forhåndsvis",
      preview: "Forhåndsvisning",
      imagePlaceholder: "Bilde vises her",
      untitled: "Uten tittel",
      aiContext: "Bildekontekst for AI-feedback",
      imageAlt: "Bildeoppgave",
    },
    messages: {
      uploaded: "Bildet er lastet opp.",
      loginUpload: "Du må være innlogget for å laste opp bilde.",
      imageOnly: "Velg en bildefil.",
      tooLarge: "Filen er for stor. Maks 8 MB.",
      loginGenerate: "Du må være innlogget for å generere bilde.",
      promptRequired: "Skriv et prompt for AI-bildet først.",
      generateFailed: "Bildegenerering feilet.",
      noImage: "Bildegenerering ga ingen bilde-URL.",
      generated: "AI-bildet er generert. Husk å skrive bildebeskrivelse før lagring.",
      loginSave: "Du må være innlogget for å lagre.",
      saveFailed: "Lagring feilet.",
      saved: "Skriveoppgaven er lagret i Mitt innhold.",
    },
  },
  en: {
    taskTypes: {
      describe: "Describe the picture",
      story: "Write a story",
      dialogue: "Write a dialogue",
      reflection: "Reflect",
    },
    defaults: {
      instruction: "Write 10 sentences or a text between 50 and 100 words that fits the picture.",
      supportWords: [
        "I can see ...",
        "There is ...",
        "There are ...",
        "On the left, I can see ...",
        "On the right, there is ...",
        "In the background, I can see ...",
        "In front of / behind ... there is ...",
        "The person looks ...",
        "I think that ...",
        "Maybe ...",
        "The picture shows ...",
        "It seems like ...",
        "I think ...",
        "This reminds me of ...",
        "Maybe the person feels ... because ...",
      ].join("\n"),
      successCriteria: [
        "What can I see in the picture, and where?",
        "What is happening in the picture?",
        "Have I written both facts and my own thoughts?",
        "What do I think about the picture?",
      ].join("\n"),
    },
    ui: {
      pageTitle: "Write to a Picture",
      pageIntro: "First version saves one image-based writing task as regular content.",
      myContent: "My content",
      title: "Title",
      language: "Language",
      level: "Level",
      taskType: "Task type",
      uploadMode: "Upload / image URL",
      aiMode: "AI-generated",
      uploadImage: "Upload image",
      imageUrl: "Or paste image URL",
      imageUrlShort: "Image URL",
      prompt: "AI image prompt",
      promptPlaceholder: "Describe the image you want to create. Avoid text inside the image.",
      generate: "Generate image",
      generating: "Generating...",
      storageHint: "The image is saved in Firebase Storage and can be used before the task is saved.",
      imageDescription: "Image description / imageDescription",
      imageDescriptionPlaceholder: "Describe the motif, people, place, action and important details AI should assess the text against.",
      instruction: "Instruction for the student",
      support: "Suggested support words",
      criteria: "Suggested success criteria",
      printHelp: "Extra help on printout",
      none: "None",
      save: "Save to My content",
      saving: "Saving...",
      openPreview: "Open/preview",
      preview: "Preview",
      imagePlaceholder: "Image appears here",
      untitled: "Untitled",
      aiContext: "Image context for AI feedback",
      imageAlt: "Image task",
    },
    messages: {
      uploaded: "The image has been uploaded.",
      loginUpload: "You must be logged in to upload an image.",
      imageOnly: "Choose an image file.",
      tooLarge: "The file is too large. Max 8 MB.",
      loginGenerate: "You must be logged in to generate an image.",
      promptRequired: "Write a prompt for the AI image first.",
      generateFailed: "Image generation failed.",
      noImage: "Image generation returned no image URL.",
      generated: "The AI image has been generated. Remember to write an image description before saving.",
      loginSave: "You must be logged in to save.",
      saveFailed: "Saving failed.",
      saved: "The writing task has been saved to My content.",
    },
  },
  pt: {
    taskTypes: {
      describe: "Descrever a imagem",
      story: "Escrever uma história",
      dialogue: "Escrever um diálogo",
      reflection: "Refletir",
    },
    defaults: {
      instruction: "Escreva 10 frases ou um texto entre 50 e 100 palavras que combine com a imagem.",
      supportWords: [
        "Eu vejo ...",
        "Há ...",
        "Ali há ...",
        "À esquerda, eu vejo ...",
        "À direita, há ...",
        "No fundo, posso ver ...",
        "Na frente de / atrás de ... há ...",
        "A pessoa parece ...",
        "Eu acho que ...",
        "Talvez ...",
        "A imagem mostra ...",
        "Parece que ...",
        "Eu penso que ...",
        "Isto me lembra ...",
        "Talvez a pessoa se sinta ... porque ...",
      ].join("\n"),
      successCriteria: [
        "O que vejo na imagem, e onde?",
        "O que está acontecendo na imagem?",
        "Escrevi fatos e também minhas próprias ideias?",
        "O que eu acho da imagem?",
      ].join("\n"),
    },
    ui: {
      pageTitle: "Escrever a partir de imagem",
      pageIntro: "A primeira versão salva uma tarefa de escrita baseada em imagem como conteúdo normal.",
      myContent: "Meu conteúdo",
      title: "Título",
      language: "Idioma",
      level: "Nível",
      taskType: "Tipo de tarefa",
      uploadMode: "Enviar / URL da imagem",
      aiMode: "Gerada por IA",
      uploadImage: "Enviar imagem",
      imageUrl: "Ou cole a URL da imagem",
      imageUrlShort: "URL da imagem",
      prompt: "Prompt da imagem de IA",
      promptPlaceholder: "Descreva a imagem que você quer criar. Evite texto dentro da imagem.",
      generate: "Gerar imagem",
      generating: "Gerando...",
      storageHint: "A imagem é salva no Firebase Storage e pode ser usada antes de salvar a tarefa.",
      imageDescription: "Descrição da imagem / imageDescription",
      imageDescriptionPlaceholder: "Descreva o motivo, pessoas, lugar, ação e detalhes importantes que a IA deve usar para avaliar o texto.",
      instruction: "Instrução para o estudante",
      support: "Sugestões de palavras de apoio",
      criteria: "Sugestões de critérios de sucesso",
      printHelp: "Ajuda extra na impressão",
      none: "Nenhuma",
      save: "Salvar em Meu conteúdo",
      saving: "Salvando...",
      openPreview: "Abrir/visualizar",
      preview: "Visualização",
      imagePlaceholder: "A imagem aparecerá aqui",
      untitled: "Sem título",
      aiContext: "Contexto da imagem para feedback de IA",
      imageAlt: "Tarefa com imagem",
    },
    messages: {
      uploaded: "A imagem foi enviada.",
      loginUpload: "Você precisa estar conectado para enviar uma imagem.",
      imageOnly: "Escolha um arquivo de imagem.",
      tooLarge: "O arquivo é grande demais. Máximo de 8 MB.",
      loginGenerate: "Você precisa estar conectado para gerar uma imagem.",
      promptRequired: "Escreva primeiro um prompt para a imagem de IA.",
      generateFailed: "A geração da imagem falhou.",
      noImage: "A geração da imagem não retornou uma URL.",
      generated: "A imagem de IA foi gerada. Lembre-se de escrever a descrição da imagem antes de salvar.",
      loginSave: "Você precisa estar conectado para salvar.",
      saveFailed: "Falha ao salvar.",
      saved: "A tarefa de escrita foi salva em Meu conteúdo.",
    },
  },
} satisfies Record<Language, {
  taskTypes: Record<TaskType, string>;
  defaults: { instruction: string; supportWords: string; successCriteria: string };
  ui: Record<string, string>;
  messages: Record<string, string>;
}>;

function isDefaultValue(value: string, key: keyof typeof copy.nb.defaults) {
  return languages.some((lang) => value.trim() === copy[lang].defaults[key].trim());
}

function newId() {
  return `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function splitLines(value: string) {
  const lines = value
    .split(/\r?\n/g)
    .map((item) => item.trim())
    .filter(Boolean);

  if (lines.length > 1) return lines;

  return value
    .split(/,/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function fieldLabel(text: string, required = false) {
  return (
    <div style={{ fontSize: 13, fontWeight: 850, color: "#334155" }}>
      {text}
      {required ? <span style={{ color: "#b91c1c" }}> *</span> : null}
    </div>
  );
}

export default function ImageWritingProducerPage() {
  const locale = useLocale();

  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState<Language>("nb");
  const [level, setLevel] = useState<Level>("A2");
  const [taskType, setTaskType] = useState<TaskType>("describe");
  const [imageMode, setImageMode] = useState<ImageMode>("uploaded");
  const [imageUrl, setImageUrl] = useState("");
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageDescription, setImageDescription] = useState("");
  const [instruction, setInstruction] = useState(copy.nb.defaults.instruction);
  const [supportWords, setSupportWords] = useState(copy.nb.defaults.supportWords);
  const [successCriteria, setSuccessCriteria] = useState(copy.nb.defaults.successCriteria);
  const [printSupportWords, setPrintSupportWords] = useState(false);
  const [printSuccessCriteria, setPrintSuccessCriteria] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [draftImageLessonId] = useState(
    () => `image-writing-draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  const ui = copy[language].ui;
  const messages = copy[language].messages;
  const taskTypeLabels = copy[language].taskTypes;

  function changeLanguage(next: Language) {
    setLanguage(next);
    if (isDefaultValue(instruction, "instruction")) {
      setInstruction(copy[next].defaults.instruction);
    }
    if (isDefaultValue(supportWords, "supportWords")) {
      setSupportWords(copy[next].defaults.supportWords);
    }
    if (isDefaultValue(successCriteria, "successCriteria")) {
      setSuccessCriteria(copy[next].defaults.successCriteria);
    }
  }

  const canSave = useMemo(
    () =>
      title.trim() &&
      imageUrl.trim() &&
      imageDescription.trim() &&
      instruction.trim() &&
      (imageMode !== "ai_generated" || imagePrompt.trim()),
    [title, imageUrl, imageDescription, instruction, imageMode, imagePrompt]
  );

  async function uploadImage(file: File) {
    setError(null);
    setMessage(null);
    setUploading(true);

    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error(messages.loginUpload);
      if (!file.type.startsWith("image/")) throw new Error(messages.imageOnly);
      if (file.size > 8 * 1024 * 1024) throw new Error(messages.tooLarge);

      const safeName = file.name.replace(/[^\w.-]+/g, "_");
      const path = `covers/${user.uid}/${draftImageLessonId}/${Date.now()}-${safeName}`;
      const fileRef = ref(storage, path);

      await uploadBytes(fileRef, file, {
        contentType: file.type,
        cacheControl: "public,max-age=31536000",
      });

      const url = await getDownloadURL(fileRef);
      setImageUrl(url);
      setImageMode("uploaded");
      setMessage(messages.uploaded);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Opplasting feilet.");
    } finally {
      setUploading(false);
    }
  }

  async function generateAiImage() {
    setError(null);
    setMessage(null);
    setGeneratingImage(true);

    try {
      const user = getAuth().currentUser;
      if (!user || user.isAnonymous) {
        throw new Error(messages.loginGenerate);
      }
      if (!imagePrompt.trim()) {
        throw new Error(messages.promptRequired);
      }

      const token = await user.getIdToken();
      const res = await fetch("/api/images/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          lessonId: draftImageLessonId,
          format: "16:9",
          style: "illustration",
          promptMode: "custom",
          customPrompt: imagePrompt.trim(),
          title: title.trim() || ui.pageTitle,
          level,
          language,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        imageUrl?: string;
        error?: string;
      };

      if (!res.ok) throw new Error(data.error || messages.generateFailed);
      if (!data.imageUrl) throw new Error(messages.noImage);

      setImageUrl(data.imageUrl);
      setImageMode("ai_generated");
      setMessage(messages.generated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : messages.generateFailed);
    } finally {
      setGeneratingImage(false);
    }
  }

  async function saveLesson() {
    setError(null);
    setMessage(null);
    setSaving(true);

    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error(messages.loginSave);
      const token = await user.getIdToken();

      const res = await fetch("/api/producer/save-image-writing", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title,
          language,
          level,
          taskType,
          imageTasks: [
            {
              id: newId(),
              imageUrl,
              imageSource: imageMode,
              imagePrompt: imageMode === "ai_generated" ? imagePrompt : undefined,
              imageDescription,
              instruction,
              supportWords: splitLines(supportWords),
              successCriteria: splitLines(successCriteria),
              printSupportWords,
              printSuccessCriteria,
            },
          ],
        }),
      });

      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok) throw new Error(data.error || messages.saveFailed);

      setSavedId(data.id || null);
      setMessage(messages.saved);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : messages.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ width: "100%", maxWidth: 980, margin: "0 auto", padding: "18px 12px 80px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 30, color: "#0f172a" }}>{ui.pageTitle}</h1>
          <p style={{ margin: "8px 0 0", color: "#475569", lineHeight: 1.45 }}>
            {ui.pageIntro}
          </p>
        </div>

        <Link href={`/${locale}/content`} style={secondaryLink}>
          {ui.myContent}
        </Link>
      </header>

      {error ? <div style={alertError}>{error}</div> : null}
      {message ? <div style={alertOk}>{message}</div> : null}

      <section style={layout}>
        <div style={panel}>
          <div style={gridTwo}>
            <label style={field}>
              {fieldLabel(ui.title, true)}
              <input value={title} onChange={(e) => setTitle(e.target.value)} style={input} />
            </label>

            <label style={field}>
              {fieldLabel(ui.language)}
              <select value={language} onChange={(e) => changeLanguage(e.target.value as Language)} style={input}>
                {languages.map((item) => (
                  <option key={item} value={item}>
                    {item.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>

            <label style={field}>
              {fieldLabel(ui.level)}
              <select value={level} onChange={(e) => setLevel(e.target.value as Level)} style={input}>
                {levels.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label style={field}>
              {fieldLabel(ui.taskType)}
              <select value={taskType} onChange={(e) => setTaskType(e.target.value as TaskType)} style={input}>
                {(Object.keys(taskTypeLabels) as TaskType[]).map((value) => (
                  <option key={value} value={value}>
                    {taskTypeLabels[value]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setImageMode("uploaded")}
              style={imageMode === "uploaded" ? selectedButton : button}
            >
              {ui.uploadMode}
            </button>
            <button
              type="button"
              onClick={() => setImageMode("ai_generated")}
              style={imageMode === "ai_generated" ? selectedButton : button}
            >
              {ui.aiMode}
            </button>
          </div>

          {imageMode === "uploaded" ? (
            <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
              <label style={field}>
                {fieldLabel(ui.uploadImage)}
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.currentTarget.files?.[0];
                    if (file) void uploadImage(file);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
              <label style={field}>
                {fieldLabel(ui.imageUrl, true)}
                <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} style={input} />
              </label>
            </div>
          ) : (
            <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
              <label style={field}>
                {fieldLabel(ui.prompt, true)}
                <textarea
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  rows={3}
                  style={textarea}
                  placeholder={ui.promptPlaceholder}
                />
              </label>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  type="button"
                  onClick={generateAiImage}
                  disabled={generatingImage || !imagePrompt.trim()}
                  style={primaryButton}
                >
                  {generatingImage ? ui.generating : ui.generate}
                </button>
                <span style={{ color: "#64748b", fontSize: 13 }}>
                  {ui.storageHint}
                </span>
              </div>
              <label style={field}>
                {fieldLabel(ui.imageUrlShort, true)}
                <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} style={input} />
              </label>
            </div>
          )}

          <label style={{ ...field, marginTop: 14 }}>
            {fieldLabel(ui.imageDescription, true)}
            <textarea
              value={imageDescription}
              onChange={(e) => setImageDescription(e.target.value)}
              rows={5}
              style={textarea}
              placeholder={ui.imageDescriptionPlaceholder}
            />
          </label>

          <label style={{ ...field, marginTop: 14 }}>
            {fieldLabel(ui.instruction, true)}
            <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={3} style={textarea} />
          </label>

          <div style={{ ...gridTwo, marginTop: 14 }}>
            <label style={field}>
              {fieldLabel(ui.support)}
              <textarea value={supportWords} onChange={(e) => setSupportWords(e.target.value)} rows={4} style={textarea} />
            </label>
            <label style={field}>
              {fieldLabel(ui.criteria)}
              <textarea value={successCriteria} onChange={(e) => setSuccessCriteria(e.target.value)} rows={4} style={textarea} />
            </label>
          </div>

          <div style={{ marginTop: 14 }}>
            {fieldLabel(ui.printHelp)}
            <div style={segmentedRow}>
              <button
                type="button"
                onClick={() => {
                  setPrintSupportWords(false);
                  setPrintSuccessCriteria(false);
                }}
                style={!printSupportWords && !printSuccessCriteria ? segmentActive : segmentButton}
              >
                {ui.none}
              </button>
              <button
                type="button"
                onClick={() => setPrintSupportWords((value) => !value)}
                style={printSupportWords ? segmentActive : segmentButton}
              >
                {ui.support.replace(/^Forslag til |^Suggested |^Sugestões de /, "")}
              </button>
              <button
                type="button"
                onClick={() => setPrintSuccessCriteria((value) => !value)}
                style={printSuccessCriteria ? segmentActive : segmentButton}
              >
                {ui.criteria.replace(/^Forslag til |^Suggested |^Sugestões de /, "")}
              </button>
            </div>
          </div>

          <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={saveLesson} disabled={!canSave || saving} style={primaryButton}>
              {saving ? ui.saving : ui.save}
            </button>
            {savedId ? (
              <Link href={`/${locale}/student/lesson/${savedId}`} style={secondaryLink}>
                {ui.openPreview}
              </Link>
            ) : null}
          </div>
        </div>

        <aside style={panel}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>{ui.preview}</div>
          <div style={imagePreview}>
            {imageUrl.trim() ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl.trim()} alt={title || ui.imageAlt} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            ) : (
              <span style={{ color: "#64748b" }}>{ui.imagePlaceholder}</span>
            )}
          </div>
          <h2 style={{ margin: "16px 0 8px", fontSize: 20 }}>{title || ui.untitled}</h2>
          <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, color: "#334155" }}>{instruction}</p>
          {imageDescription.trim() ? (
            <div style={{ marginTop: 12, padding: 12, border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc" }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: "#64748b", marginBottom: 6 }}>
                {ui.aiContext}
              </div>
              <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.45, color: "#334155" }}>
                {imageDescription}
              </div>
            </div>
          ) : null}
          {splitLines(supportWords).length ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {splitLines(supportWords).map((word) => (
                <span key={word} style={pill}>
                  {word}
                </span>
              ))}
            </div>
          ) : null}
        </aside>
      </section>
    </main>
  );
}

const layout: React.CSSProperties = {
  marginTop: 18,
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, 0.8fr)",
  gap: 16,
  alignItems: "start",
};

const panel: React.CSSProperties = {
  border: "1px solid #dbe3ef",
  borderRadius: 8,
  background: "white",
  padding: 16,
};

const gridTwo: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const field: React.CSSProperties = { display: "grid", gap: 6 };

const segmentedRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 8,
};

const segmentButton: React.CSSProperties = {
  borderWidth: 2,
  borderStyle: "solid",
  borderColor: "#cbd5e1",
  borderRadius: 8,
  padding: "9px 12px",
  background: "#fff",
  color: "#334155",
  fontWeight: 850,
};

const segmentActive: React.CSSProperties = {
  ...segmentButton,
  borderColor: "#2563eb",
  background: "#dbeafe",
  color: "#0f172a",
  boxShadow: "0 0 0 2px rgba(37,99,235,0.18)",
};

const input: React.CSSProperties = {
  width: "100%",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "10px 11px",
  boxSizing: "border-box",
};

const textarea: React.CSSProperties = {
  ...input,
  resize: "vertical",
  lineHeight: 1.45,
};

const button: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  padding: "10px 12px",
  background: "white",
  fontWeight: 800,
};

const selectedButton: React.CSSProperties = {
  ...button,
  border: "2px solid #2563eb",
  padding: "9px 11px",
  background: "#eff6ff",
  color: "#1d4ed8",
};

const primaryButton: React.CSSProperties = {
  ...button,
  background: "#dcfce7",
  borderColor: "#86efac",
  color: "#166534",
};

const secondaryLink: React.CSSProperties = {
  ...button,
  textDecoration: "none",
  color: "#0f172a",
  display: "inline-flex",
  alignItems: "center",
};

const alertError: React.CSSProperties = {
  marginTop: 14,
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#991b1b",
  borderRadius: 8,
  padding: 12,
};

const alertOk: React.CSSProperties = {
  marginTop: 14,
  border: "1px solid #bbf7d0",
  background: "#f0fdf4",
  color: "#166534",
  borderRadius: 8,
  padding: 12,
};

const imagePreview: React.CSSProperties = {
  width: "100%",
  aspectRatio: "16 / 10",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  background: "#f8fafc",
  overflow: "hidden",
  display: "grid",
  placeItems: "center",
};

const pill: React.CSSProperties = {
  border: "1px solid #cbd5e1",
  borderRadius: 999,
  padding: "5px 9px",
  background: "#f8fafc",
  fontSize: 13,
  fontWeight: 700,
};
