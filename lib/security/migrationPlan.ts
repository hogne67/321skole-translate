import { digest } from "./reconciliation";
import { legacyAudioBinding } from "./legacyFileReferences";

export type FileInventory = { path: string; generation?: string; metageneration?: string; spaceId?: string | null; protectedFile: boolean; publicRule: boolean; tokenCount: number };
export type LinkInventory = { document: string; field: string; bucket?: string; objectPath?: string; digest: string;
  fieldSegments?: string[]; updateTime?: { seconds: number; nanoseconds: number }; currentValueDigest?: string };
export function planFileMigration(projectId: string, bucket: string, objects: FileInventory[], links: LinkInventory[]) {
  const items = objects.filter(object => object.protectedFile).map(object => {
    const fileId = digest([projectId, object.path, object.generation]).slice(0, 32);
    const mapped = links.filter(link => link.bucket === bucket && link.objectPath === object.path || link.digest === digest(object.path));
    const unique = new Map<string, LinkInventory>();
    for (const link of mapped) {
      const key = JSON.stringify([link.document, link.field]);
      if (!unique.has(key) || link.updateTime) unique.set(key, link);
    }
    const references = [...unique.values()].map(link => ({ document: link.document, field: link.field, fieldSegments: link.fieldSegments ?? null,
      updateTime: link.updateTime ?? null, currentValueDigest: link.currentValueDigest ?? link.digest }));
    const binding = legacyAudioBinding(object.path);
    return { fileId, source: { bucket, path: object.path, generation: object.generation, metageneration: object.metageneration },
      proposedDestination: object.spaceId ? `private-space-files/${object.spaceId}/${fileId}` : null,
      proposedAssetScope: binding,
      references, approval: "pending_manual_review", blockers: [
        ...(!object.spaceId ? ["space_scope_not_verified"] : []),
        ...(!object.generation || !object.metageneration ? ["object_preconditions_missing"] : []),
        ...(!references.length ? ["reference_mapping_incomplete_or_file_is_unreferenced"] : []),
        ...(references.some(reference => !reference.updateTime) ? ["reference_update_time_refresh_required"] : []),
        ...(!binding ? ["private_asset_scope_requires_manual_mapping"] : []),
      ],
      requiredActions: ["confirm_file_scope_and_owner", "deploy_and_test_authenticated_upload_and_reader", "server_side_copy_with_generation_preconditions",
        "remove_inherited_tokens_and_public_acl_on_destination", "verify_checksum_and_permissions", "create_privateSpaceFiles_record_with_verified_owner_scope_size_type_and_generation", "rewrite_all_canonical_and_mirror_references_with_update_time_preconditions",
        "verify_legitimate_and_revoked_access", "revoke_tokens_and_retire_approved_old_object_generations", "verify_old_urls_and_cache_exposure"],
    };
  });
  return { projectId, generatedFrom: digest({ objects, links }), automaticChanges: false, executable: false,
    items, summary: { protectedFiles: items.length, filesWithKnownReferences: items.filter(item => item.references.length).length,
      filesRequiringReferenceReview: items.filter(item => !item.references.length).length } };
}
