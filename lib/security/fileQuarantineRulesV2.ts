/** Review-only successor. V1 and the historical cloud manifests remain unchanged. */
type Token = { text: string; start: number; end: number };
const helperName = "isFourFileQuarantinePathV2";
const listHelperName = "isFourFileQuarantineListV2";

// Keep offsets into the original source; comments and quoted strings are never rewritten.
function tokens(source: string): Token[] {
  const result: Token[] = [];
  for (let i = 0; i < source.length;) {
    const start = i, c = source[i];
    if (/\s/.test(c)) { i++; continue; }
    if (source.startsWith("//", i)) { const end = source.indexOf("\n", i); i = end < 0 ? source.length : end + 1; continue; }
    if (source.startsWith("/*", i)) { const end = source.indexOf("*/", i + 2); if (end < 0) throw Error("Unclosed rules comment"); i = end + 2; continue; }
    if (c === '"' || c === "'") {
      i++;
      while (i < source.length && source[i] !== c) {
        if (source[i] === "\\") i++;
        i++;
      }
      if (i >= source.length) throw Error("Unclosed rules string");
      i++;
    } else if (/[A-Za-z_]/.test(c)) {
      while (i < source.length && /[A-Za-z_0-9]/.test(source[i])) i++;
    } else i++;
    result.push({ text: source.slice(start, i), start, end: i });
  }
  return result;
}

export function buildFourFileQuarantineRulesV2(source: string, paths: string[]): string {
  if (paths.length !== 4 || new Set(paths).size !== 4 || paths.some(p =>
    !/^(spaces|covers)\/.+/.test(p) || Buffer.byteLength(p, "utf8") > 1024
    || Array.from(p).some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 || c === "\\")
    || p.split("/").some(s => !s || s === "." || s === ".."))) {
    throw Error("Expected four exact legacy object paths");
  }
  const ts = tokens(source);
  if (ts.some(t => [helperName, listHelperName, "isFourFileQuarantinePath"].includes(t.text))) throw Error("Rules already contain a quarantine gate");
  const signature = ["match", "/", "b", "/", "{", "bucket", "}", "/", "o", "{"];
  const anchors = ts.flatMap((_, i) => signature.every((s, j) => ts[i+j]?.text === s) ? [i] : []);
  const service = ts.findIndex(t => t.text === "service");
  if (anchors.length !== 1 || ts.filter(t => t.text === "service").length !== 1
    || !["service", "firebase", ".", "storage", "{"].every((s, j) => ts[service+j]?.text === s)) throw Error("Storage rules need manual review");
  const anchor = anchors[0], open = anchor + signature.length - 1;
  let depth = 1, close = open + 1;
  for (; close < ts.length && depth; close++) {
    if (ts[close].text === "{") depth++;
    if (ts[close].text === "}") depth--;
  }
  if (depth) throw Error("Unclosed storage scope");
  const edits: { start: number; end: number; value: string }[] = [];
  const methods = new Set(["read", "get", "list", "write", "create", "update", "delete"]);
  for (let i = 0; i < ts.length; i++) {
    if (ts[i].text !== "allow") continue;
    if (i <= open || i >= close - 1) throw Error("Allow outside the reviewed bucket scope");
    let j = i + 1;
    if (!methods.has(ts[j]?.text)) throw Error("Unsupported allow method");
    const allowedMethods = [ts[j].text];
    j++;
    while (ts[j]?.text === ",") {
      if (!methods.has(ts[++j]?.text)) throw Error("Unsupported allow method");
      allowedMethods.push(ts[j].text);
      j++;
    }
    let condition = "true";
    if (ts[j]?.text === ";") {
      // Unconditional allow is still gated; it must never bypass quarantine.
    } else {
      if (ts[j]?.text !== ":" || ts[j+1]?.text !== "if") throw Error("Unsupported allow statement");
      const expressionStart = ts[j+1].end;
      j += 2;
      while (j < ts.length && ts[j].text !== ";") {
        if (["allow", "}"].includes(ts[j].text)) throw Error("Unterminated allow condition");
        j++;
      }
      if (!ts[j] || ts[j-1].end <= expressionStart) throw Error("Empty allow condition");
      condition = source.slice(expressionStart, ts[j].start).trim();
    }
    const expanded = [...new Set(allowedMethods.flatMap(m => m === "read" ? ["get", "list"] : [m]))];
    const ordinary = expanded.filter(m => m !== "list");
    const statements = [];
    if (ordinary.length) statements.push(`allow ${ordinary.join(", ")}: if !${helperName}() && (\n${condition}\n);`);
    if (expanded.includes("list")) statements.push(`allow list: if !${listHelperName}() && (\n${condition}\n);`);
    edits.push({ start: ts[i].start, end: ts[j].end, value: statements.join("\n      ") });
    i = j;
  }
  if (!edits.length) throw Error("No allow statements found");
  // request.path exists for reads, creates, updates and deletes, including missing objects.
  // Cloud verification is required before this review artifact may be published.
  const comparison = (p: string) => {
    const segments = p ? p.split("/").map(s => /^[A-Za-z0-9_.-]+$/.test(s) ? s : `$(${JSON.stringify(s)})`) : [];
    return `request.path == /b/$(bucket)/o${segments.length ? "/" + segments.join("/") : ""}`;
  };
  const comparisons = paths.map(comparison);
  // Rules are not filters: a list of a blocked file's ancestors must be denied.
  const ancestors = [...new Set(paths.flatMap(p => p.split("/").map((_, i, parts) => parts.slice(0, i).join("/"))))];
  const helper = `\n    function ${helperName}() {\n      return ${comparisons.join("\n        || ")};\n    }\n    function ${listHelperName}() {\n      return ${[...ancestors, ...paths].map(comparison).join("\n        || ")};\n    }\n`;
  edits.push({ start: ts[open].end, end: ts[open].end, value: helper });
  return edits.sort((a, b) => b.start - a.start).reduce((s, edit) => s.slice(0, edit.start) + edit.value + s.slice(edit.end), source);
}
