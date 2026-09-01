export type WritingGenre =
  | "story"
  | "factual"
  | "poem"
  | "article"
  | "message";

export type WritingLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export type WritingLanguage = "nb" | "en" | "pt" | string;

export type WritingProgression = "free" | "guided" | "locked";

export type WritingPhase = "planning" | "drafting" | "revision" | "final";

export type WritingFieldKind = "short_text" | "long_text" | "choice" | "chips";

export type WritingAiAction =
  | "ask_questions"
  | "suggest_words"
  | "sentence_starters"
  | "check_requirements"
  | "continue_guidance"
  | "revision_feedback";

export type WritingUnlockRequirement =
  | { type: "min_words"; value: number }
  | { type: "min_fields"; value: number }
  | { type: "required_sections"; sectionIds: string[] };

export type WritingAiPolicy = {
  enabled: boolean;
  maxUses: number;
  allowedActions: WritingAiAction[];
  unlockRequirement?: WritingUnlockRequirement;
  focus: string;
  minWordsByLevel?: Partial<Record<WritingLevel, number>>;
};

export type WritingSectionGate = {
  minWords?: number;
  minFieldsCompleted?: number;
  requiredSectionIds?: string[];
};

export type WritingFieldTemplate = {
  id: string;
  label: string;
  kind: WritingFieldKind;
  placeholder?: string;
  required?: boolean;
  options?: string[];
};

export type WritingSectionTemplate = {
  id: string;
  title: string;
  prompt: string;
  fields: WritingFieldTemplate[];
  supportWords?: string[];
  aiPolicy?: WritingAiPolicy;
  gate?: WritingSectionGate;
};

export type WritingRoomTemplate = {
  id: string;
  title: string;
  phase: WritingPhase;
  sections: WritingSectionTemplate[];
};

export type WritingActivityTemplate = {
  genre: WritingGenre;
  title: string;
  description?: string;
  templateVersion: number;
  defaultProgression: WritingProgression;
  rooms: WritingRoomTemplate[];
};

export type WritingActivityStatus = "draft" | "assigned" | "archived";

export type WritingSubmissionStatus =
  | "draft"
  | "planning_submitted"
  | "planning_reviewed"
  | "submitted"
  | "reviewed"
  | "needs_work";

export type WritingActivity = {
  id: string;
  ownerUid: string;
  title: string;
  genre: WritingGenre;
  language: WritingLanguage;
  level: WritingLevel | string;
  theme?: string;
  targetWordCount?: number;
  assignmentText?: string;
  criteria?: string[];
  competenceGoals?: string[];
  allowPrintImageUpload?: boolean;
  allowAiImage?: boolean;
  imageUrl?: string;
  spaceId: string;
  templateVersion: number;
  rooms: WritingRoomTemplate[];
  progression: WritingProgression;
  aiPolicy: {
    enabled: boolean;
    maxUsesTotal: number;
    licenseRequired: boolean;
  };
  status: WritingActivityStatus;
  createdAt: unknown;
  updatedAt: unknown;
};

export type WritingAiUsageLog = {
  id: string;
  sectionId: string;
  action: WritingAiAction;
  prompt: string;
  response: string;
  promptSummary?: string;
  responseSummary?: string;
  createdAt: unknown;
};

export type WritingPrintProfile = {
  studentName?: string;
  school?: string;
  className?: string;
  writtenDate?: string;
  imageUrl?: string;
  imagePrompt?: string;
  aiImageGenerated?: boolean;
};

export type WritingSubmission = {
  id: string;
  activityId: string;
  studentUid: string;
  spaceId?: string;
  answersByFieldId: Record<string, string>;
  sectionDrafts: Record<string, string>;
  finalText?: string;
  aiUsage: WritingAiUsageLog[];
  status: WritingSubmissionStatus;
  teacherFeedback?: {
    text: string;
    teacherUid?: string | null;
    updatedAt?: unknown;
  };
  sectionFeedback?: Record<string, {
    text: string;
    status: "approved" | "improve";
    teacherUid?: string | null;
    updatedAt?: unknown;
  }>;
  printProfile?: WritingPrintProfile;
  createdAt: unknown;
  updatedAt: unknown;
  submittedAt?: unknown;
};
