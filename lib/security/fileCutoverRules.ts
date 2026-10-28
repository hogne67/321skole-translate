/** Derive the final rule set from the maintained transitional rules. Never deploys. */
export function buildFileCutoverRules(source: string) {
  const clauses = [
    ["match /spaces/{spaceId}/assignments/{assignmentId}/submissions/{studentUid}/audio/{fileName}", "allow read: if canReadStudentAudio(spaceId, studentUid);", "allow read: if false;"],
    ["match /board-images/{ownerUid}/{spaceId}/{fileName}", "allow read: if isActiveSpaceMember(spaceId) || isSpaceOwner(spaceId);", "allow read: if false;"],
    ["match /writing-print-images/{ownerUid}/{spaceId}/{activityId}/{fileName}", "allow read: if isActiveSpaceMember(spaceId) || isSpaceOwner(spaceId);", "allow read: if false;"],
    ["match /covers/{ownerUid}/{rest=**}", "allow read: if true;", `allow read: if !resource.name.matches('covers/[^/]+/writing-print-.*')
        && resource.metadata.get("context", "") != "student-writing-print"
        && resource.metadata.get("context", "") != "student_writing_print";`],
  ];
  let result = source;
  for (const [anchor, before, after] of clauses) {
    const start = result.indexOf(anchor);
    if (start < 0 || result.indexOf(anchor, start + 1) !== -1) throw new Error("cutover_rule_anchor_missing_or_ambiguous");
    const end = result.indexOf("match /", start + anchor.length);
    const block = result.slice(start, end === -1 ? result.length : end);
    if (!block.includes(before) || block.indexOf(before) !== block.lastIndexOf(before)) throw new Error("cutover_read_clause_changed_requires_review");
    result = result.slice(0, start) + block.replace(before, after) + (end === -1 ? "" : result.slice(end));
  }
  return result.replace("// Existing recordings remain readable under membership checks until migration.", "// Final cutover: legacy SDK reads/metadata are closed after approved migration.");
}
