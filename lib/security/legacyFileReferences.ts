import { FieldPath, type Firestore } from "firebase-admin/firestore";
import { describeLink, digest } from "./reconciliation";
import type { LinkInventory } from "./migrationPlan";

export function legacyAudioBinding(path: string) {
  const parts = /^spaces\/([^/]+)\/assignments\/([^/]+)\/submissions\/([^/]+)\/audio\/([^/]+)$/.exec(path);
  if (!parts) return null;
  const [, spaceId, activityId, participantId, filename] = parts;
  const reading = /^(.*)-audio_reading\.[^.]+$/.exec(filename);
  const podcast = /^(.*)-podcast-([a-zA-Z0-9_-]+)\.[^.]+$/.exec(filename);
  if (!reading && !podcast) return null;
  return { spaceId, activityId, participantId, submissionId: (reading || podcast)![1], purpose: reading ? "audio_reading" as const : "podcast" as const,
    ...(podcast ? { segmentId: podcast[2] } : {}) };
}

/** Only known leaf reference fields are fetched. Never fetch podcast scripts or inline recordings. */
export async function inventoryLegacyFileReferences(db: Firestore, bucket: string, objects: { path: string; protectedFile: boolean }[], progress?: (completed: number) => void) {
  const references: (LinkInventory & { updateTime: { seconds: number; nanoseconds: number }; currentValueDigest: string })[] = [];
  const results: { path: string; binding: ReturnType<typeof legacyAudioBinding>; matchingReferences: number; status: string }[] = [];
  const queue = [...objects.filter(object => object.protectedFile && object.path.startsWith("spaces/"))];
  let completed = 0;
  async function inspect(object: { path: string }) {
    const binding = legacyAudioBinding(object.path);
    if (!binding) { results.push({ path: object.path, binding, matchingReferences: 0, status: "unknown_filename_schema" }); return; }
    const base = binding.purpose === "podcast" ? ["podcastWorkshop", "productionSegments", binding.segmentId!, "voice"] : ["audioReading"];
    const fields = [new FieldPath(...base, "storagePath"), new FieldPath(...base, "audioStoragePath")];
    const paths = [`spaces/${binding.spaceId}/lessons/${binding.activityId}/submissions/${binding.submissionId}`,
      `spaceSubmissions/${binding.submissionId}`, `submissions/${binding.submissionId}`];
    const found: typeof references = [];
    function collect(doc: FirebaseFirestore.DocumentSnapshot, field: FieldPath, fieldSegments: string[]) {
      const value = doc.get(field);
      if (typeof value !== "string" || !doc.updateTime) return;
      const described = describeLink(value);
      const linkedPath = "objectPath" in described ? described.objectPath : undefined;
      const linkedBucket = "bucket" in described ? described.bucket : undefined;
      if (value !== object.path && !(linkedPath === object.path && linkedBucket === bucket)) return;
      found.push({ document: doc.ref.path, field: field.toString(), fieldSegments, bucket, objectPath: object.path, digest: digest(value),
        currentValueDigest: digest(value), updateTime: { seconds: doc.updateTime.seconds, nanoseconds: doc.updateTime.nanoseconds } });
    }
    try {
      const docs = await db.getAll(...paths.map(path => db.doc(path)), { fieldMask: fields });
      for (const doc of docs) if (doc.exists) for (const [index, field] of fields.entries()) collect(doc, field, [...base, index === 0 ? "storagePath" : "audioStoragePath"]);
      // URL range filtering happens on the server, before reading values. data: audio is excluded.
      const url = new FieldPath(...base, "audioDataUrl");
      for (const path of paths) {
        const collection = db.doc(path).parent;
        const urls = await collection.where(url, ">=", "http").where(url, "<", "httq").select(url).get();
        for (const doc of urls.docs) collect(doc, url, [...base, "audioDataUrl"]);
      }
      references.push(...found);
      results.push({ path: object.path, binding, matchingReferences: found.length, status: found.length ? "references_found" : "manual_reference_review_required" });
    } catch (error) {
      results.push({ path: object.path, binding, matchingReferences: found.length, status: `metadata_unavailable:${String((error as { code?: unknown }).code ?? "unknown")}` });
    }
  }
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) { await inspect(queue.shift()!); completed++; progress?.(completed); }
  }));
  const unique = [...new Map(references.map(ref => [JSON.stringify([ref.document, ref.field, ref.objectPath]), ref])).values()];
  return { readOnly: true, mediaDownloaded: false, references: unique, files: results,
    summary: { filesInspected: results.length, filesWithReferences: results.filter(result => result.matchingReferences > 0 && result.status === "references_found").length,
      filesNeedingReview: results.filter(result => result.status !== "references_found").length, referenceCount: unique.length } };
}
