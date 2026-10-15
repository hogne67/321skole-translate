import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { PosterPlan } from "./model";
import { renderPosterSvg } from "./render";

export async function renderPosterPng(plan: PosterPlan, images: string[], hidden = false, locale = "nb") {
  const logo = await readFile(path.join(process.cwd(), "public", "logo321ny.png"));
  const logoDataUrl = `data:image/png;base64,${logo.toString("base64")}`;
  return sharp(Buffer.from(renderPosterSvg(plan, images, hidden, logoDataUrl, locale))).png().toBuffer();
}
