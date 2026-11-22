export type CoverImageStyle = "illustration" | "realistic";
export type CoverImagePromptMode = "custom" | "fromText" | "readingPoster";

export function normalizeCoverImagePromptMode(value: unknown): CoverImagePromptMode {
  return value === "fromText" || value === "readingPoster" ? value : "custom";
}

export function buildCoverImagePrompt(body: {
  style: CoverImageStyle;
  promptMode: CoverImagePromptMode;
  customPrompt?: string;
  sourceText?: string;
  title?: string;
  level?: string;
  language?: string;
}): string {
  const style = body.style === "realistic"
    ? "Create a realistic, photographic-looking educational cover image."
    : "Create a drawn illustrated educational cover image, clearly illustrated rather than photographic.";
  const isPoster = body.promptMode === "readingPoster";
  const composition = isPoster
    ? "Create one landscape learning poster with exactly six equal rectangular panels in three columns and two rows. Place the scenes left to right, top row first. Use a narrow white gutter between panels. Keep the main subject fully inside each panel and keep any recurring subject visually consistent."
    : "Landscape composition in 16:9. Clean single-scene cover image. No collage. No split panels. No text inside image. No letters, numbers, watermark, or logo.";
  const suitability = isPoster
    ? "Suitable for a school learning platform. Avoid copyrighted characters, branded products, headings, panel numbers, captions, watermarks and logos. Include a short sound in a speech bubble only if the image brief calls for it. Keep that bubble within its panel."
    : "Suitable for a school learning platform. Avoid copyrighted characters, famous branded products, and readable text inside the image.";

  if (body.promptMode !== "fromText") {
    const custom = (body.customPrompt || "").trim();
    if (!custom) throw new Error("Missing customPrompt.");
    return [style, composition, suitability, `Image brief: ${custom}`].join("\n\n");
  }

  const sourceText = (body.sourceText || "").trim();
  if (!sourceText) throw new Error("Missing sourceText.");
  const title = (body.title || "").trim();
  const level = (body.level || "").trim();
  const language = (body.language || "").trim();
  return [
    style, composition, suitability,
    "Use the lesson information below as inspiration for one strong cover image.",
    title ? `Title: ${title}` : "",
    level ? `Level: ${level}` : "",
    language ? `Language: ${language}` : "",
    `Lesson text:\n${sourceText.slice(0, 4000)}`,
  ].filter(Boolean).join("\n\n");
}
