export type CourseStatus = "draft" | "published" | "active" | "completed";
export type CourseSessionStatus = "planned" | "completed" | "cancelled";
export type ParticipantStatus = "invited" | "enrolled" | "active" | "completed" | "cancelled";
export type CourseMessageStatus = "draft" | "sent" | "failed";
export type SignupRequestStatus = "new" | "accepted" | "rejected" | "contacted";
export type CourseDate = { toDate: () => Date };
export type CourseSaleStatus = "not_for_sale" | "ready" | "needs_review";
export type CourseDeliveryType =
  | "live_instruction"
  | "recorded_digital_content"
  | "mixed"
  | "needs_review";
export type CourseVatTreatment =
  | "vat_exempt_education"
  | "vatable_digital_service"
  | "needs_review";

export type CoursePlanSession = {
  sessionNumber: number;
  title: string;
  description: string;
  contentSuggestions: string;
  resources: CourseSessionResource[];
  startsAt: string;
  durationMinutes: number;
  meetingUrl: string;
  homework: string;
  status: CourseSessionStatus;
};

export type CourseSessionResourceType = "platform" | "link" | "pdf" | "note";
export type CourseSessionResourceVisibility = "teacher" | "participants" | "public";

export type CourseSessionResource = {
  id: string;
  type: CourseSessionResourceType;
  visibility: CourseSessionResourceVisibility;
  sourceId: string;
  sourceType: string;
  title: string;
  url: string;
  description: string;
};

export type CourseParticipant = {
  id: string;
  participantUid: string;
  roleSnapshot: string;
  name: string;
  email: string;
  phone: string;
  organization: string;
  note: string;
  status: ParticipantStatus;
  createdAt?: CourseDate | null;
  updatedAt?: CourseDate | null;
};

export type CourseMessage = {
  id: string;
  subject: string;
  body: string;
  recipientsCount: number;
  recipientEmails: string[];
  sentByUid: string;
  status: CourseMessageStatus;
  errorMessage: string;
  createdAt?: CourseDate | null;
};

export type CourseSignupRequest = {
  id: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  status: SignupRequestStatus;
  createdAt?: CourseDate | null;
  updatedAt?: CourseDate | null;
};

export type CourseMarketing = {
  coverImageUrl: string;
  coverImageSource: "upload" | "ai" | "";
  coverImagePrompt: string;
  coverImageStyle: "illustration" | "realistic";
  summary: string;
  salesText: string;
  seoTitle: string;
  seoDescription: string;
};

export type CourseTaxProfile = {
  deliveryType: CourseDeliveryType;
  vatTreatment: CourseVatTreatment;
  vatNote: string;
};

export type CourseSalesSettings = {
  saleStatus: CourseSaleStatus;
  currency: string;
  priceAmountOre: number;
  taxProfile: CourseTaxProfile;
};

export type Course = {
  id: string;
  ownerUid: string;
  title: string;
  description: string;
  learningGoals: string;
  targetAudience: string;
  language: string;
  level: string;
  priceText: string;
  maxParticipants: number;
  numberOfSessions: number;
  numberOfWeeks: number;
  status: CourseStatus;
  slug: string;
  publicUrl: string;
  marketing: CourseMarketing;
  sales: CourseSalesSettings;
  publishedAt?: CourseDate | null;
  coursePlan: CoursePlanSession[];
  createdAt?: CourseDate | null;
  updatedAt?: CourseDate | null;
};

export type CourseFormValues = Omit<
  Course,
  | "id"
  | "ownerUid"
  | "slug"
  | "publicUrl"
  | "marketing"
  | "sales"
  | "publishedAt"
  | "createdAt"
  | "updatedAt"
>;

export const DEFAULT_COURSE_FORM: CourseFormValues = {
  title: "",
  description: "",
  learningGoals: "",
  targetAudience: "",
  language: "Norwegian",
  level: "a1start",
  priceText: "",
  maxParticipants: 12,
  numberOfSessions: 6,
  numberOfWeeks: 6,
  status: "draft",
  coursePlan: [],
};

export function createEmptyCoursePlan(numberOfSessions: number): CoursePlanSession[] {
  const count = Math.max(0, Math.floor(numberOfSessions));
  return Array.from({ length: count }, (_, index) => ({
    sessionNumber: index + 1,
    title: "",
    description: "",
    contentSuggestions: "",
    resources: [],
    startsAt: "",
    durationMinutes: 120,
    meetingUrl: "",
    homework: "",
    status: "planned",
  }));
}

export function normalizeCoursePlan(value: unknown): CoursePlanSession[] {
  if (!Array.isArray(value)) return [];

  return value.map((item, index) => {
    const record =
      item && typeof item === "object" ? (item as Record<string, unknown>) : {};

    return {
      sessionNumber: numberOrDefault(record.sessionNumber, index + 1),
      title: typeof record.title === "string" ? record.title : "",
      description: typeof record.description === "string" ? record.description : "",
      contentSuggestions: typeof record.contentSuggestions === "string" ? record.contentSuggestions : "",
      resources: normalizeSessionResources(record.resources),
      startsAt: typeof record.startsAt === "string" ? record.startsAt : "",
      durationMinutes: numberOrDefault(record.durationMinutes, 120),
      meetingUrl: typeof record.meetingUrl === "string" ? record.meetingUrl : "",
      homework: typeof record.homework === "string" ? record.homework : "",
      status: normalizeSessionStatus(record.status),
    };
  });
}

export function normalizeSessionResources(value: unknown): CourseSessionResource[] {
  if (!Array.isArray(value)) return [];

  return value.map((item, index) => {
    const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};

    return {
      id: typeof record.id === "string" && record.id ? record.id : `resource-${index + 1}`,
      type: normalizeSessionResourceType(record.type),
      visibility: normalizeSessionResourceVisibility(record.visibility),
      sourceId: typeof record.sourceId === "string" ? record.sourceId : "",
      sourceType: typeof record.sourceType === "string" ? record.sourceType : "",
      title: typeof record.title === "string" ? record.title : "",
      url: typeof record.url === "string" ? record.url : "",
      description: typeof record.description === "string" ? record.description : "",
    };
  });
}

export function normalizeSessionResourceType(value: unknown): CourseSessionResourceType {
  if (value === "platform" || value === "pdf" || value === "note") return value;
  return "link";
}

export function normalizeSessionResourceVisibility(value: unknown): CourseSessionResourceVisibility {
  if (value === "teacher" || value === "public") return value;
  return "participants";
}

export function syncCoursePlanSessionCount(
  currentPlan: CoursePlanSession[],
  numberOfSessions: number
): CoursePlanSession[] {
  const target = Math.max(0, Math.floor(numberOfSessions));
  if (target <= currentPlan.length) return currentPlan;

  const appended: CoursePlanSession[] = Array.from(
    { length: target - currentPlan.length },
    (_, index) => {
      const sessionNumber = currentPlan.length + index + 1;
      return {
        sessionNumber,
        title: "",
        description: "",
        contentSuggestions: "",
        resources: [],
        startsAt: "",
        durationMinutes: 120,
        meetingUrl: "",
        homework: "",
        status: "planned",
      };
    }
  );

  return [...currentPlan, ...appended];
}

export function normalizeCourse(id: string, data: Record<string, unknown>): Course {
  return {
    id,
    ownerUid: typeof data.ownerUid === "string" ? data.ownerUid : "",
    title: typeof data.title === "string" ? data.title : "",
    description: typeof data.description === "string" ? data.description : "",
    learningGoals: typeof data.learningGoals === "string" ? data.learningGoals : "",
    targetAudience: typeof data.targetAudience === "string" ? data.targetAudience : "",
    language: typeof data.language === "string" ? data.language : "",
    level: typeof data.level === "string" ? data.level : "",
    priceText: typeof data.priceText === "string" ? data.priceText : "",
    maxParticipants: numberOrZero(data.maxParticipants),
    numberOfSessions: numberOrZero(data.numberOfSessions),
    numberOfWeeks: numberOrZero(data.numberOfWeeks),
    status: normalizeStatus(data.status),
    slug: typeof data.slug === "string" ? data.slug : "",
    publicUrl: typeof data.publicUrl === "string" ? data.publicUrl : "",
    marketing: normalizeCourseMarketing(data.marketing),
    sales: normalizeCourseSalesSettings(data.sales),
    publishedAt: normalizeDate(data.publishedAt),
    coursePlan: normalizeCoursePlan(data.coursePlan),
    createdAt: normalizeDate(data.createdAt),
    updatedAt: normalizeDate(data.updatedAt),
  };
}

export function defaultCourseTaxProfile(): CourseTaxProfile {
  return {
    deliveryType: "live_instruction",
    vatTreatment: "vat_exempt_education",
    vatNote:
      "Live instructor-led course with participant interaction. No recorded self-study product is sold as the primary product.",
  };
}

export function normalizeCourseSalesSettings(value: unknown): CourseSalesSettings {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    saleStatus: normalizeCourseSaleStatus(record.saleStatus),
    currency: normalizeCurrency(record.currency),
    priceAmountOre: numberOrZero(record.priceAmountOre),
    taxProfile: normalizeCourseTaxProfile(record.taxProfile),
  };
}

export function normalizeCourseTaxProfile(value: unknown): CourseTaxProfile {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const deliveryType = normalizeCourseDeliveryType(record.deliveryType);

  return {
    deliveryType,
    vatTreatment: normalizeCourseVatTreatment(record.vatTreatment, deliveryType),
    vatNote:
      typeof record.vatNote === "string" && record.vatNote.trim()
        ? record.vatNote.trim()
        : defaultCourseTaxProfile().vatNote,
  };
}

export function normalizeCourseMarketing(value: unknown): CourseMarketing {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    coverImageUrl: typeof record.coverImageUrl === "string" ? record.coverImageUrl : "",
    coverImageSource:
      record.coverImageSource === "upload" || record.coverImageSource === "ai"
        ? record.coverImageSource
        : "",
    coverImagePrompt: typeof record.coverImagePrompt === "string" ? record.coverImagePrompt : "",
    coverImageStyle: record.coverImageStyle === "realistic" ? "realistic" : "illustration",
    summary: typeof record.summary === "string" ? record.summary : "",
    salesText: typeof record.salesText === "string" ? record.salesText : "",
    seoTitle: typeof record.seoTitle === "string" ? record.seoTitle : "",
    seoDescription: typeof record.seoDescription === "string" ? record.seoDescription : "",
  };
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeCurrency(value: unknown): string {
  const currency = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (/^[A-Z]{3}$/.test(currency)) return currency;
  return "NOK";
}

function normalizeCourseSaleStatus(value: unknown): CourseSaleStatus {
  if (value === "ready" || value === "needs_review") return value;
  return "not_for_sale";
}

function normalizeCourseDeliveryType(value: unknown): CourseDeliveryType {
  if (value === "recorded_digital_content" || value === "mixed" || value === "needs_review") {
    return value;
  }

  return "live_instruction";
}

function normalizeCourseVatTreatment(
  value: unknown,
  deliveryType: CourseDeliveryType
): CourseVatTreatment {
  if (value === "vat_exempt_education" || value === "vatable_digital_service" || value === "needs_review") {
    return value;
  }

  if (deliveryType === "live_instruction") return "vat_exempt_education";
  if (deliveryType === "recorded_digital_content") return "vatable_digital_service";
  return "needs_review";
}

function numberOrDefault(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeStatus(value: unknown): CourseStatus {
  if (value === "published" || value === "active" || value === "completed") return value;
  return "draft";
}

export function normalizeSessionStatus(value: unknown): CourseSessionStatus {
  if (value === "completed" || value === "cancelled") return value;
  return "planned";
}

export function normalizeParticipantStatus(value: unknown): ParticipantStatus {
  if (
    value === "invited" ||
    value === "active" ||
    value === "completed" ||
    value === "cancelled"
  ) {
    return value;
  }

  return "enrolled";
}

export function normalizeMessageStatus(value: unknown): CourseMessageStatus {
  if (value === "draft" || value === "failed") return value;
  return "sent";
}

export function normalizeSignupRequestStatus(value: unknown): SignupRequestStatus {
  if (value === "accepted" || value === "rejected" || value === "contacted") return value;
  return "new";
}

export function normalizeCourseParticipant(
  id: string,
  data: Record<string, unknown>
): CourseParticipant {
  return {
    id,
    participantUid: typeof data.participantUid === "string" ? data.participantUid : "",
    roleSnapshot: typeof data.roleSnapshot === "string" ? data.roleSnapshot : "",
    name: typeof data.name === "string" ? data.name : "",
    email: typeof data.email === "string" ? data.email : "",
    phone: typeof data.phone === "string" ? data.phone : "",
    organization: typeof data.organization === "string" ? data.organization : "",
    note: typeof data.note === "string" ? data.note : "",
    status: normalizeParticipantStatus(data.status),
    createdAt: normalizeDate(data.createdAt),
    updatedAt: normalizeDate(data.updatedAt),
  };
}

export function normalizeCourseMessage(
  id: string,
  data: Record<string, unknown>
): CourseMessage {
  return {
    id,
    subject: typeof data.subject === "string" ? data.subject : "",
    body: typeof data.body === "string" ? data.body : "",
    recipientsCount: numberOrZero(data.recipientsCount),
    recipientEmails: Array.isArray(data.recipientEmails)
      ? data.recipientEmails.filter((email): email is string => typeof email === "string")
      : [],
    sentByUid: typeof data.sentByUid === "string" ? data.sentByUid : "",
    status: normalizeMessageStatus(data.status),
    errorMessage: typeof data.errorMessage === "string" ? data.errorMessage : "",
    createdAt: normalizeDate(data.createdAt),
  };
}

export function normalizeCourseSignupRequest(
  id: string,
  data: Record<string, unknown>
): CourseSignupRequest {
  return {
    id,
    name: typeof data.name === "string" ? data.name : "",
    email: typeof data.email === "string" ? data.email : "",
    phone: typeof data.phone === "string" ? data.phone : "",
    message: typeof data.message === "string" ? data.message : "",
    status: normalizeSignupRequestStatus(data.status),
    createdAt: normalizeDate(data.createdAt),
    updatedAt: normalizeDate(data.updatedAt),
  };
}

function normalizeDate(value: unknown): CourseDate | null {
  if (value && typeof value === "object" && "toDate" in value) {
    const candidate = value as { toDate?: unknown };
    if (typeof candidate.toDate === "function") return candidate as CourseDate;
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return { toDate: () => date };
  }

  return null;
}
