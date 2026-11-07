import "server-only";
import { AccountAccessError } from "./accountAccess.server";

type Scope = { uid: string; spaceId: string; schoolId: string; grantId: string; expiresAt: number };
type FirestoreTarget = { projectId: string; databaseId: string };
const fields = ["uid", "spaceId", "role", "status", "active", "archived", "substituteSchoolId", "substituteGrantId", "substituteExpiresAt"];
const denied = () => new AccountAccessError("Substitute access ended", 403, "space/substitute-ended");
const unavailable = () => new AccountAccessError("Substitute check unavailable", 503, "space/substitute-check-unavailable");
const id = (value: string) => typeof value === "string" && /^[^/\s]+$/.test(value) && value.length <= 200 && value !== "." && value !== "..";

/** Requires the paired rules' get-only request.time check on own substitute membership.
 * Always uses the verified end user's ID token. Admin credentials bypass those rules.
 * readTime and function/browser clocks are not used as authorization evidence.
 */
export async function assertSubstituteExpiry(target: FirestoreTarget, token: string, scope: Scope): Promise<void> {
  if (![scope.uid, scope.spaceId, scope.schoolId, scope.grantId].every(id) || !Number.isSafeInteger(scope.expiresAt)) throw denied();
  const project = target.projectId, database = target.databaseId;
  if (!id(project) || !id(database)) throw unavailable();
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  if (emulator && (!project.startsWith("demo-") || !/^127\.0\.0\.1:\d{1,5}$/.test(emulator))) throw unavailable();
  const origin = emulator ? `http://${emulator}` : "https://firestore.googleapis.com";
  const url = new URL(`${origin}/v1/projects/${encodeURIComponent(project)}/databases/${encodeURIComponent(database)}/documents/spaceMembers/${encodeURIComponent(`${scope.spaceId}_${scope.uid}`)}`);
  for (const field of fields) url.searchParams.append("mask.fieldPaths", field);
  let response: Response;
  try {
    response = await fetch(url, { method: "GET", headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
      redirect: "error", signal: AbortSignal.timeout(10000) });
  } catch { throw unavailable(); }
  if (response.status === 401) throw new AccountAccessError("Sign in", 401, "auth/invalid-session");
  if (response.status === 403 || response.status === 404) throw denied();
  if (response.status !== 200) throw unavailable();
  let result;
  try { result = await response.json(); } catch { throw unavailable(); }
  const data = result?.fields;
  // The grant must be the same one checked by the server; a replacement is not interchangeable.
  if (!data || data.uid?.stringValue !== scope.uid || data.spaceId?.stringValue !== scope.spaceId ||
      data.role?.stringValue !== "substitute" || data.status?.stringValue !== "substitute" ||
      data.active?.booleanValue !== true || data.archived?.booleanValue !== false ||
      data.substituteSchoolId?.stringValue !== scope.schoolId || data.substituteGrantId?.stringValue !== scope.grantId ||
      typeof data.substituteExpiresAt?.timestampValue !== "string" ||
      Date.parse(data.substituteExpiresAt.timestampValue) !== scope.expiresAt) throw denied();
}
