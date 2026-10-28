// Pilot policy: no network import sources. There is deliberately no client or environment switch.
export const SCHOOL_CALENDAR_URL_SOURCES: readonly string[] = Object.freeze([]);
export const SCHOOL_CALENDAR_URL_DISABLED = "Import fra lenke er deaktivert i piloten. Last opp skoleruten som PDF eller Word-fil.";
export const MAX_CALENDAR_FILE_BYTES = 10 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_CALENDAR_FILE_BYTES + 1024 * 1024;
export class SchoolCalendarImportError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
const fail = (status: number, message: string): never => { throw new SchoolCalendarImportError(status, message); };
export function isCalendarUploadRequest(request: Request) {
  return /^multipart\/form-data\s*;/i.test(request.headers.get("content-type") ?? "");
}
export async function readCalendarUploadForm(request: Request) {
  if (!isCalendarUploadRequest(request)) return fail(403, SCHOOL_CALENDAR_URL_DISABLED);
  if (!request.body) return fail(400, "Velg en PDF- eller Word-fil først.");
  const signal = AbortSignal.timeout(15_000), reader = request.body.getReader();
  const parts: Uint8Array[] = []; let size = 0;
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const item = await reader.read();
      signal.throwIfAborted();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > MAX_MULTIPART_BYTES) return fail(413, "Opplastingen er for stor. Maks filstørrelse er 10 MB.");
      parts.push(item.value);
    }
    return await new Response(new Uint8Array(Buffer.concat(parts)), { headers: { "Content-Type": request.headers.get("content-type")! } }).formData();
  } catch (error) {
    if (error instanceof SchoolCalendarImportError) throw error;
    if (signal.aborted) return fail(408, "Opplastingen tok for lang tid. Prøv igjen.");
    return fail(400, "Kunne ikke lese opplastingen. Velg en PDF- eller Word-fil.");
  } finally { signal.removeEventListener("abort", abort); await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}

export async function validateCalendarFile(file: File): Promise<{ buffer: Buffer; kind: "pdf" | "doc" | "docx"; mimeType: string }> {
  if (!file.name.trim() || file.name.length > 200 || /[/\\]/.test(file.name) || [...file.name].some(char => char.charCodeAt(0) < 32)) return fail(400, "Ugyldig filnavn.");
  const kind = /\.(pdf|docx|doc)$/i.exec(file.name)?.[1].toLowerCase() as "pdf" | "doc" | "docx" | undefined;
  if (!kind) return fail(415, "Last opp PDF, DOCX eller Word-dokument.");
  if (file.size <= 0) return fail(400, "Filen er tom.");
  if (file.size > MAX_CALENDAR_FILE_BYTES) return fail(413, "Filen er for stor. Maks størrelse er 10 MB.");
  const mimeType = { pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }[kind];
  if (file.type && ![mimeType, "application/octet-stream"].includes(file.type.toLowerCase())) return fail(415, "Filtypen stemmer ikke med dokumentet.");
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length !== file.size) return fail(400, "Dokumentet kunne ikke leses fullstendig.");
  if (kind === "pdf") {
    const tail = buffer.subarray(-1024).toString("latin1");
    const xref = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(tail);
    const offset = xref ? Number(xref[1]) : -1;
    const target = offset >= 0 && offset < buffer.length ? buffer.subarray(offset, offset + 1024).toString("latin1") : "";
    if (!/^%PDF-(1\.[0-7]|2\.0)[\r\n\s]/.test(buffer.subarray(0, 10).toString("ascii")) || !xref || !Number.isSafeInteger(offset) ||
      !(target.startsWith("xref") || (/^\d+\s+\d+\s+obj\b/.test(target) && /\/Type\s*\/XRef\b/.test(target)))) return fail(415, "Filen er ikke et gyldig støttet PDF-dokument.");
  } else if (kind === "doc") {
    const magic = Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]);
    if (buffer.length < 512 || !buffer.subarray(0, 8).equals(magic) || buffer.readUInt16LE(28) !== 0xfffe ||
      ![9,12].includes(buffer.readUInt16LE(30)) || buffer.readUInt16LE(32) !== 6 ||
      !buffer.includes(Buffer.from("WordDocument\0", "utf16le"))) return fail(415, "Filen er ikke et støttet Word-dokument.");
  } else if (!buffer.subarray(0, 4).equals(Buffer.from([0x50,0x4b,0x03,0x04]))) {
    return fail(415, "Filen er ikke et gyldig DOCX-dokument.");
  }
  return { buffer, kind, mimeType };
}
