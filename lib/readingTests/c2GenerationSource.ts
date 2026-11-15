type SourceResult = {ok: true; value: Record<string, unknown>} | {ok: false; error: string};
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The C2 generator writes every sentence once. References are resolved before
// the existing quote checks and independent semantic reviews run. Its draft
// format never changes the public reading-test response or student task forms.
export function resolveC2GenerationSource(value: unknown): SourceResult {
  if (!record(value)) return {ok: false, error: "C2 output must be a JSON object."};
  if (value.sourceParagraphs === undefined) return {ok: true, value}; // Existing plain-text output remains supported.
  const paragraphs = value.sourceParagraphs;
  if (!Array.isArray(paragraphs) || paragraphs.length !== 4) return {ok: false, error: "C2 sourceParagraphs must contain exactly four arrays of complete sentences."};
  const source = new Map<string, string>();
  const text: string[] = [];
  for (let p = 0; p < paragraphs.length; p++) {
    const sentences = paragraphs[p];
    if (!Array.isArray(sentences) || !sentences.length || sentences.some(sentence => typeof sentence !== "string" || !sentence.trim() || /\r?\n/.test(sentence))) {
      return {ok: false, error: `C2 paragraph ${p + 1} must be a nonempty array of complete sentence strings, without embedded line breaks.`};
    }
    const cleaned = (sentences as string[]).map(sentence => sentence.trim());
    cleaned.forEach((sentence, i) => source.set(`p${p + 1}s${i + 1}`, sentence));
    text.push(cleaned.join(" "));
  }
  const tasks = value.tasks;
  if (!record(tasks) || !Array.isArray(tasks.mcq) || !record(tasks.bestSummary)) return {ok: false, error: "C2 output must contain tasks.mcq and tasks.bestSummary."};
  const resolve = (references: unknown, field: string): string[] | string => {
    if (!Array.isArray(references) || !references.length) return `${field} must contain sentence references such as p1s1 and p3s2.`;
    const evidence: string[] = [];
    for (const reference of references) {
      const id = typeof reference === "string" ? reference.trim().toLowerCase() : "";
      const sentence = source.get(id);
      if (!sentence) return `${field} has unknown source reference ${JSON.stringify(reference)}. Use only existing pXsY sentence references, not quotations or ellipses.`;
      evidence.push(sentence);
    }
    return evidence;
  };
  const mcq: Record<string, unknown>[] = [];
  for (let i = 0; i < tasks.mcq.length; i++) {
    const task = tasks.mcq[i];
    if (!record(task)) return {ok: false, error: `C2 mcq ${i + 1} must be an object.`};
    const evidence = resolve(task.evidence, `mcq ${i + 1} evidence`);
    if (typeof evidence === "string") return {ok: false, error: evidence};
    mcq.push({...task, evidence});
  }
  const summary = tasks.bestSummary;
  if (!Array.isArray(summary.optionEvidence) || summary.optionEvidence.length !== 3) return {ok: false, error: "C2 bestSummary.optionEvidence needs three arrays of sentence references in option order."};
  const optionEvidence: string[][] = [];
  for (let i = 0; i < 3; i++) {
    const evidence = resolve(summary.optionEvidence[i], `summary option ${i + 1} evidence`);
    if (typeof evidence === "string") return {ok: false, error: evidence};
    optionEvidence.push(evidence);
  }
  // Ignore a redundant freehand text field: the supplied source sentences are
  // authoritative, so reference evidence and reviewed text cannot diverge.
  const output: Record<string, unknown> = {...value, text: text.join("\n\n"), tasks: {...tasks, mcq, bestSummary: {...summary, optionEvidence}}};
  delete output.sourceParagraphs;
  return {ok: true, value: output};
}
