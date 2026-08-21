import { factualWritingTemplate, storyWritingTemplate } from "./templates";
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
  const existingSupportWords = cleanList(section.supportWords, 16);
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

  const nextSection: WritingSectionTemplate = {
    ...section,
    fields: nextFields,
    supportWords: supportWords.length ? supportWords : existingSupportWords,
  };

  if (section.aiPolicy) {
    nextSection.aiPolicy = {
      ...section.aiPolicy,
      enabled: customization.aiEnabled !== false && maxUses > 0,
      maxUses,
    };
  }

  return nextSection;
}

function buildWritingTemplateFromBase(
  baseTemplate: WritingActivityTemplate,
  customization: WritingTemplateCustomization = {}
): WritingActivityTemplate {
  return {
    ...baseTemplate,
    rooms: baseTemplate.rooms.map((room) => ({
      ...room,
      sections: room.sections.map((section) => withSectionCustomization(section, customization)),
    })),
  };
}

export function buildStoryWritingTemplate(
  customization: WritingTemplateCustomization = {}
): WritingActivityTemplate {
  return buildWritingTemplateFromBase(storyWritingTemplate, customization);
}

export function buildFactualWritingTemplate(
  customization: WritingTemplateCustomization = {}
): WritingActivityTemplate {
  return buildWritingTemplateFromBase(factualWritingTemplate, customization);
}

export function buildWritingTemplate(
  genre: unknown,
  customization: WritingTemplateCustomization = {}
): WritingActivityTemplate {
  return genre === "factual"
    ? buildFactualWritingTemplate(customization)
    : buildStoryWritingTemplate(customization);
}
