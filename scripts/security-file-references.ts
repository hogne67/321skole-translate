import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { inventoryLegacyFileReferences } from "../lib/security/legacyFileReferences";
import { planFileMigration, type FileInventory, type LinkInventory } from "../lib/security/migrationPlan";

const args = process.argv.slice(2);
const options = new Map<string, string>();
for (let index = 0; index < args.length; index += 2) {
  if (!["--project", "--inventory", "--out"].includes(args[index]) || !args[index + 1] || options.has(args[index])) throw new Error("Invalid read-only arguments");
  options.set(args[index], args[index + 1]);
}
const project = options.get("--project");
const input = path.resolve(options.get("--inventory") || "");
const output = path.resolve(options.get("--out") || "");
if (!project || ![input, output].every(file => file.startsWith(path.resolve(".vercel") + path.sep))) throw new Error("Explicit project and private .vercel paths required");
const inventory = JSON.parse(await readFile(input, "utf8"));
if (inventory.projectId !== project) throw new Error("Wrong-project inventory");
const demo = project.startsWith("demo-");
if (demo && process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8188") throw new Error("Isolated emulator required");
if (!demo && ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST"].some(key => process.env[key])) throw new Error("Mixed configuration refused");
const app = demo ? initializeApp({ projectId: project }) : (await import("../lib/firebaseAdmin")).getAdminApp();
if (app.options.projectId !== project) throw new Error("Wrong-project credentials");
try {
  const files = inventory.sections.files.result.objects as FileInventory[];
  const bucket = inventory.sections.bucketMetadata.result.name as string;
  if (![`${project}.appspot.com`, `${project}.firebasestorage.app`].includes(bucket)) throw new Error("Wrong-project bucket");
  const references = await inventoryLegacyFileReferences(getFirestore(app), bucket, files, count => {
    if (count % 20 === 0) console.log(JSON.stringify({ metadataFilesInspected: count, mediaDownloaded: false }));
  });
  const links: LinkInventory[] = [...inventory.sections.storedLinks.result.links, ...references.references];
  const plan = planFileMigration(project, bucket, files, links);
  const result = { projectId: project, capturedAt: new Date().toISOString(), sourceInventoryCapturedAt: inventory.capturedAt,
    readOnly: true, mediaDownloaded: false, references, plan,
    limitations: ["Storage generations come from the input snapshot and must be refreshed before an approved migration.",
      "Unknown filename schemas and sanitized historical segment IDs require manual review; an unmatched file must not be deleted automatically."] };
  await writeFile(output, JSON.stringify(result, null, 2), { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ references: references.summary, plan: plan.summary, readOnly: true, mediaDownloaded: false }));
} finally { await deleteApp(app); }
