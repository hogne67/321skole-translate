import { storyWritingTemplate } from "./templates/story";
import type { WritingActivityTemplate, WritingSectionTemplate } from "./types";

export type WritingTemplateCustomization = {
  supportWordsBySection?: Record<string, string[]>;
  criteria?: string[];
  maxUsesPerSection?: number;
  aiEnabled?: boolean;
};

function cleanList(values: unknown, maxItems = 20): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .slice(0, maxItems);
}

function withSectionCustomization(
  section: WritingSectionTemplate,
  customization: WritingTemplateCustomization
): WritingSectionTemplate {
  const supportWords = cleanList(customization.supportWordsBySection?.[section.id], 16);
  const maxUses = Math.max(0, Math.min(5, Number(customization.maxUsesPerSection ?? 2) || 0));
  const criteria = cleanList(customization.criteria, 12);

  const nextFields = section.fields.map((field) => {
    if (section.id === "content_check" && field.id === "content_checklist" && criteria.length) {
      return {
        ...field,
        options: criteria,
      };
    }
    return field;
  });

  return {
    ...section,
    fields: nextFields,
    supportWords: supportWords.length ? supportWords : section.supportWords,
    aiPolicy: section.aiPolicy
      ? {
          ...section.aiPolicy,
          enabled: customization.aiEnabled !== false && maxUses > 0,
          maxUses,
        }
      : section.aiPolicy,
  };
}

export function buildStoryWritingTemplate(
  customization: WritingTemplateCustomization = {}
): WritingActivityTemplate {
  return {
    ...storyWritingTemplate,
    rooms: storyWritingTemplate.rooms.map((room) => ({
      ...room,
      sections: room.sections.map((section) => withSectionCustomization(section, customization)),
    })),
  };
}
