import { countWords, getWritingAiMinWords } from "./levels";
import type {
  WritingAiPolicy,
  WritingLevel,
  WritingSectionTemplate,
} from "./types";

export type WritingAiUnlockContext = {
  level: WritingLevel | string;
  sectionText?: string;
  completedFieldCount?: number;
  completedSectionIds?: string[];
};

export type WritingAiUnlockDecision = {
  allowed: boolean;
  reason?: "ai_disabled" | "min_words" | "min_fields" | "required_sections";
  required?: number | string[];
  actual?: number | string[];
};

function getRequiredWords(policy: WritingAiPolicy, level: WritingLevel | string) {
  const levelKey = String(level || "").trim().toUpperCase() as WritingLevel;
  return policy.minWordsByLevel?.[levelKey] ?? getWritingAiMinWords(level);
}

export function canUseWritingAi(
  policy: WritingAiPolicy | undefined,
  context: WritingAiUnlockContext
): WritingAiUnlockDecision {
  if (!policy?.enabled) {
    return { allowed: false, reason: "ai_disabled" };
  }

  const requirement = policy.unlockRequirement;
  if (!requirement) return { allowed: true };

  if (requirement.type === "min_words") {
    const required = getRequiredWords(policy, context.level);
    const actual = countWords(context.sectionText ?? "");
    return actual >= required
      ? { allowed: true }
      : { allowed: false, reason: "min_words", required, actual };
  }

  if (requirement.type === "min_fields") {
    const actual = context.completedFieldCount ?? 0;
    return actual >= requirement.value
      ? { allowed: true }
      : {
          allowed: false,
          reason: "min_fields",
          required: requirement.value,
          actual,
        };
  }

  const completed = new Set(context.completedSectionIds ?? []);
  const missing = requirement.sectionIds.filter((sectionId) => !completed.has(sectionId));

  return missing.length === 0
    ? { allowed: true }
    : {
        allowed: false,
        reason: "required_sections",
        required: requirement.sectionIds,
        actual: [...completed],
      };
}

export function getSectionAiPolicy(section: WritingSectionTemplate) {
  return section.aiPolicy;
}
