// Read-only inspection of the four already identified files. Never fetches media.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { deleteApp } from "firebase-admin/app";
import { FieldPath } from "firebase-admin/firestore";
import { getAdmin, getAdminApp } from "../lib/firebaseAdmin";
import { describeLink, digest } from "../lib/security/reconciliation";

const args = process.argv.slice(2), options = new Map<string, string>();
for (let index = 0; index < args.length; index += 2) {
  if (!["--project", "--review", "--out"].includes(args[index]) || !args[index + 1] || options.has(args[index])) throw new Error("Invalid read-only arguments");
  options.set(args[index], args[index + 1]);
}
const project = options.get("--project");
const input = path.resolve(options.get("--review") || ""), output = path.resolve(options.get("--out") || "");
if (!project || ![input, output].every(file => file.startsWith(path.resolve(".vercel") + path.sep))) throw new Error("Explicit project and private paths required");
if (["FIRESTORE_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"].some(key => process.env[key])) throw new Error("Mixed or emulator configuration refused");
type Review = { sourcePath: string; sourceDigest: string; purpose: string; historicalReferences: { document: string; field: string }[] };
const review = JSON.parse(await readFile(input, "utf8")) as { projectId: string; reviews: Review[] };
if (review.projectId !== project || review.reviews.length !== 4 || new Set(review.reviews.map(file => file.sourcePath)).size !== 4
  || review.reviews.filter(file => file.purpose === "image").length !== 1 || review.reviews.some(file => digest(file.sourcePath) !== file.sourceDigest)) throw new Error("Expected the four reviewed files");
const app = getAdminApp();
if (app.options.projectId !== project) throw new Error("Wrong-project credentials");
try {
  const { storage, db } = getAdmin();
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "";
  if (![`${project}.appspot.com`, `${project}.firebasestorage.app`].includes(bucketName)) throw new Error("Wrong-project bucket");
  const bucket = storage.bucket(bucketName);
  const [bucketMetadata] = await bucket.getMetadata();
  let publicIam: boolean | null = null;
  try { const [policy] = await bucket.iam.getPolicy(); publicIam = !!policy.bindings?.some(binding => binding.members?.some(member => ["allUsers", "allAuthenticatedUsers"].includes(member))); }
  catch { /* Unknown is a blocker, never assumed private. */ }
  const files = [];
  for (const file of review.reviews) {
    const [metadata] = await bucket.file(file.sourcePath).getMetadata({ projection: "full" });
    const [listed] = await bucket.getFiles({ prefix: file.sourcePath, versions: true });
    const exact = listed.filter(object => object.name === file.sourcePath);
    const versions = await Promise.all(exact.map(async object => {
      const [version] = await object.getMetadata({ projection: "full" });
      return { generation: String(version.generation), metageneration: String(version.metageneration), size: Number(version.size),
        md5Hash: version.md5Hash ?? null, crc32c: version.crc32c ?? null, timeDeleted: version.timeDeleted ?? null,
        temporaryHold: version.temporaryHold === true, eventBasedHold: version.eventBasedHold === true,
        retention: version.retention ?? null };
    }));
    const archiveId = digest([project, file.sourcePath, String(metadata.generation)]);
    files.push({ sourcePath: file.sourcePath, sourceDigest: file.sourceDigest, purpose: file.purpose,
      generation: String(metadata.generation), metageneration: String(metadata.metageneration), size: Number(metadata.size), contentType: metadata.contentType,
      md5Hash: metadata.md5Hash ?? null, crc32c: metadata.crc32c ?? null, cacheControl: metadata.cacheControl ?? null,
      tokenCount: String(metadata.metadata?.firebaseStorageDownloadTokens || "").split(",").filter(Boolean).length,
      publicObjectAcl: !!metadata.acl?.some(entry => ["allUsers", "allAuthenticatedUsers"].includes(entry.entity || "")),
      proposedArchivePath: `private-file-quarantine/${archiveId}`, versions,
      approval: "pending_owner_approval", automaticDeletion: false });
  }
  const image = review.reviews.find(file => file.purpose === "image")!;
  const reference = image.historicalReferences.find(ref => ref.field === "data.imageUrl" && /^spaces\/[^/]+\/board\/state$/.test(ref.document));
  if (!reference) throw new Error("Expected exact board image reference");
  const document = db.doc(reference.document), imageField = new FieldPath("data", "imageUrl");
  const [board] = await db.getAll(document, { fieldMask: ["active", "mode"] });
  const query = await document.parent.where(imageField, ">=", "http").where(imageField, "<", "httq").select(imageField).get();
  const current = query.docs.find(doc => doc.id === document.id);
  const value = current?.get(imageField);
  const link = typeof value === "string" ? describeLink(value) : null;
  const matches = !!link && "bucket" in link && "objectPath" in link && link.bucket === bucketName && link.objectPath === image.sourcePath;
  const boardVersionStable = !!current && !!board.updateTime && current.updateTime.isEqual(board.updateTime);
  const plan = { projectId: project, capturedAt: new Date().toISOString(), readOnly: true, mediaDownloaded: false, executable: false,
    approvalRequired: true, bucket: bucketName,
    bucketProtection: { publicIam, uniformBucketLevelAccess: bucketMetadata.iamConfiguration?.uniformBucketLevelAccess?.enabled ?? null,
      versioning: bucketMetadata.versioning ?? null, softDeletePolicy: bucketMetadata.softDeletePolicy ?? null,
      retentionPolicy: bucketMetadata.retentionPolicy ?? null, lifecycle: bucketMetadata.lifecycle ?? null },
    files, boardChange: { document: document.path, fieldSegments: ["data", "imageUrl"], replacement: "", referenceStillMatches: matches,
      active: typeof board.get("active") === "boolean" ? board.get("active") : null, imageMode: board.get("mode") === "image",
      versionStableDuringInspection: boardVersionStable, expectedValueDigest: typeof value === "string" ? digest(value) : null,
      updateTime: current?.updateTime ? { seconds: current.updateTime.seconds, nanoseconds: current.updateTime.nanoseconds } : null,
      preserveAllOtherFieldsAndResponses: true },
    orderedActions: ["confirm_fresh_versions_and_approval", "server_copy_to_private_quarantine_without_tokens_or_public_acl",
      "verify_all_copy_generations_checksums_and_private_access", "close_only_the_four_old_paths_in_storage_rules",
      "clear_only_matching_board_imageUrl_with_document_version_precondition", "revoke_source_download_tokens_with_object_preconditions",
      "retire_old_source_generations_only_if_explicitly_approved", "verify_old_paths_unavailable_and_archive_preserved"],
    limitations: ["Clearing download tokens alone does not revoke independent GCS signed URLs or public rule access.",
      "No production mutation or retirement command is implemented by this inspection tool.", "Actual token revocation and copy/delete preconditions require the existing real-cloud test gate."] };
  await writeFile(output, JSON.stringify(plan, null, 2), { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({ files: files.length, totalBytes: files.reduce((sum, file) => sum + file.size, 0), publicIam,
    liveVersionsListed: files.reduce((sum, file) => sum + file.versions.length, 0), boardReferenceMatches: matches, boardVersionStable,
    boardActive: plan.boardChange.active, boardImageMode: plan.boardChange.imageMode, readOnly: true, mediaDownloaded: false }));
} finally { await deleteApp(app); }
