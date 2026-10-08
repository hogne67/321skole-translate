import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { createLessonInputJsonSchema } from "../../lessons/input";
import { createLessonForUser } from "../../lessons/server/createLessonForUser";
import { LessonError, onlyKeys, record, requiredString } from "../../lessons/validation";
import { IntegrationError, LESSON_CREATE_SCOPE } from "./config";

export const createLessonTool = {
  name: "createLesson",
  title: "Save a draft lesson in 321school",
  description: "Create a NEW draft lesson in the authenticated user's own 321school My Content. Call ONLY after the user explicitly asks to create/save this content in 321school. Develop and revise content in the conversation before calling. Never publish, share, read, edit, delete, create Live activities or upload images. Generate an idempotencyKey (UUID) for each intentional new save and reuse that same key and unchanged lesson on retries. Do not claim success until this tool succeeds.",
  inputSchema: { type: "object" as const, additionalProperties: false, required: ["idempotencyKey", "lesson"], properties: {
    idempotencyKey: { type: "string", pattern: "^[A-Za-z0-9_-]{16,128}$", description: "Unique save identifier. Reuse verbatim on retries; new key for an explicitly requested new lesson." },
    lesson: createLessonInputJsonSchema,
  } },
  outputSchema: { type: "object" as const, additionalProperties: false, required: ["lessonId", "title", "editorUrl", "status"], properties: {
    lessonId: { type: "string" }, title: { type: "string" }, editorUrl: { type: "string", format: "uri" }, status: { type: "string", const: "draft" },
  } },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  securitySchemes: [{ type: "oauth2", scopes: [LESSON_CREATE_SCOPE] }],
  _meta: { securitySchemes: [{ type: "oauth2", scopes: [LESSON_CREATE_SCOPE] }] },
};

export async function executeCreateLesson(identity: { uid: string; scope: string }, input: unknown, origin: string, db?: Firestore) {
  if (!identity.uid) throw new IntegrationError("Authentication required.", 401);
  if (identity.scope !== LESSON_CREATE_SCOPE) throw new IntegrationError("lessons:create is required.", 403);
  const body = record(input, "createLesson");
  onlyKeys(body, ["idempotencyKey", "lesson"], "createLesson");
  const idempotencyKey = requiredString(body.idempotencyKey, "idempotencyKey", 128);
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) throw new LessonError("Invalid idempotencyKey.", 400);
  // Identity came from verified OAuth delegation, never from tool arguments.
  const result = await createLessonForUser({ uid: identity.uid, firebase: { identities: {}, sign_in_provider: "oauth" } }, body.lesson, db, { idempotencyKey });
  return { lessonId: result.id, title: result.title!, editorUrl: `${origin}/nb/producer/${encodeURIComponent(result.id)}`, status: "draft" };
}
