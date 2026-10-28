import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import type { GetFilesOptions, GetFilesResponse } from "@google-cloud/storage";
import { PROFILE_AUTHORITY_FIELDS, classifyFile, describeLink, digest, elevatedFields, flatten, reconcile,
  type AuthorityRecord, type ApprovalLedger } from "../lib/security/reconciliation";

const flags = new Set<string>();
for (let index = 2; index < process.argv.length; index += 2) {
  const flag = process.argv[index];
  if (!["--project", "--out", "--ledger", "--bucket"].includes(flag) || flags.has(flag) || !process.argv[index + 1] || process.argv[index + 1].startsWith("--")) throw new Error("Unknown, duplicate or incomplete read-only option");
  flags.add(flag);
}
const arg = (key: string) => process.argv[process.argv.indexOf(key) + 1];
const projectId = process.argv.includes("--project") ? arg("--project") : "";
const output = process.argv.includes("--out") ? path.resolve(arg("--out")) : "";
if (!projectId || !output || !output.startsWith(path.resolve(".vercel") + path.sep)) throw new Error("Explicit --project and private --out under .vercel are required");
const demo = projectId.startsWith("demo-");
if (demo && (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8188" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9098" || process.env.FIREBASE_STORAGE_EMULATOR_HOST !== "127.0.0.1:9199")) throw new Error("Demo inventory requires all local emulators");
if (!demo && ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST"].some(key => process.env[key])) throw new Error("Mixed production/emulator configuration refused");
if (demo) process.env.GOOGLE_CLOUD_PROJECT = projectId;
const app = demo ? initializeApp({ projectId }) : (await import("../lib/firebaseAdmin")).getAdminApp();
if (app.options.projectId !== projectId) throw new Error("Credential/project mismatch");
const db = getFirestore(app), auth = getAuth(app), storage = getStorage(app);
const ledger: ApprovalLedger | undefined = process.argv.includes("--ledger") ? JSON.parse(await readFile(arg("--ledger"), "utf8")) : undefined;
const report: Record<string, unknown> = { projectId, capturedAt: new Date().toISOString(), readOnly: true, contentDownloaded: false, sections: {}, limitations: [
  "Stored profiles and application audit events are evidence to investigate, not independent authorization.",
  "Firestore projection covers known URL fields only; dynamic podcast segment keys and other historical schemas require a separately approved field-specific inventory.",
  "Signed URLs are not enumerated by object metadata; absence of a stored URL does not prove no URL was issued.",
  "Metadata alone cannot classify every covers/live image; unclassified files require owner review without publishing content.",
] };
const sections = report.sections as Record<string, unknown>;
async function section(name: string, work: () => Promise<unknown>) {
  try { sections[name] = { status: "complete", result: await work() }; }
  catch (error) { sections[name] = { status: "unavailable", code: String((error as { code?: unknown }).code ?? "request_failed") }; }
  console.log(JSON.stringify({ section: name, status: (sections[name] as { status: string }).status }));
}
const records: AuthorityRecord[] = [];
try {
  await section("profiles", async () => {
    const profiles = await db.collection("users").select(...PROFILE_AUTHORITY_FIELDS).get();
    records.push(...profiles.docs.map(doc => ({ uid: doc.id, source: "profile" as const, fields: doc.data() })));
    return { scanned: profiles.size, privileged: records.filter(record => Object.keys(elevatedFields(record.fields)).length).length };
  });
  await section("authentication", async () => {
    let pageToken: string | undefined;
    let scanned = 0;
    do {
      const batch = await auth.listUsers(1000, pageToken);
      for (const user of batch.users) {
        const allowed = new Set(PROFILE_AUTHORITY_FIELDS.map(field => field.split(".")[0]));
        const claims = Object.entries(user.customClaims ?? {});
        const fields = Object.fromEntries(claims.filter(([key]) => allowed.has(key)));
        const unknown = Object.fromEntries(claims.filter(([key]) => !allowed.has(key)).map(([key, value]) => [key, digest(value)]));
        if (Object.keys(unknown).length) fields.unclassifiedClaimDigests = unknown;
        records.push({ uid: user.uid, source: "authClaims", fields: { ...fields, disabled: user.disabled } }); scanned++;
      }
      pageToken = batch.pageToken;
    } while (pageToken);
    return { scanned };
  });
  await section("schoolMemberships", async () => {
    const schools = await db.collection("schools").select().get();
    for (const school of schools.docs) {
      const members = await school.ref.collection("members").where("role", "in", ["school_admin", "admin"]).select("uid", "schoolId", "role", "status").get();
      records.push(...members.docs.map(member => ({ uid: member.id, source: "schoolMember" as const, scope: school.id, fields: member.data() })));
    }
    return { schoolsScanned: schools.size };
  });
  const privileged = records.filter(record => Object.keys(elevatedFields(record.fields)).length);
  // Persist authority fields only, including neutral fields for independent manual review.
  report.authority = { records: privileged, ...reconcile(records, ledger, projectId),
    inventoryComplete: ["profiles", "authentication", "schoolMemberships"].every(key => (sections[key] as { status: string }).status === "complete"),
    profileMembershipConflicts: records.filter(record => record.source === "profile" && record.fields.schoolRole === "school_admin" && record.fields.schoolStatus === "active" &&
      !records.some(member => member.source === "schoolMember" && member.uid === record.uid && member.scope === record.fields.schoolId && member.fields.status === "active")).map(record => record.uid) };
  await section("applicationAuditEvidence", async () => {
    const events = await db.collection("adminAuditEvents").select("type", "actorUid", "targetUid", "schoolId", "createdAt").get();
    return events.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  });
  const bucketName = process.argv.includes("--bucket") ? arg("--bucket") : process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!bucketName || ![`${projectId}.appspot.com`, `${projectId}.firebasestorage.app`].includes(bucketName)) throw new Error("Explicit matching Firebase bucket required");
  const bucket = storage.bucket(bucketName);
  await section("bucketMetadata", async () => { const [m] = await bucket.getMetadata(); return { name: m.name, iamConfiguration: m.iamConfiguration, versioning: m.versioning, retentionPolicy: m.retentionPolicy }; });
  await section("bucketIam", async () => { const [policy] = await bucket.iam.getPolicy(); return { publicBindings: policy.bindings?.filter(binding => binding.members?.some(member => member === "allUsers" || member === "allAuthenticatedUsers")) ?? [] }; });
  await section("files", async () => {
    const files: Record<string, unknown>[] = [];
    let next: (GetFilesOptions & { projection: "full" }) | undefined = { autoPaginate: false, maxResults: 250, versions: true, projection: "full" };
    const pages = new Set<string>();
    do {
      const [batch, query]: GetFilesResponse = await bucket.getFiles(next ?? undefined);
      for (const file of batch) {
        const m = file.metadata;
        files.push({ path: file.name, generation: m.generation, metageneration: m.metageneration, contentType: m.contentType, cacheControl: m.cacheControl,
          size: m.size, noncurrent: !!m.timeDeleted, objectAclStatus: Array.isArray(m.acl) ? "checked" : "unknown",
          publicObjectAcl: Array.isArray(m.acl) ? m.acl.some(entry => ["allUsers", "allAuthenticatedUsers"].includes(entry.entity ?? "")) : null,
          ...classifyFile(file.name, m as unknown as Record<string, unknown>) });
      }
      if (query?.pageToken && pages.has(query.pageToken)) throw new Error("Repeated metadata page");
      if (query?.pageToken) pages.add(query.pageToken);
      next = query?.pageToken ? { ...query, autoPaginate: false, maxResults: 250, versions: true, projection: "full" } : undefined;
    } while (next);
    return { count: files.length, manifestDigest: digest(files), objects: files };
  });
  await section("storedLinks", async () => {
    const fields = ["spaceId", "assignmentId", "activityId", "audioReading.storagePath", "storagePath"];
    // Explicit canonical collections avoid creating production collection-group
    // indexes just to audit URL fields. Parent enumeration projects IDs only.
    const queries = [db.collection("submissions"), db.collection("spaceSubmissions")];
    const spaces = await db.collection("spaces").select().get();
    for (const space of spaces.docs) {
      queries.push(space.ref.collection("board"));
      for (const kind of ["lessons", "writingActivities"]) {
        const activities = await space.ref.collection(kind).select().get();
        queries.push(...activities.docs.map(activity => activity.ref.collection("submissions")));
      }
    }
    const links: Record<string, unknown>[] = [];
    let projectedDocuments = 0;
    const urlFieldCoverage: Record<string, unknown>[] = [];
    for (const query of queries) {
      const snapshot = await query.select(...fields).get();
      projectedDocuments += snapshot.size;
      for (const doc of snapshot.docs) for (const [field, value] of Object.entries(flatten(doc.data()))) {
        if (typeof value === "string" && /(?:Url|Path)$/.test(field)) links.push({ document: doc.ref.path, field, ...describeLink(value) });
      }
      // A range filter excludes inline recordings BEFORE retrieval. Never project an
      // unfiltered audioDataUrl/imageUrl: old records can contain entire files there.
      for (const field of ["imageUrl", "printProfile.imageUrl", "audioReading.audioDataUrl", "audioDataUrl", "data.imageUrl"]) {
        try {
          const urls = await query.where(field, ">=", "http").where(field, "<", "httq").select(field).get();
          for (const doc of urls.docs) { const value = doc.get(field); if (typeof value === "string") links.push({ document: doc.ref.path, field, ...describeLink(value) }); }
          const inline = await query.where(field, ">=", "data:").where(field, "<", "data;").select().get();
          urlFieldCoverage.push({ collection: query.path, field, status: "complete", inlineFileDocuments: inline.docs.map(doc => doc.ref.path) });
        } catch (error) { urlFieldCoverage.push({ collection: query.path, field, status: "unavailable", code: String((error as { code?: unknown }).code ?? "request_failed") }); }
      }
    }
    return { projectedDocuments, links, urlFieldCoverage };
  });
  const fileSection = sections.files as { result?: { objects: Record<string, unknown>[]; manifestDigest: string } };
  const linkSection = sections.storedLinks as { result?: { links: Record<string, unknown>[] } };
  for (const object of fileSection.result?.objects ?? []) {
    const references = (linkSection.result?.links ?? []).filter(link => link.bucket === bucketName && link.objectPath === object.path &&
      typeof link.document === "string" && /^spaces\/[^/]+\/(?:writingActivities\/[^/]+\/submissions\/|board\/)/.test(link.document));
    if (references.length) {
      object.protectedFile = true;
      object.confirmedReferenceCount = references.length;
      object.actions = ["copy_to_private_namespace_and_rewrite_references", "revoke_download_tokens_after_authenticated_reader_ready", "check_object_acl_bucket_iam_and_old_generations", "verify_old_signed_urls_denied_or_expired"];
    }
  }
  if (fileSection.result) fileSection.result.manifestDigest = digest(fileSection.result.objects);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2), { mode: 0o600, flag: "wx" });
  console.log(JSON.stringify({ projectId, readOnly: true, sections: Object.fromEntries(Object.entries(sections).map(([key, value]) => [key, (value as { status: string }).status])), privilegedRecords: privileged.length,
    findings: (report.authority as { findings: unknown[] }).findings.length, output }));
} finally { await deleteApp(app); }
