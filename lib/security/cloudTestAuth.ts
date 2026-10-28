import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { Impersonated, UserRefreshClient } from "google-auth-library";
import { assertCloudTestAdcPath, CLOUD_TEST_PRINCIPAL, CLOUD_TEST_PROJECT, validateCloudTestImpersonation, type CloudTestImpersonation } from "./cloudTestBoundary";

/** Explicit quota on both clients, even when impersonated ADC has no quota field. */
export function createCloudTestClient(source: CloudTestImpersonation, mode: "full" | "read-only" = "full") {
  if (!["full", "read-only"].includes(mode)) throw new Error("invalid_test_token_scope");
  return new Impersonated({
    sourceClient: new UserRefreshClient({ ...source, quotaProjectId: CLOUD_TEST_PROJECT }),
    targetPrincipal: CLOUD_TEST_PRINCIPAL, delegates: [], lifetime: 900,
    targetScopes: [mode === "full" ? "https://www.googleapis.com/auth/cloud-platform" : "https://www.googleapis.com/auth/devstorage.read_only"],
    quotaProjectId: CLOUD_TEST_PROJECT,
  });
}

/** Explicit test ADC only. Constructing the client makes no network request. */
export async function loadCloudTestClient(input: string, mode: "full" | "read-only" = "full") {
  const file = assertCloudTestAdcPath(input, process.cwd());
  let canonical: string;
  try { canonical = await realpath(file); } catch { throw new Error("dedicated_test_adc_missing_or_unreadable"); }
  if (path.relative(file, canonical) !== "") throw new Error("credential_path_indirection_refused");
  const metadata = await stat(file);
  if (!metadata.isFile() || metadata.size > 128 * 1024) throw new Error("invalid_adc_file_size");
  const source = validateCloudTestImpersonation(JSON.parse(await readFile(file, "utf8")));
  return createCloudTestClient(source, mode);
}
