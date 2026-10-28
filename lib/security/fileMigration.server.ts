import "server-only";
import { getApps } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { FieldPath, FieldValue, Timestamp, getFirestore, type Firestore } from "firebase-admin/firestore";
import type { Bucket, FileMetadata } from "@google-cloud/storage";
import { privateSpaceFileUrl, validSpaceFileId, type SpaceFileRecord, type SpaceFileScope } from "../spaceFiles";
import { classifyFile, describeLink, digest } from "./reconciliation";
import { legacyAudioBinding } from "./legacyFileReferences";

type Version = { seconds: number; nanoseconds: number };
type Change = { document: string; version: Version; segments: string[]; expectedDigest: string; replacement: string | null };
type Source = { path: string; generation: string; metageneration: string; size: number; contentType: string; md5Hash: string | null; crc32c: string | null };
export type MigrationCandidate = { source: { path: string; generation?: string; metageneration?: string }; references: { document: string; field: string; fieldSegments?: string[] | null }[] };
export type PreparedMigrationItem = { id: string; scope: SpaceFileScope; ownerUid: string; participantId: string; source: Source; destination: string; changes: Change[] };
export type PreparedMigration = { schema: 1; projectId: string; bucket: string; preparedAt: string; items: PreparedMigrationItem[];
  blocked: { sourceDigest: string; sourcePath: string; reason: string }[]; digest: string };
export type MigrationEvent = { action: "started" | "copied" | "committed" | "already_committed" | "stopped"; manifestDigest: string; fileId?: string; code?: string };
const ownershipFields = ["uid", "userId", "studentUid", "participantId", "spaceId", "assignmentId", "activityId"];

function requireCondition(condition: unknown, code: string): asserts condition { if (!condition) throw new Error(code); }
function string(value: unknown) { return typeof value === "string" && value.length ? value : null; }
function sourceMetadata(path: string, data: FileMetadata): Source {
  const result = { path, generation: String(data.generation || ""), metageneration: String(data.metageneration || ""), size: Number(data.size),
    contentType: data.contentType || "", md5Hash: string(data.md5Hash), crc32c: string(data.crc32c) };
  requireCondition(result.generation && result.metageneration && Number.isSafeInteger(result.size) && result.size > 0 && (result.md5Hash || result.crc32c), "missing_object_integrity_metadata");
  return result;
}
function base(scope: SpaceFileScope) {
  return scope.purpose === "podcast" ? ["podcastWorkshop", "productionSegments", scope.segmentId!, "voice"]
    : scope.purpose === "writing_image" ? ["printProfile"] : ["audioReading"];
}
function canonicalDocument(scope: SpaceFileScope) {
  return `spaces/${scope.spaceId}/${scope.purpose === "writing_image" ? "writingActivities" : "lessons"}/${scope.activityId}/submissions/${scope.submissionId}`;
}
function documents(scope: SpaceFileScope) { return [canonicalDocument(scope), `spaceSubmissions/${scope.submissionId}`, `submissions/${scope.submissionId}`]; }
function targetField(scope: SpaceFileScope) { return [...base(scope), scope.purpose === "writing_image" ? "imageUrl" : "storagePath"]; }
function scopeFor(candidate: MigrationCandidate): SpaceFileScope {
  const audio = legacyAudioBinding(candidate.source.path);
  if (audio) return { spaceId: audio.spaceId, activityId: audio.activityId, submissionId: audio.submissionId, purpose: audio.purpose, ...(audio.segmentId ? { segmentId: audio.segmentId } : {}) };
  requireCondition(!candidate.references.some(ref => ref.field === "data.imageUrl" && /^spaces\/[^/]+\/board\/state$/.test(ref.document)), "pupil_image_on_shared_board_requires_review");
  const matches = candidate.references.filter(ref => ref.field === "printProfile.imageUrl")
    .map(ref => /^spaces\/([^/]+)\/writingActivities\/([^/]+)\/submissions\/([^/]+)$/.exec(ref.document)).filter(match => !!match);
  requireCondition(matches.length === 1, "image_scope_requires_manual_mapping");
  return { spaceId: matches[0]![1], activityId: matches[0]![2], submissionId: matches[0]![3], purpose: "writing_image" };
}
function validateScope(scope: SpaceFileScope) {
  requireCondition([scope.spaceId, scope.activityId, scope.submissionId].every(validSpaceFileId)
    && ["audio_reading", "podcast", "writing_image"].includes(scope.purpose) && (scope.purpose !== "podcast" || validSpaceFileId(scope.segmentId)), "invalid_file_scope");
}
function pointsTo(value: unknown, source: string, bucket: string) {
  if (value === source) return true;
  if (typeof value !== "string") return false;
  const link = describeLink(value);
  return "bucket" in link && link.bucket === bucket && link.objectPath === source;
}
/** URL projection is server-filtered, so inline pupil content is never retrieved. */
async function projectedDocument(db: Firestore, path: string, scope: SpaceFileScope) {
  const refs = scope.purpose === "writing_image" ? [] : [new FieldPath(...base(scope), "storagePath"), new FieldPath(...base(scope), "audioStoragePath")];
  const [doc] = await db.getAll(db.doc(path), { fieldMask: [...ownershipFields, ...refs] });
  const values = new Map(refs.map(field => [field.toString(), doc.exists ? doc.get(field) : undefined]));
  if (doc.exists) {
    const url = new FieldPath(...base(scope), scope.purpose === "writing_image" ? "imageUrl" : "audioDataUrl");
    // A previously migrated private image is also safe to inspect as URL metadata.
    for (const [lower, upper] of [["http", "httq"], ...(scope.purpose === "writing_image" ? [["/api/space-files/", "/api/space-files0"]] : [])]) {
      const query = await db.doc(path).parent.where(url, ">=", lower).where(url, "<", upper).select(url).get();
      const matching = query.docs.find(result => result.id === doc.id);
      if (!matching) continue;
      requireCondition(matching.updateTime.isEqual(doc.updateTime!), "document_changed_during_projection");
      values.set(url.toString(), matching.get(url));
    }
  }
  return { doc, values };
}
function fields(scope: SpaceFileScope) {
  return scope.purpose === "writing_image" ? [targetField(scope)] : [targetField(scope), [...base(scope), "audioStoragePath"], [...base(scope), "audioDataUrl"]];
}
function privacy(data: FileMetadata, item: PreparedMigrationItem, manifestDigest: string) {
  const expected = item.source;
  requireCondition(data.metadata?.assetId === item.id && data.metadata?.migrationDigest === manifestDigest && data.metadata?.spaceId === item.scope.spaceId
    && !data.metadata?.firebaseStorageDownloadTokens && !data.acl?.some(acl => ["allUsers", "allAuthenticatedUsers"].includes(acl.entity || ""))
    && data.cacheControl === "private,no-store" && Number(data.size) === expected.size && data.contentType === expected.contentType
    && (!expected.md5Hash || data.md5Hash === expected.md5Hash) && (!expected.crc32c || data.crc32c === expected.crc32c) && data.generation, "destination_integrity_or_privacy_mismatch");
}
function projectMatches(projectId: string, db: Firestore, bucket: Bucket) {
  requireCondition(getApps().some(app => app.options.projectId === projectId && getFirestore(app) === db && getStorage(app).bucket(bucket.name).storage === bucket.storage)
    && [`${projectId}.appspot.com`, `${projectId}.firebasestorage.app`].includes(bucket.name), "wrong_project_or_bucket");
}

/** Fresh metadata only. No Storage download/read stream, and no write operations. */
export async function prepareFileMigration(projectId: string, db: Firestore, bucket: Bucket, candidates: MigrationCandidate[]): Promise<PreparedMigration> {
  projectMatches(projectId, db, bucket);
  const items: PreparedMigrationItem[] = [], blocked: PreparedMigration["blocked"] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    try {
      requireCondition(!seen.has(candidate.source.path), "duplicate_source"); seen.add(candidate.source.path);
      const scope = scopeFor(candidate); validateScope(scope);
      const [metadata] = await bucket.file(candidate.source.path).getMetadata();
      requireCondition(classifyFile(candidate.source.path, metadata as Record<string, unknown>).protectedFile, "source_not_classified_as_pupil_file");
      const source = sourceMetadata(candidate.source.path, metadata);
      requireCondition((!candidate.source.generation || candidate.source.generation === source.generation)
        && (!candidate.source.metageneration || candidate.source.metageneration === source.metageneration), "source_changed_since_inventory");
      const audio = scope.purpose !== "writing_image";
      requireCondition(source.size <= (audio ? 25 : 8) * 1024 * 1024 && (audio
        ? ["audio/webm", "audio/ogg", "audio/wav", "audio/mp4", "audio/mpeg", "audio/x-m4a"].includes(source.contentType)
        : ["image/webp", "image/png", "image/jpeg"].includes(source.contentType)), "unsupported_file_type_or_size");
      const snapshots = await Promise.all(documents(scope).map(path => projectedDocument(db, path, scope)));
      const existence = await db.getAll(db.doc(`spaces/${scope.spaceId}`), db.doc(`spaces/${scope.spaceId}/${audio ? "lessons" : "writingActivities"}/${scope.activityId}`), { fieldMask: ["ownerId"] });
      requireCondition(existence.every(doc => doc.exists), "space_or_activity_missing");
      const canonical = snapshots[0].doc;
      requireCondition(canonical.exists, "canonical_submission_missing");
      const owners = new Set(["uid", "userId", "studentUid"].map(field => string(canonical.get(field))).filter(value => !!value));
      requireCondition(owners.size === 1, "owner_missing_or_ambiguous");
      const ownerUid = [...owners][0]!;
      const participantId = string(canonical.get("participantId")) || ownerUid;
      const binding = legacyAudioBinding(candidate.source.path);
      requireCondition(!binding || [ownerUid, participantId].includes(binding.participantId), "legacy_path_owner_mismatch");
      const id = digest([projectId, candidate.source.path, source.generation]).slice(0, 32);
      const destination = `private-space-files/${scope.spaceId}/${id}`;
      const changes: Change[] = [];
      for (const { doc, values } of snapshots) {
        if (!doc.exists) continue;
        for (const field of ["uid", "userId", "studentUid"]) requireCondition(!doc.get(field) || doc.get(field) === ownerUid, "mirror_owner_mismatch");
        requireCondition(!doc.get("participantId") || doc.get("participantId") === participantId, "mirror_participant_mismatch");
        for (const [field, expected] of [["spaceId", scope.spaceId], ["activityId", scope.activityId], ["assignmentId", scope.activityId]]) requireCondition(!doc.get(field) || doc.get(field) === expected, "submission_scope_mismatch");
        let matched = false;
        for (const segments of fields(scope)) {
          const value = values.get(new FieldPath(...segments).toString());
          if (!pointsTo(value, source.path, bucket.name)) continue;
          matched = true;
          changes.push({ document: doc.ref.path, version: { seconds: doc.updateTime!.seconds, nanoseconds: doc.updateTime!.nanoseconds }, segments,
            expectedDigest: digest(value), replacement: segments.at(-1) === "audioDataUrl" ? null : audio ? destination : privateSpaceFileUrl(id) });
        }
        if (matched && audio) {
          const segments = targetField(scope);
          const value = values.get(new FieldPath(...segments).toString());
          requireCondition(value == null || value === "" || pointsTo(value, source.path, bucket.name), "canonical_file_reference_conflict");
          if (value == null || value === "") changes.push({ document: doc.ref.path, version: { seconds: doc.updateTime!.seconds, nanoseconds: doc.updateTime!.nanoseconds }, segments, expectedDigest: digest(value), replacement: destination });
        }
      }
      requireCondition(changes.some(change => change.document === canonical.ref.path), "canonical_reference_not_found");
      requireCondition(candidate.references.every(reference => changes.some(change => change.document === reference.document
        && (new FieldPath(...change.segments).toString() === reference.field || change.segments.join(".") === reference.field)
        && (!reference.fieldSegments || digest(reference.fieldSegments) === digest(change.segments)))), "inventory_reference_not_verified");
      items.push({ id, scope, source, destination, ownerUid, participantId, changes });
    } catch (error) { blocked.push({ sourceDigest: digest(candidate.source.path), sourcePath: candidate.source.path,
      reason: error instanceof Error && /^[a-z_]+$/.test(error.message) ? error.message : "metadata_inspection_failed" }); }
  }
  const versions = new Map<string, string>();
  const inconsistent = new Set<string>();
  for (const item of items) for (const change of item.changes) {
    const version = digest(change.version);
    if (versions.has(change.document) && versions.get(change.document) !== version) inconsistent.add(change.document);
    versions.set(change.document, version);
  }
  for (let index = items.length - 1; index >= 0; index--) if (items[index].changes.some(change => inconsistent.has(change.document))) {
    const [item] = items.splice(index, 1);
    blocked.push({ sourceDigest: digest(item.source.path), sourcePath: item.source.path, reason: "document_changed_during_prepare" });
  }
  const payload = { schema: 1 as const, projectId, bucket: bucket.name, preparedAt: new Date().toISOString(), items, blocked };
  return { ...payload, digest: digest(payload) };
}

function validateManifest(manifest: PreparedMigration) {
  const { digest: checksum, ...payload } = manifest;
  requireCondition(manifest.schema === 1 && checksum === digest(payload) && manifest.items.length > 0, "invalid_manifest_digest_or_schema");
  const ids = new Set<string>(), paths = new Set<string>();
  for (const item of manifest.items) {
    validateScope(item.scope);
    requireCondition(item.id === digest([manifest.projectId, item.source.path, item.source.generation]).slice(0, 32)
      && item.destination === `private-space-files/${item.scope.spaceId}/${item.id}` && !ids.has(item.id) && !paths.has(item.source.path)
      && validSpaceFileId(item.ownerUid) && validSpaceFileId(item.participantId) && item.changes.length > 0, "invalid_or_duplicate_manifest_item");
    ids.add(item.id); paths.add(item.source.path);
    for (const change of item.changes) requireCondition(documents(item.scope).includes(change.document)
      && fields(item.scope).some(field => digest(field) === digest(change.segments))
      && change.replacement === (change.segments.at(-1) === "audioDataUrl" ? null : item.scope.purpose === "writing_image" ? privateSpaceFileUrl(item.id) : item.destination), "unsafe_reference_update");
  }
}

/** Intentionally locked to local emulators. No production-write mode exists. */
export async function applyLocalFileMigration(db: Firestore, bucket: Bucket, manifest: PreparedMigration, approvedDigest: string, journal: (event: MigrationEvent) => Promise<void>) {
  requireCondition(manifest.projectId.startsWith("demo-") && process.env.FIRESTORE_EMULATOR_HOST === "127.0.0.1:8188"
    && process.env.FIREBASE_STORAGE_EMULATOR_HOST === "127.0.0.1:9199", "local_emulators_required_for_writes");
  projectMatches(manifest.projectId, db, bucket); validateManifest(manifest);
  requireCondition(approvedDigest === manifest.digest && manifest.blocked.length === 0, "manifest_not_fully_approved_or_has_blockers");
  const writes = new Map<string, { version: Version; changes: Map<string, Change> }>();
  for (const item of manifest.items) for (const change of item.changes) {
    const entry = writes.get(change.document) || { version: change.version, changes: new Map<string, Change>() };
    requireCondition(digest(entry.version) === digest(change.version), "inconsistent_document_versions");
    const key = digest(change.segments);
    requireCondition(!entry.changes.has(key) || digest(entry.changes.get(key)) === digest(change), "conflicting_reference_updates");
    entry.changes.set(key, change); writes.set(change.document, entry);
  }
  requireCondition(writes.size + manifest.items.length <= 400, "atomic_batch_limit_exceeded");
  await journal({ action: "started", manifestDigest: manifest.digest });
  try {
    const existing = await db.getAll(...manifest.items.map(item => db.doc(`privateSpaceFiles/${item.id}`)), {
      fieldMask: ["migrationDigest", "status", "storagePath", "generation", "ownerUid", "participantId", "spaceId", "activityId", "submissionId", "purpose", "segmentId"] });
    if (existing.every(record => record.exists && record.get("migrationDigest") === manifest.digest && record.get("status") === "ready")) {
      for (const [index, item] of manifest.items.entries()) {
        const record = existing[index];
        requireCondition(record.get("storagePath") === item.destination && record.get("ownerUid") === item.ownerUid && record.get("participantId") === item.participantId
          && Object.entries(item.scope).every(([field, value]) => record.get(field) === value), "completed_asset_metadata_changed");
        const [metadata] = await bucket.file(item.destination).getMetadata(); privacy(metadata, item, manifest.digest);
        requireCondition(String(metadata.generation) === record.get("generation"), "completed_asset_generation_changed");
        const snapshots = await Promise.all(documents(item.scope).map(path => projectedDocument(db, path, item.scope)));
        for (const change of item.changes) {
          const snapshot = snapshots.find(result => result.doc.ref.path === change.document);
          const value = snapshot?.values.get(new FieldPath(...change.segments).toString());
          requireCondition(snapshot?.doc.exists && (change.replacement === null ? value == null : value === change.replacement), "completed_migration_reference_changed");
        }
      }
      await journal({ action: "already_committed", manifestDigest: manifest.digest });
      return { status: "already_committed" as const, copied: 0, sourceFilesRetired: 0 };
    }
    requireCondition(existing.every(record => !record.exists), "partial_or_foreign_asset_records");
    const versions = await db.getAll(...[...writes.keys()].map(path => db.doc(path)), { fieldMask: ownershipFields });
    for (const doc of versions) requireCondition(doc.exists && doc.updateTime!.isEqual(new Timestamp(writes.get(doc.ref.path)!.version.seconds, writes.get(doc.ref.path)!.version.nanoseconds)), "document_changed_since_prepare");
    const results: { item: PreparedMigrationItem; generation: string }[] = [];
    for (const item of manifest.items) {
      const [metadata] = await bucket.file(item.source.path).getMetadata();
      requireCondition(digest(sourceMetadata(item.source.path, metadata)) === digest(item.source), "source_changed_since_prepare");
      const destination = bucket.file(item.destination);
      let result: FileMetadata | undefined;
      try {
        [result] = await destination.getMetadata();
      } catch (error) { if (Number((error as { code?: unknown }).code) !== 404) throw error; }
      if (!result) {
        try {
          await bucket.file(item.source.path, { generation: item.source.generation }).copy(destination, { preconditionOpts: { ifGenerationMatch: 0 },
            cacheControl: "private,no-store", contentType: item.source.contentType, contentDisposition: "inline", metadata: {
              firebaseStorageDownloadTokens: null, assetId: item.id, spaceId: item.scope.spaceId, migrationDigest: manifest.digest } });
        } catch (error) { if (Number((error as { code?: unknown }).code) !== 412) throw error; }
        [result] = await destination.getMetadata();
      }
      privacy(result, item, manifest.digest);
      const [current] = await bucket.file(item.source.path).getMetadata();
      requireCondition(digest(sourceMetadata(item.source.path, current)) === digest(item.source), "source_changed_during_copy");
      results.push({ item, generation: String(result.generation) });
      await journal({ action: "copied", manifestDigest: manifest.digest, fileId: item.id });
    }
    // One atomic batch across all selected segments and all affected mirror documents.
    // Update-time preconditions avoid reading any answers or scripts in a transaction.
    for (const { item } of results) {
      const [metadata] = await bucket.file(item.source.path).getMetadata();
      requireCondition(digest(sourceMetadata(item.source.path, metadata)) === digest(item.source), "source_changed_before_commit");
    }
    const batch = db.batch();
    for (const [path, entry] of writes) {
      const args: (FieldPath | string | FieldValue)[] = [];
      for (const change of entry.changes.values()) args.push(new FieldPath(...change.segments), change.replacement === null ? FieldValue.delete() : change.replacement);
      batch.update(db.doc(path), args[0] as FieldPath, args[1], ...args.slice(2), { lastUpdateTime: new Timestamp(entry.version.seconds, entry.version.nanoseconds) });
    }
    for (const { item, generation } of results) {
      const record: SpaceFileRecord & { migrationDigest: string; migratedAt: number } = { ...item.scope, ownerUid: item.ownerUid, participantId: item.participantId,
        storagePath: item.destination, uploadPath: `private-space-uploads/${item.scope.spaceId}/${item.id}`, contentType: item.source.contentType,
        size: item.source.size, generation, status: "ready", createdAt: 0, migratedAt: Date.now(), migrationDigest: manifest.digest };
      batch.create(db.doc(`privateSpaceFiles/${item.id}`), record);
    }
    await batch.commit();
    await journal({ action: "committed", manifestDigest: manifest.digest });
    return { status: "committed" as const, copied: results.length, sourceFilesRetired: 0 };
  } catch (error) {
    await journal({ action: "stopped", manifestDigest: manifest.digest, code: "migration_stopped_requires_review" });
    throw error;
  }
}
