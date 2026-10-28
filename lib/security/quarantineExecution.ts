import { digest } from "./reconciliation";

export type QuarantineObject = { sourcePath: string; proposedArchivePath: string; generation: string; metageneration: string;
  size: number; contentType: string; md5Hash: string | null; crc32c: string | null };
export type QuarantinePlan = { projectId: string; bucket: string; files: QuarantineObject[]; boardChange: { document: string;
  expectedValueDigest: string | null; updateTime: { seconds: number; nanoseconds: number } | null; referenceStillMatches: boolean;
  versionStableDuringInspection: boolean; active: boolean | null; imageMode: boolean } };
export type QuarantineCopy = { path: string; generation: string; metageneration: string; size: number; contentType: string;
  md5Hash: string | null; crc32c: string | null; tokenCount: number; publicAcl: boolean; cacheControl: string };
export type QuarantineGate = { testProjectId: string; productionProjectId: string; passed: boolean; checkedAt: string;
  copyPreconditions: boolean; deletePreconditions: boolean; tokenRevocation: boolean; softDelete: boolean };
export type QuarantineEvent = { stage: string; planDigest: string; sourceDigest?: string; generation?: string };
export interface QuarantineOperations {
  inspect(): Promise<{ filesUnchanged: boolean; boardUnchanged: boolean; rulesUnchanged: boolean; archivePrivate: boolean }>;
  copy(file: QuarantineObject): Promise<QuarantineCopy>;
  verifyCopy(file: QuarantineObject, copy: QuarantineCopy): Promise<QuarantineCopy>;
  lockFourPaths(): Promise<void>;
  clearBoardReference(): Promise<void>;
  revokeToken(file: QuarantineObject): Promise<{ generation: string; metageneration: string; tokenCount: number }>;
  retireSource(file: QuarantineObject, updatedMetageneration: string): Promise<void>;
  verifyResult(): Promise<{ liveOriginals: number; privateCopies: number; boardCleared: boolean; otherFilesUnaffected: boolean }>;
}
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function verifiedCopy(file: QuarantineObject, copy: QuarantineCopy) {
  check(copy.path === file.proposedArchivePath && copy.generation && copy.metageneration && copy.size === file.size && copy.contentType === file.contentType
    && copy.tokenCount === 0 && !copy.publicAcl && copy.cacheControl === "private,no-store"
    && (file.md5Hash || file.crc32c) && (!file.md5Hash || copy.md5Hash === file.md5Hash) && (!file.crc32c || copy.crc32c === file.crc32c), "quarantine_copy_verification_failed");
}

/** Phase coordinator; provider adapter and actual cloud evidence are required before any write. */
export async function executeApprovedQuarantine(plan: QuarantinePlan, approval: { planDigest: string; sourceRetirementApproved: boolean },
  gate: QuarantineGate, operations: QuarantineOperations, journal: (event: QuarantineEvent) => Promise<void>) {
  const checksum = digest(plan);
  check(approval.planDigest === checksum && approval.sourceRetirementApproved, "specific_owner_approval_required");
  check(gate.passed && gate.productionProjectId === plan.projectId && gate.testProjectId !== plan.projectId && !gate.testProjectId.startsWith("demo-")
    && gate.copyPreconditions && gate.deletePreconditions && gate.tokenRevocation && gate.softDelete && Number.isFinite(Date.parse(gate.checkedAt)), "real_isolated_cloud_gate_required");
  check(plan.files.length === 4 && new Set(plan.files.map(file => file.sourcePath)).size === 4 && new Set(plan.files.map(file => file.proposedArchivePath)).size === 4
    && plan.files.every(file => file.generation && file.metageneration && file.proposedArchivePath.startsWith("private-file-quarantine/") && file.sourcePath !== file.proposedArchivePath)
    && plan.boardChange.referenceStillMatches && plan.boardChange.versionStableDuringInspection && plan.boardChange.updateTime && plan.boardChange.expectedValueDigest,
  "invalid_four_file_plan");
  await journal({ stage: "approved_preflight_started", planDigest: checksum });
  const preflight = await operations.inspect();
  check(preflight.filesUnchanged && preflight.boardUnchanged && preflight.rulesUnchanged && preflight.archivePrivate, "approved_state_changed_or_archive_not_private");
  try {
    const copies: { file: QuarantineObject; copy: QuarantineCopy }[] = [];
    for (const file of plan.files) {
      const copy = await operations.copy(file); verifiedCopy(file, copy); copies.push({ file, copy });
      await journal({ stage: "private_copy_verified", planDigest: checksum, sourceDigest: digest(file.sourcePath), generation: copy.generation });
    }
    // No source retirement or board mutation until ALL four copies are verified.
    for (const item of copies) {
      const current = await operations.verifyCopy(item.file, item.copy); verifiedCopy(item.file, current);
      check(current.generation === item.copy.generation && current.metageneration === item.copy.metageneration, "private_copy_changed");
    }
    await operations.lockFourPaths(); await journal({ stage: "four_old_paths_locked", planDigest: checksum });
    await operations.clearBoardReference(); await journal({ stage: "board_image_reference_cleared", planDigest: checksum });
    const revoked: { file: QuarantineObject; metageneration: string }[] = [];
    for (const file of plan.files) {
      const changed = await operations.revokeToken(file);
      check(changed.generation === file.generation && changed.metageneration && changed.tokenCount === 0, "source_token_revocation_failed");
      revoked.push({ file, metageneration: changed.metageneration });
      await journal({ stage: "source_tokens_revoked", planDigest: checksum, sourceDigest: digest(file.sourcePath) });
    }
    await journal({ stage: "all_copies_verified_and_tokens_revoked_before_retirement", planDigest: checksum });
    for (const { file, metageneration } of revoked) {
      const retained = copies.find(item => item.file.sourcePath === file.sourcePath)!;
      const current = await operations.verifyCopy(file, retained.copy); verifiedCopy(file, current);
      check(current.generation === retained.copy.generation && current.metageneration === retained.copy.metageneration, "private_copy_changed_before_retirement");
      await operations.retireSource(file, metageneration);
      await journal({ stage: "old_source_generation_retired", planDigest: checksum, sourceDigest: digest(file.sourcePath), generation: file.generation });
    }
    const result = await operations.verifyResult();
    check(result.liveOriginals === 0 && result.privateCopies === 4 && result.boardCleared && result.otherFilesUnaffected, "quarantine_postcheck_requires_review");
    await journal({ stage: "completed_four_files_preserved_privately", planDigest: checksum });
    return result;
  } catch (error) {
    await journal({ stage: "stopped_preserve_copies_no_automatic_rollback", planDigest: checksum });
    throw error;
  }
}
