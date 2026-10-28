import { runCleanupCommand } from "../lib/security/cloudFileTestCleanupRunner";
import { CLOUD_TEST_ADC_PATH } from "../lib/security/cloudTestBoundary";
import { CLEANUP_ID } from "../lib/security/cloudFileTestCleanup";

async function main() {
  const args = process.argv.slice(2), options = new Map<string, string>(); let execute = false;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--execute-cloud" && !execute) { execute = true; continue; }
    if (!["--execution-approval", "--adc"].includes(args[index]) || !args[index + 1] || options.has(args[index])) throw new Error("invalid_cleanup_arguments");
    options.set(args[index], args[++index]);
  }
  console.log(JSON.stringify(await runCleanupCommand({ execute, approval: options.get("--execution-approval") || "", adc: options.get("--adc") || CLOUD_TEST_ADC_PATH })));
}
main().catch(() => {
  console.log(JSON.stringify({ status: "stopped", cleanupId: CLEANUP_ID, message: "Review local validation or the separate cleanup journal; no automatic repair or cleanup attempted." }));
  process.exitCode = 1;
});
