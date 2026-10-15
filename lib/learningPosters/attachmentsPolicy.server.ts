import "server-only";
import { createHash } from "node:crypto";
import { readPosterAttachments, sourceFingerprintPayload } from "./attachments";

export function currentPosterAttachments(lesson: { sourceText?: unknown; text?: unknown; learningPosterAttachments?: unknown }) {
  const text = typeof lesson.sourceText === "string" ? lesson.sourceText : typeof lesson.text === "string" ? lesson.text : "";
  const hash = createHash("sha256").update(sourceFingerprintPayload(text)).digest("hex");
  return readPosterAttachments(lesson.learningPosterAttachments).filter(attachment => attachment.sourceHash === hash);
}
