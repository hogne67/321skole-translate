import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildFileCutoverRules } from "../lib/security/fileCutoverRules";
import { digest } from "../lib/security/reconciliation";

if (process.argv.length !== 4 || process.argv[2] !== "--out") throw new Error("Usage: --out .vercel/<private-output>.rules");
const output = path.resolve(process.argv[3]);
if (!output.startsWith(path.resolve(".vercel") + path.sep)) throw new Error("Private .vercel output required");
const source = await readFile("storage.rules", "utf8");
const rules = buildFileCutoverRules(source);
await writeFile(output, rules, { flag: "wx", mode: 0o600 });
await writeFile(`${output}.metadata.json`, JSON.stringify({ source: "storage.rules", sourceDigest: digest(source), cutoverDigest: digest(rules),
  deployed: false, requiresApprovedMigration: true }, null, 2), { flag: "wx", mode: 0o600 });
console.log(JSON.stringify({ generated: true, deployed: false }));
