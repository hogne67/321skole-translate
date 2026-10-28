// Offline review artifact only. No Firebase app, credentials, network calls or deployment.
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { buildFourFileQuarantineRulesV2 } from "../lib/security/fileQuarantineRulesV2";

const options = new Map<string, string>();
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 2) {
  if (!["--source", "--paths", "--sha256", "--out"].includes(args[i]) || !args[i+1] || options.has(args[i])) throw Error("Invalid offline review arguments");
  options.set(args[i], args[i+1]);
}
if (options.size !== 4 || !/^[a-f0-9]{64}$/.test(options.get("--sha256") || "")) throw Error("Exact source hash and all four offline arguments required");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const source = await readFile(path.resolve(options.get("--source")!), "utf8");
if (hash(source) !== options.get("--sha256")) throw Error("Rules source hash mismatch");
const objectPaths: unknown = JSON.parse(await readFile(path.resolve(options.get("--paths")!), "utf8"));
if (!Array.isArray(objectPaths) || !objectPaths.every(p => typeof p === "string")) throw Error("Explicit four-path array required");
const proposed = buildFourFileQuarantineRulesV2(source, objectPaths);
const output = path.resolve(options.get("--out")!);
await mkdir(output); // Exclusive new directory; never overwrite a historical artifact.
await writeFile(path.join(output, "source.rules"), source, { flag: "wx", mode: 0o600 });
await writeFile(path.join(output, "proposed-v2.rules"), proposed, { flag: "wx", mode: 0o600 });
await writeFile(path.join(output, "review.json"), JSON.stringify({ builder: "fileQuarantineRulesV2", sourceSha256: hash(source),
  proposedSha256: hash(proposed), pathsSha256: hash(JSON.stringify(objectPaths)), localOnly: true, deployed: false,
  cloudVerified: false, productionReady: false, listBehavior: "Blocked object paths and their ancestor prefixes cannot be listed; unrelated prefixes retain baseline conditions." }, null, 2), { flag: "wx", mode: 0o600 });
console.log(JSON.stringify({ localOnly: true, deployed: false, cloudVerified: false, productionReady: false }));
