import { open, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { applyLocalFileMigration, prepareFileMigration, type MigrationCandidate, type PreparedMigration } from "../lib/security/fileMigration.server";

const args = process.argv.slice(2);
const options = new Map<string, string>();
for (let index = 0; index < args.length; index += 2) {
  if (!["--mode", "--project", "--input", "--out", "--approve-digest"].includes(args[index]) || !args[index + 1] || options.has(args[index])) throw new Error("Invalid migration arguments");
  options.set(args[index], args[index + 1]);
}
const mode = options.get("--mode") || "prepare";
const project = options.get("--project");
const inputPath = path.resolve(options.get("--input") || "");
const outputPath = path.resolve(options.get("--out") || "");
if (!project || !["prepare", "apply-local"].includes(mode)
  || ![inputPath, outputPath].every(file => file.startsWith(path.resolve(".vercel") + path.sep))) throw new Error("Explicit project and private .vercel paths required");
const local = project.startsWith("demo-");
if (local && (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8188" || process.env.FIREBASE_STORAGE_EMULATOR_HOST !== "127.0.0.1:9199")) throw new Error("Local emulators required");
if (!local && (mode !== "prepare" || ["FIRESTORE_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"].some(key => process.env[key]))) throw new Error("Production writes and mixed configurations are disabled");
if (mode === "prepare" && options.has("--approve-digest")) throw new Error("Approval is only used by apply-local");
const input = JSON.parse(await readFile(inputPath, "utf8"));
const plan = input.plan || input;
if (plan.projectId !== project) throw new Error("Wrong-project manifest");
const bucketName = plan.bucket || plan.items?.[0]?.source?.bucket;
if (![`${project}.appspot.com`, `${project}.firebasestorage.app`].includes(bucketName)) throw new Error("Wrong-project bucket");
const app = local ? initializeApp({ projectId: project, storageBucket: bucketName }) : (await import("../lib/firebaseAdmin")).getAdminApp();
if (app.options.projectId !== project) throw new Error("Wrong-project credentials");
try {
  const db = getFirestore(app), bucket = getStorage(app).bucket(bucketName);
  if (mode === "prepare") {
    if (!Array.isArray(plan.items)) throw new Error("Missing inventory items");
    const prepared = await prepareFileMigration(project, db, bucket, plan.items as MigrationCandidate[]);
    await writeFile(outputPath, JSON.stringify(prepared, null, 2), { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ readOnly: true, mediaDownloaded: false, ready: prepared.items.length, blocked: prepared.blocked.length, digest: prepared.digest }));
  } else {
    const journal = await open(outputPath, "wx", 0o600);
    try {
      const result = await applyLocalFileMigration(db, bucket, input as PreparedMigration, options.get("--approve-digest") || "", async event => {
        await journal.write(JSON.stringify({ at: new Date().toISOString(), ...event }) + "\n");
        await journal.sync();
      });
      console.log(JSON.stringify({ ...result, localOnly: true, mediaDownloaded: false }));
    } finally { await journal.close(); }
  }
} finally { await deleteApp(app); }
