import { requirePhase1, type Phase1Provider, type TestObject, type Phase1Plan, type Fixture, verifyTestObject } from "./cloudFileTestExecution";

/** Never trim, coerce or discard a non-empty value. Empty string was observed in GCS copy metadata. */
export function normalizeDownloadToken(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  requirePhase1(typeof value === "string", "invalid_download_token_metadata_type");
  return value;
}
export function verifyPrivateTestObject(plan: Phase1Plan, object: TestObject | null, fixture: Fixture): asserts object is TestObject {
  requirePhase1(object, "private_object_missing");
  verifyTestObject(plan, { ...object, token: normalizeDownloadToken(object.token) }, fixture);
}

/** Metadata alone never proves private access. The caller must also confirm the object is still live. */
export async function verifyAnonymousAndOldTokenDenied(
  provider: Pick<Phase1Provider, "publicRead">, path: string, oldToken: string,
) {
  requirePhase1(typeof oldToken === "string" && oldToken.length > 0, "old_token_positive_control_required");
  for (const [api, token] of [["gcs", undefined], ["firebase", undefined], ["firebase", oldToken]] as const) {
    const status = await provider.publicRead(path, api, token);
    requirePhase1([401, 403, 404].includes(status), "anonymous_or_old_token_access_not_denied");
  }
}
