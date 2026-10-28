import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { buildFourFileQuarantineRulesV2 as build } from "./fileQuarantineRulesV2";

const paths = ["spaces/synthetic/a.wav", "spaces/synthetic/b.wav", "spaces/synthetic/c.wav", "covers/synthetic/image.png"];
const source = `rules_version = '2'; service firebase.storage { match /b/{bucket}/o {
  match /{object=**} { allow read, write: if request.auth != null; }
} }`;

test("rejects invalid, duplicate, ambiguous and oversized object paths", () => {
  for (const bad of [paths.slice(1), [...paths, paths[0]], [paths[0], paths[0], paths[2], paths[3]],
    ["covers/../a", ...paths.slice(1)], ["covers//a", ...paths.slice(1)], ["covers/a\\b", ...paths.slice(1)],
    ["covers/a\nb", ...paths.slice(1)], ["other/a", ...paths.slice(1)], ["covers/" + "å".repeat(600), ...paths.slice(1)]]) {
    assert.throws(() => build(source, bad), /four exact/);
  }
});
test("does not consult existing or incoming metadata to select blocked paths", () => {
  const out = build(source, paths);
  assert.ok(out.includes("request.path == /b/$(bucket)/o/spaces/synthetic/a.wav"));
  assert.ok(!out.includes("resource"));
});
test("supports literal Unicode filenames without treating them as source syntax", () => {
  assert.ok(build(source, ["covers/synthetic/bilde-vår.png", ...paths.slice(1)]).includes('$("bilde-vår.png")'));
});
test("gates inline, multiline, comma-separated and unconditional overlapping allows", () => {
  const input = `rules_version='2'; service firebase.storage { match /b/{bucket}/o {
    match /covers/{p=**} { allow read; allow create, update : if\n request.auth != null; }
    match /{p=**} { allow read, write: if true; }
  } }`;
  const out = build(input, paths);
  assert.equal((out.match(/allow /g) || []).length, 5);
  assert.equal((out.match(/!isFourFileQuarantinePathV2\(\)/g) || []).length, 3);
  assert.equal((out.match(/!isFourFileQuarantineListV2\(\)/g) || []).length, 2);
});
test("ignores comment and quoted allow statements, semicolons and braces", () => {
  const condition = `request.auth.token.get('note', '') == 'allow read; }' // allow write;`;
  const input = source.replace("request.auth != null;", condition + "\n;") + "\n/* allow read; match /b/{bucket}/o { */";
  const out = build(input, paths);
  assert.ok(out.includes(condition + "\n)"));
  assert.ok(out.endsWith("/* allow read; match /b/{bucket}/o { */"));
});
test("rejects partial transformations and duplicate quarantine gates", () => {
  for (const input of [source.replace("allow read, write:", "allow unknown:"),
    source.replace("; }", " }"), source.replace("request.auth != null", ""),
    source + " allow read;", source.replace("firebase.storage", "firebase.firestore"),
    source.replace("allow read, write: if request.auth != null;", ""),
    source + " /* unterminated", source + " 'unterminated", build(source, paths)]) assert.throws(() => build(input, paths));
});
test("gates all allows in current local and previously captured deployed rules without changing source files", async () => {
  for (const file of ["storage.rules", ".vercel/security-quarantine-approved/deployed-storage.current.rules"]) {
    const input = await readFile(file, "utf8");
    const out = build(input, paths);
    const count = (input.match(/\ballow\s/g) || []).length;
    const transformed = (out.match(/!isFourFileQuarantine(?:Path|List)V2\(\)/g) || []).length;
    assert.ok(transformed >= count);
    assert.equal(await readFile(file, "utf8"), input);
  }
});
