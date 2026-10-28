// Read deployed rules, derive a four-file-only proposal. No remote writes.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { deleteApp } from "firebase-admin/app";
import { getAdminApp } from "../lib/firebaseAdmin";
import { buildFourFileQuarantineRules } from "../lib/security/fileQuarantineRules";
import { digest } from "../lib/security/reconciliation";

const args = process.argv.slice(2), options = new Map<string, string>();
for (let index = 0; index < args.length; index += 2) {
  if (!["--project", "--plan", "--out"].includes(args[index]) || !args[index + 1] || options.has(args[index])) throw new Error("Invalid read-only arguments");
  options.set(args[index], args[index + 1]);
}
const project = options.get("--project"), input = path.resolve(options.get("--plan") || ""), output = path.resolve(options.get("--out") || "");
if (!project || ![input, output].every(file => file.startsWith(path.resolve(".vercel") + path.sep))) throw new Error("Explicit project and private paths required");
if (["FIRESTORE_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"].some(key => process.env[key])) throw new Error("Mixed configuration refused");
const plan = JSON.parse(await readFile(input, "utf8"));
if (plan.projectId !== project || plan.files?.length !== 4) throw new Error("Wrong-project or invalid four-file plan");
const app = getAdminApp();
if (app.options.projectId !== project) throw new Error("Wrong-project credentials");
try {
  async function get(resource: string) {
    const token = await app.options.credential!.getAccessToken();
    const response = await fetch(`https://firebaserules.googleapis.com/v1/${resource}`, { headers: { Authorization: `Bearer ${token.access_token}` } });
    if (!response.ok) throw new Error(`rules_read_unavailable_${response.status}`);
    return response.json();
  }
  const releases: { name: string; rulesetName: string; updateTime?: string }[] = [];
  let next = "";
  do {
    const page = await get(`projects/${project}/releases?pageSize=10${next ? `&pageToken=${encodeURIComponent(next)}` : ""}`);
    releases.push(...(page.releases || [])); next = page.nextPageToken || "";
  } while (next);
  const release = releases.find(item => item.name === `projects/${project}/releases/firebase.storage/${plan.bucket}`)
    || releases.find(item => item.name === `projects/${project}/releases/firebase.storage`);
  if (!release || !release.rulesetName.startsWith(`projects/${project}/rulesets/`)) throw new Error("Storage release not identified");
  const ruleset = await get(release.rulesetName);
  if (ruleset.source?.files?.length !== 1 || typeof ruleset.source.files[0].content !== "string") throw new Error("Rules source requires manual review");
  const source: string = ruleset.source.files[0].content;
  const proposed = buildFourFileQuarantineRules(source, plan.files.map((file: { sourcePath: string }) => file.sourcePath));
  const local = await readFile("storage.rules", "utf8");
  await writeFile(`${output}.current.rules`, source, { flag: "wx", mode: 0o600 });
  await writeFile(`${output}.proposed.rules`, proposed, { flag: "wx", mode: 0o600 });
  await writeFile(`${output}.json`, JSON.stringify({ projectId: project, bucket: plan.bucket, capturedAt: new Date().toISOString(),
    readOnly: true, release, sourceFileName: ruleset.source.files[0].name, sourceDigest: digest(source), proposedDigest: digest(proposed),
    localRulesMatchDeployed: digest(local) === digest(source), originalSource: `${output}.current.rules`, proposedSource: `${output}.proposed.rules`,
    sourcePathsDigest: digest(plan.files.map((file: { sourcePath: string }) => file.sourcePath)), deployed: false }, null, 2), { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ readOnly: true, deployed: false, localRulesMatchDeployed: digest(local) === digest(source), isolatedFourFileProposal: true }));
} finally { await deleteApp(app); }
