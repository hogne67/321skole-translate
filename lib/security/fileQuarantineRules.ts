/** Four exact legacy paths only; returns a review artifact and never deploys. */
export function buildFourFileQuarantineRules(source: string, paths: string[]) {
  if (paths.length !== 4 || new Set(paths).size !== 4 || paths.some(path => !/^(spaces|covers)\/.+/.test(path)
    || Array.from(path).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 || character === "\\") || path.length > 1024
    || path.split("/").some(segment => !segment || segment === "." || segment === ".."))) throw new Error("Expected four exact legacy object paths");
  const anchor = "match /b/{bucket}/o {";
  if (source.indexOf(anchor) < 0 || source.indexOf(anchor) !== source.lastIndexOf(anchor) || source.includes("isFourFileQuarantinePath")) throw new Error("Storage rules need manual review");
  const helper = `
    function isFourFileQuarantinePath() {
      let blocked = ${JSON.stringify(paths)};
      return (resource != null && resource.name in blocked)
        || (request.resource != null && request.resource.name in blocked);
    }
`;
  let statements = 0;
  const gated = source.replace(/^([ \t]*allow[ \t]+[a-z, \t]+:[ \t]*if[ \t]*)([^;]+);/gm, (_match, prefix, condition) => {
    statements++;
    return `${prefix}!isFourFileQuarantinePath() && (${condition});`;
  });
  if (statements === 0) throw new Error("No allow statements found");
  return gated.replace(anchor, anchor + helper);
}
