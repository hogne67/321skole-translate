// lib/contentFeed.ts
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  Timestamp,
  documentId,
} from "firebase/firestore";
import type { Firestore } from "firebase/firestore";
import type { AppMode } from "@/lib/mode";
import { getTextTypeSearchTerms, normalizeTextTypeValue } from "@/lib/textTypes";

const MY_CONTENT_QUERY_LIMIT = 250;
const MY_SPACE_QUERY_LIMIT = 250;

export type PublishVisibility = "public" | "unlisted" | "private";

export type ContentItem =
  | {
    type: "lesson";
    id: string;
    title: string;
    status?: string;
    updatedAt?: Date | null;
    href: string;
    meta?: string[];
    ownerId?: string;
    activePublishedId?: string | null;
    visibility?: PublishVisibility;
    publishVisibility?: PublishVisibility;
    showInLibrary?: boolean;
    lessonType?: string;
    textType?: string;
    texttype?: string;
    mathType?: string;
    contentType?: string;
    language?: string;
    level?: string;
    authorName?: string;
    source?: string;
    sourcePublishedQuizId?: string;
    deletedAt?: Date | null;
  }
  | {
    type: "submission";
    id: string;
    title: string;
    status?: string;
    updatedAt?: Date | null;
    href: string;
    meta?: string[];
    uid?: string | null;
    lessonId?: string;
    spaceId?: string;
    assignmentId?: string;
    hasAnswers?: boolean;
    authorName?: string;
    deletedAt?: Date | null;
  }
  | {
    type: "space";
    id: string;
    title: string;
    status?: string;
    updatedAt?: Date | null;
    href: string;
    meta?: string[];
    ownerUid?: string;
    joinCode?: string;
    deletedAt?: Date | null;
  }
  | {
    type: "writingActivity";
    id: string;
    title: string;
    status?: string;
    updatedAt?: Date | null;
    href: string;
    meta?: string[];
    ownerUid?: string;
    level?: string;
    language?: string;
    theme?: string | null;
    genre?: string;
    aiEnabled?: boolean;
    aiMaxUsesTotal?: number;
    targetWordCount?: number;
    deletedAt?: Date | null;
  };

function isArchived(d: unknown): boolean {
  const x = d as Record<string, unknown> | null;
  return x?.archived === true || x?.studentArchived === true;
}

function toDateSafe(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Timestamp) return v.toDate();
  if (v instanceof Date) return v;

  if (typeof v === "object" && v !== null) {
    const anyV = v as { seconds?: unknown; nanoseconds?: unknown };
    if (typeof anyV.seconds === "number") {
      const ns = typeof anyV.nanoseconds === "number" ? anyV.nanoseconds : 0;
      return new Timestamp(anyV.seconds, ns).toDate();
    }
  }

  if (typeof v === "string" || typeof v === "number") {
    const date = new Date(v);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function pickTitle(d: unknown): string {
  const x = d as Record<string, unknown> | null;
  const candidates = [x?.title, x?.name, x?.lessonTitle, x?.spaceName, x?.topic];

  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }

  return "";
}

function pickLevel(d: unknown): string {
  const x = d as Record<string, unknown> | null;
  const v = x?.level ?? x?.cefr ?? x?.difficulty;
  return typeof v === "string" ? v.trim() : v != null ? String(v) : "";
}

function pickStatus(d: unknown): string | undefined {
  const x = d as Record<string, unknown> | null;
  const s = x?.status || x?.state || x?.publishStatus;
  return typeof s === "string" ? s : undefined;
}

function pickUpdated(d: unknown): Date | null {
  const x = d as Record<string, unknown> | null;
  return (
    toDateSafe(x?.updatedAt) ||
    toDateSafe(x?.savedAt) ||
    toDateSafe(x?.modifiedAt) ||
    toDateSafe(x?.lastEditedAt) ||
    toDateSafe(x?.createdAt) ||
    null
  );
}

function hasSavedAnswers(d: unknown): boolean {
  const x = d as Record<string, unknown> | null;
  const answers = x?.answers;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return false;

  return Object.values(answers as Record<string, unknown>).some((value) => {
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return value !== null && value !== undefined;
  });
}

function pickLessonType(d: unknown): string | undefined {
  const x = d as Record<string, unknown> | null;
  const candidates = [x?.lessonType, x?.lesson_type];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return undefined;
}

function pickTextType(d: unknown): string | undefined {
  const x = d as Record<string, unknown> | null;
  const v = x?.textType;
  return typeof v === "string" && v.trim() ? normalizeTextTypeValue(v) : undefined;
}

function pickTexttype(d: unknown): string | undefined {
  const x = d as Record<string, unknown> | null;
  const v = x?.texttype;
  return typeof v === "string" && v.trim() ? normalizeTextTypeValue(v) : undefined;
}

function pickMathType(d: unknown): string | undefined {
  const x = d as Record<string, unknown> | null;
  const v = x?.mathType;
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function pickContentType(d: unknown): string | undefined {
  const x = d as Record<string, unknown> | null;
  const v = x?.contentType;
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function pickLanguage(d: unknown): string | undefined {
  const x = d as Record<string, unknown> | null;
  const v = x?.language || x?.lang;
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function pickAuthorName(d: unknown): string | undefined {
  const x = d as Record<string, unknown> | null;

  const candidates = [
    x?.producerName,
    x?.authorName,
    x?.ownerName,
    x?.createdByName,
    x?.publisherName,
    x?.displayName,
  ];

  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }

  return undefined;
}

function normalizeMetaValue(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed ? trimmed : null;
}

function pushUnique(out: string[], value?: string | null) {
  if (!value) return;
  if (!out.includes(value)) out.push(value);
}

function deriveMathMeta(d: unknown): string[] {
  const x = d as Record<string, unknown> | null;

  const values = [
    x?.lessonType,
    x?.lesson_type,
    x?.textType,
    x?.texttype,
    x?.type,
    x?.category,
    x?.mathType,
    x?.contentType,
  ]
    .map((v) => (typeof v === "string" ? v.toLowerCase() : ""))
    .filter(Boolean);

  const joined = values.join(" | ");
  const out: string[] = [];

  if (
    joined.includes("math_generator") ||
    joined.includes("math-generator") ||
    joined.includes("math_worksheet") ||
    joined.includes("math_geometry") ||
    joined.includes("geometry_worksheet")
  ) {
    out.push("math");
  }

  if (
    joined.includes("geometry") ||
    joined.includes("geometri") ||
    joined.includes("geometry_worksheet") ||
    joined.includes("math_geometry")
  ) {
    out.push("geometry");
  }

  if (joined.includes("algebra")) out.push("algebra");
  if (
    joined.includes("fractions") ||
    joined.includes("fraction_worksheet") ||
    !!x?.fractionWorksheet
  ) {
    out.push("fractions");
  }
  if (joined.includes("percent")) out.push("percent");
  if (joined.includes("equations")) out.push("equations");
  if (joined.includes("measurement")) out.push("measurement");

  return out;
}

function safeMeta(d: unknown): string[] {
  const x = d as Record<string, unknown> | null;
  const out: string[] = [];

  const level = normalizeMetaValue(x?.level ?? x?.cefr ?? x?.difficulty);
  const textType = normalizeMetaValue(x?.textType);
  const texttype = normalizeMetaValue(x?.texttype);
  const typeValue = normalizeMetaValue(x?.type);
  const lang = normalizeMetaValue(x?.language ?? x?.lang);
  const lessonType = normalizeMetaValue(x?.lessonType ?? x?.lesson_type);
  const mathType = normalizeMetaValue(x?.mathType);
  const contentType = normalizeMetaValue(x?.contentType);

  pushUnique(out, level);
  pushUnique(out, textType);
  pushUnique(out, texttype);
  for (const term of getTextTypeSearchTerms(textType)) pushUnique(out, term);
  for (const term of getTextTypeSearchTerms(texttype)) pushUnique(out, term);
  pushUnique(out, typeValue);
  pushUnique(out, lang);
  pushUnique(out, lessonType);
  pushUnique(out, mathType);
  pushUnique(out, contentType);

  for (const tag of deriveMathMeta(d)) {
    pushUnique(out, tag);
  }

  return out;
}

function pickVisibility(d: unknown): PublishVisibility | undefined {
  const x = d as Record<string, unknown> | null;
  const pub = x?.publish as Record<string, unknown> | undefined;
  const v = pub?.visibility;
  return v === "public" || v === "unlisted" || v === "private" ? v : undefined;
}

function pickPublishVisibility(d: unknown): PublishVisibility | undefined {
  const x = d as Record<string, unknown> | null;
  const v = x?.publishVisibility;
  return v === "public" || v === "unlisted" || v === "private" ? v : undefined;
}

function pickShowInLibrary(d: unknown): boolean | undefined {
  const x = d as Record<string, unknown> | null;
  return typeof x?.showInLibrary === "boolean" ? x.showInLibrary : undefined;
}

function withLocale(locale: string, path: string) {
  const loc = (locale || "no").replace(/^\//, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `/${loc}${p}`;
}

function hrefForLesson(locale: string, mode: AppMode, lessonId: string, lessonType?: string) {
  const normalizedLessonType = String(lessonType || "").trim().toLowerCase();

  if (normalizedLessonType === "reading_test") {
    return withLocale(locale, `/student/lesson/${lessonId}`);
  }

  if (mode === "teacher" || mode === "creator") {
    if (normalizedLessonType === "image_writing") {
      return withLocale(locale, `/producer/image-writing?edit=${lessonId}`);
    }
    if (normalizedLessonType === "quiz") {
      return withLocale(locale, `/producer/quiz/${lessonId}`);
    }
    return withLocale(locale, `/producer/${lessonId}`);
  }

  return withLocale(locale, `/student/lesson/${lessonId}`);
}

function hrefForSpace(locale: string, mode: AppMode, spaceId: string) {
  if (mode === "student") return withLocale(locale, `/student/spaces/${spaceId}`);
  return withLocale(locale, `/teacher/spaces/${spaceId}`);
}

async function fetchMyLessons(db: Firestore, uid: string, mode: AppMode, locale: string) {
  const results: ContentItem[] = [];

  try {
    const qy = query(
      collection(db, "lessons"),
      where("ownerId", "==", uid),
      orderBy("updatedAt", "desc"),
      limit(MY_CONTENT_QUERY_LIMIT)
    );
    const snap = await getDocs(qy);

    snap.forEach((docSnap) => {
      const d = docSnap.data() as Record<string, unknown>;
      const lessonType = pickLessonType(d);

      results.push({
        type: "lesson",
        id: docSnap.id,
        title: pickTitle(d) || "Lesson",
        status: pickStatus(d),
        updatedAt: pickUpdated(d),
        href: hrefForLesson(locale, mode, docSnap.id, lessonType),
        meta: safeMeta(d),
        ownerId: typeof d.ownerId === "string" ? d.ownerId : undefined,
        activePublishedId: typeof d.activePublishedId === "string" ? d.activePublishedId : null,
        visibility: pickVisibility(d),
        publishVisibility: pickPublishVisibility(d),
        showInLibrary: pickShowInLibrary(d),
        lessonType,
        textType: pickTextType(d),
        texttype: pickTexttype(d),
        mathType: pickMathType(d),
        contentType: pickContentType(d),
        language: pickLanguage(d),
        level: pickLevel(d) || undefined,
        authorName: pickAuthorName(d),
        source: typeof d.source === "string" ? d.source : undefined,
        sourcePublishedQuizId: typeof d.sourcePublishedQuizId === "string" ? d.sourcePublishedQuizId : undefined,
        deletedAt: toDateSafe(d.deletedAt),
      });
    });
  } catch {
    // ignore
  }

  return results;
}

type LessonMeta = {
  title: string;
  id: string;
  ownerId?: string;
  lessonId?: string;
  publishedId?: string;
  activePublishedId?: string | null;
  status?: string;
  level?: string;
  language?: string;
  lessonType?: string;
  textType?: string;
  texttype?: string;
  meta?: string[];
  authorName?: string;
  source?: string;
  sourcePublishedQuizId?: string;
};

async function fetchLessonMetaByIds(db: Firestore, ids: string[]) {
  const metaById = new Map<string, LessonMeta>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const chunkSize = 10;

  const fetchFrom = async (colName: "lessons" | "published_lessons", chunk: string[]) => {
    try {
      const qy = query(collection(db, colName), where(documentId(), "in", chunk));
      const snap = await getDocs(qy);

      snap.forEach((docSnap) => {
        const d = docSnap.data() as Record<string, unknown>;
        const title = pickTitle(d);
        const activePublishedId =
          typeof d.activePublishedId === "string" && d.activePublishedId.trim()
            ? d.activePublishedId.trim()
            : null;
        const linkedLessonId =
          typeof d.lessonId === "string" && d.lessonId.trim()
            ? d.lessonId.trim()
            : docSnap.id;
        const linkedPublishedId =
          typeof d.publishedId === "string" && d.publishedId.trim()
            ? d.publishedId.trim()
            : typeof d.publishedLessonId === "string" && d.publishedLessonId.trim()
              ? d.publishedLessonId.trim()
              : activePublishedId || docSnap.id;
        const publishObj = d.publish && typeof d.publish === "object"
          ? (d.publish as Record<string, unknown>)
          : {};
        const rawStatus = pickStatus(d);
        const status =
          rawStatus === "published" ||
            publishObj.state === "published" ||
            activePublishedId ||
            (colName === "published_lessons" && d.isActive !== false)
            ? "published"
            : rawStatus;

        metaById.set(docSnap.id, {
          title: title || "",
          id: docSnap.id,
          ownerId: typeof d.ownerId === "string" ? d.ownerId : undefined,
          lessonId: linkedLessonId,
          publishedId: linkedPublishedId,
          activePublishedId,
          status,
          level: pickLevel(d) || undefined,
          language: pickLanguage(d),
          lessonType: pickLessonType(d),
          textType: pickTextType(d),
          texttype: pickTexttype(d),
          meta: safeMeta(d),
          authorName: pickAuthorName(d),
          source: typeof d.source === "string" ? d.source : undefined,
          sourcePublishedQuizId: typeof d.sourcePublishedQuizId === "string" ? d.sourcePublishedQuizId : undefined,
        });
      });
    } catch {
      // ignore
    }
  };

  for (let i = 0; i < unique.length; i += chunkSize) {
    await fetchFrom("lessons", unique.slice(i, i + chunkSize));
  }

  const missing = unique.filter((id) => !metaById.has(id));

  for (let i = 0; i < missing.length; i += chunkSize) {
    await fetchFrom("published_lessons", missing.slice(i, i + chunkSize));
  }

  return metaById;
}

async function fetchMyWritingActivities(db: Firestore, uid: string, locale: string) {
  const results: ContentItem[] = [];

  try {
    const qy = query(
      collection(db, "writingActivities"),
      where("ownerUid", "==", uid),
      orderBy("updatedAt", "desc"),
      limit(MY_CONTENT_QUERY_LIMIT)
    );
    const snap = await getDocs(qy);

    snap.forEach((docSnap) => {
      const d = docSnap.data() as Record<string, unknown>;
      const aiPolicy = d.aiPolicy && typeof d.aiPolicy === "object" ? d.aiPolicy as Record<string, unknown> : {};
      const level = pickLevel(d) || undefined;
      const language = pickLanguage(d);
      const theme = typeof d.theme === "string" ? d.theme.trim() : "";
      const genre = typeof d.genre === "string" ? d.genre.trim() : "story";
      const targetWordCount = typeof d.targetWordCount === "number" ? d.targetWordCount : undefined;
      const wordCountMeta = targetWordCount ? `${targetWordCount} ord` : "";
      const meta = ["Tekst", genre, level, language, theme, wordCountMeta].filter((v): v is string => typeof v === "string" && v.trim().length > 0);

      results.push({
        type: "writingActivity",
        id: docSnap.id,
        title: pickTitle(d) || "Skriveaktivitet",
        status: pickStatus(d),
        updatedAt: pickUpdated(d),
        href: withLocale(locale, `/producer/text/new`),
        meta,
        ownerUid: typeof d.ownerUid === "string" ? d.ownerUid : undefined,
        level,
        language,
        theme: theme || null,
        genre,
        aiEnabled: aiPolicy.enabled !== false,
        aiMaxUsesTotal: typeof aiPolicy.maxUsesTotal === "number" ? aiPolicy.maxUsesTotal : undefined,
        targetWordCount,
        deletedAt: toDateSafe(d.deletedAt),
      });
    });
  } catch {
    // ignore
  }

  return results;
}

function ownLessonItemFromSubmission(args: {
  uid: string;
  locale: string;
  mode: AppMode;
  lessonMeta?: LessonMeta;
  fallbackLessonId?: string;
  updatedAt: Date | null;
}): ContentItem | null {
  const { uid, locale, mode, lessonMeta, fallbackLessonId, updatedAt } = args;
  if (!lessonMeta || lessonMeta.ownerId !== uid) return null;

  const draftLessonId = lessonMeta.lessonId || fallbackLessonId || lessonMeta.id;
  if (!draftLessonId) return null;

  const publishedId =
    lessonMeta.activePublishedId ||
    (lessonMeta.publishedId && lessonMeta.publishedId !== draftLessonId
      ? lessonMeta.publishedId
      : lessonMeta.id && lessonMeta.id !== draftLessonId
        ? lessonMeta.id
        : null);

  const meta: string[] = ["own_generated"];
  if (lessonMeta.level) meta.push(String(lessonMeta.level));
  if (lessonMeta.language) meta.push(String(lessonMeta.language));
  if (lessonMeta.lessonType) meta.push(String(lessonMeta.lessonType));
  if (lessonMeta.textType) meta.push(normalizeTextTypeValue(lessonMeta.textType));
  if (lessonMeta.texttype) meta.push(normalizeTextTypeValue(lessonMeta.texttype));
  for (const term of getTextTypeSearchTerms(lessonMeta.textType)) {
    if (!meta.includes(term)) meta.push(term);
  }
  for (const term of getTextTypeSearchTerms(lessonMeta.texttype)) {
    if (!meta.includes(term)) meta.push(term);
  }
  if (publishedId) meta.push(`published:${publishedId}`);
  if (lessonMeta.meta?.length) {
    for (const tag of lessonMeta.meta) {
      if (!meta.includes(tag)) meta.push(tag);
    }
  }

  return {
    type: "lesson",
    id: draftLessonId,
    title: lessonMeta.title || "Lesson",
    status: publishedId || lessonMeta.status === "published" ? "published" : (lessonMeta.status || "draft"),
    updatedAt,
    href: hrefForLesson(locale, mode, draftLessonId, lessonMeta.lessonType),
    meta,
    ownerId: uid,
    activePublishedId: publishedId,
    lessonType: lessonMeta.lessonType,
    textType: lessonMeta.textType,
    texttype: lessonMeta.texttype,
    language: lessonMeta.language,
    level: lessonMeta.level,
    authorName: lessonMeta.authorName,
    source: lessonMeta.source,
    sourcePublishedQuizId: lessonMeta.sourcePublishedQuizId,
  };
}

async function fetchMySubmissions(db: Firestore, uid: string, mode: AppMode, locale: string) {
  const results: ContentItem[] = [];

  try {
    const qy = query(
      collection(db, "submissions"),
      where("uid", "==", uid),
      orderBy("updatedAt", "desc"),
      limit(MY_CONTENT_QUERY_LIMIT)
    );
    const snap = await getDocs(qy);

    const submissionRows: Array<{
      id: string;
      d: Record<string, unknown>;
      lessonId?: string;
      spaceId?: string;
    }> = [];

    const lessonIds: string[] = [];

    snap.forEach((docSnap) => {
      const d = docSnap.data() as Record<string, unknown>;
      if (isArchived(d)) return;

      const lessonId =
        typeof d.lessonId === "string"
          ? d.lessonId
          : typeof d.publishedLessonId === "string"
            ? d.publishedLessonId
            : undefined;

      const spaceId = typeof d.spaceId === "string" ? d.spaceId : undefined;

      if (lessonId) lessonIds.push(lessonId);
      submissionRows.push({ id: docSnap.id, d, lessonId, spaceId });
    });

    const lessonMetaById = await fetchLessonMetaByIds(db, lessonIds);

    for (const row of submissionRows) {
      const { id, d, lessonId, spaceId } = row;
      const rawTitle = pickTitle(d);
      const lessonMeta = lessonId ? lessonMetaById.get(lessonId) : undefined;
      const updatedAt = pickUpdated(d);

      const ownLessonItem = ownLessonItemFromSubmission({
        uid,
        locale,
        mode,
        lessonMeta,
        fallbackLessonId: lessonId,
        updatedAt,
      });

      if (ownLessonItem) {
        results.push(ownLessonItem);
        continue;
      }

      const title =
        rawTitle && rawTitle.toLowerCase() !== "untitled"
          ? rawTitle
          : lessonMeta?.title
            ? `Submission · ${lessonMeta.title}`
            : "Submission";

      const status = pickStatus(d) || ((d as { reviewedAt?: unknown }).reviewedAt ? "reviewed" : "submitted");

      const fallbackHref = lessonId
        ? hrefForLesson(locale, mode, lessonId, lessonMeta?.lessonType)
        : withLocale(locale, `/student/results`);

      const meta: string[] = [];
      const kind = typeof d.kind === "string" ? d.kind : "";
      const source = typeof d.source === "string" ? d.source : "";

      if (kind === "practice" || source === "library") meta.push("practice");
      if (lessonMeta?.level) meta.push(String(lessonMeta.level));
      if (lessonMeta?.language) meta.push(String(lessonMeta.language));
      if (lessonMeta?.lessonType) meta.push(String(lessonMeta.lessonType));
      if (lessonMeta?.textType) meta.push(normalizeTextTypeValue(lessonMeta.textType));
      if (lessonMeta?.texttype) meta.push(normalizeTextTypeValue(lessonMeta.texttype));
      for (const term of getTextTypeSearchTerms(lessonMeta?.textType)) {
        if (!meta.includes(term)) meta.push(term);
      }
      for (const term of getTextTypeSearchTerms(lessonMeta?.texttype)) {
        if (!meta.includes(term)) meta.push(term);
      }

      if (lessonMeta?.meta?.length) {
        for (const tag of lessonMeta.meta) {
          if (!meta.includes(tag)) meta.push(tag);
        }
      }

      if (lessonMeta?.title) meta.push(`Lesson: ${lessonMeta.title}`);
      if (spaceId) meta.push(`space:${spaceId}`);
      if (lessonId) meta.push(`lesson:${lessonId}`);

      results.push({
        type: "submission",
        id,
        title,
        status,
        updatedAt,
        href: mode === "student" ? withLocale(locale, `/student/submissions/${id}`) : fallbackHref,
        meta,
        uid: typeof d.uid === "string" ? d.uid : null,
        lessonId,
        spaceId,
        authorName: lessonMeta?.authorName,
        deletedAt: toDateSafe(d.deletedAt),
      });
    }
  } catch {
    // ignore
  }

  return results;
}

async function fetchMyPracticeSubmissions(db: Firestore, uid: string, mode: AppMode, locale: string) {
  const results: ContentItem[] = [];

  try {
    const qy = query(
      collection(db, "practiceSubmissions"),
      where("uid", "==", uid),
      orderBy("updatedAt", "desc"),
      limit(MY_CONTENT_QUERY_LIMIT)
    );
    const snap = await getDocs(qy);

    const rows: Array<{ id: string; d: Record<string, unknown>; lessonId?: string }> = [];
    const lessonIds: string[] = [];

    snap.forEach((docSnap) => {
      const d = docSnap.data() as Record<string, unknown>;
      if (isArchived(d)) return;

      const lessonId =
        typeof d.publishedLessonId === "string"
          ? d.publishedLessonId
          : typeof d.lessonId === "string"
            ? d.lessonId
            : undefined;

      if (lessonId) lessonIds.push(lessonId);
      rows.push({ id: docSnap.id, d, lessonId });
    });

    const metaByLessonId = await fetchLessonMetaByIds(db, lessonIds);

    for (const row of rows) {
      const { id, d, lessonId } = row;
      const lessonMeta = lessonId ? metaByLessonId.get(lessonId) : undefined;
      const updatedAt = pickUpdated(d);

      const ownLessonItem = ownLessonItemFromSubmission({
        uid,
        locale,
        mode,
        lessonMeta,
        fallbackLessonId: lessonId,
        updatedAt,
      });

      if (ownLessonItem) {
        results.push(ownLessonItem);
        continue;
      }

      const title =
        typeof d.title === "string" && d.title.trim()
          ? d.title.trim()
          : lessonMeta?.title
            ? lessonMeta.title
            : "Draft";

      const status = typeof d.status === "string" ? d.status : "draft";
      const href = lessonId ? withLocale(locale, `/student/lesson/${lessonId}`) : withLocale(locale, `/content`);

      const meta: string[] = ["practice"];
      if (lessonMeta?.level) meta.push(String(lessonMeta.level));
      if (lessonMeta?.language) meta.push(String(lessonMeta.language));
      if (lessonMeta?.lessonType) meta.push(String(lessonMeta.lessonType));
      if (lessonMeta?.textType) meta.push(normalizeTextTypeValue(lessonMeta.textType));
      if (lessonMeta?.texttype) meta.push(normalizeTextTypeValue(lessonMeta.texttype));
      for (const term of getTextTypeSearchTerms(lessonMeta?.textType)) {
        if (!meta.includes(term)) meta.push(term);
      }
      for (const term of getTextTypeSearchTerms(lessonMeta?.texttype)) {
        if (!meta.includes(term)) meta.push(term);
      }

      if (lessonMeta?.meta?.length) {
        for (const tag of lessonMeta.meta) {
          if (!meta.includes(tag)) meta.push(tag);
        }
      }

      if (lessonMeta?.title) meta.push(`Lesson: ${lessonMeta.title}`);
      if (lessonId) meta.push(`lesson:${lessonId}`);

      results.push({
        type: "submission",
        id,
        title,
        status,
        updatedAt,
        href,
        meta,
        uid,
        lessonId,
        spaceId: undefined,
        hasAnswers: hasSavedAnswers(d),
        authorName: lessonMeta?.authorName,
        deletedAt: toDateSafe(d.deletedAt),
      });
    }
  } catch {
    // ignore
  }

  return results;
}

async function fetchMySpaceSubmissions(db: Firestore, uid: string, locale: string, warnings: string[]) {
  const results: ContentItem[] = [];

  try {
    const qy = query(
      collection(db, "spaceSubmissions"),
      where("uid", "==", uid),
      orderBy("updatedAt", "desc"),
      limit(MY_SPACE_QUERY_LIMIT)
    );

    const snap = await getDocs(qy);

    snap.forEach((docSnap) => {
      const d = docSnap.data() as Record<string, unknown>;
      if (isArchived(d)) return;

      const spaceId = typeof d.spaceId === "string" ? d.spaceId : "";
      const assignmentId = typeof d.assignmentId === "string" ? d.assignmentId : "";
      const title = pickTitle(d) || "Submission";
      const status = pickStatus(d) || "submitted";

      if (!spaceId || !assignmentId) return;

      const href = withLocale(
        locale,
        `/student/spaces/${spaceId}/assignments/${assignmentId}?sid=${encodeURIComponent(docSnap.id)}`
      );

      const meta: string[] = ["space"];
      meta.push(`space:${spaceId}`);
      meta.push(`lesson:${assignmentId}`);

      for (const tag of safeMeta(d)) {
        if (!meta.includes(tag)) meta.push(tag);
      }

      results.push({
        type: "submission",
        id: docSnap.id,
        title,
        status,
        updatedAt: pickUpdated(d),
        href,
        meta,
        uid,
        lessonId: assignmentId,
        assignmentId,
        spaceId,
        deletedAt: toDateSafe(d.deletedAt),
      });
    });
  } catch (e: unknown) {
    const msg =
      e instanceof Error
        ? e.message
        : "Query mot spaceSubmissions feilet (mulig manglende indeks).";
    warnings.push(msg);
  }

  return results;
}

async function fetchSpacesByIds(db: Firestore, spaceIds: string[], mode: AppMode, locale: string) {
  const results: ContentItem[] = [];
  const unique = Array.from(new Set(spaceIds.filter(Boolean)));

  const readJoinCode = (d: Record<string, unknown>) => {
    if (typeof d.joinCode === "string") return d.joinCode;
    if (typeof d.code === "string") return d.code;
    const join = d.join;
    if (join && typeof join === "object" && typeof (join as Record<string, unknown>).code === "string") {
      return String((join as Record<string, unknown>).code);
    }
    return undefined;
  };

  const pickOwnerUidLoose = (d: Record<string, unknown>): string | undefined => {
    const a = d.ownerUid;
    const b = d.ownerId;
    const c = d.createdBy;
    if (typeof a === "string" && a) return a;
    if (typeof b === "string" && b) return b;
    if (typeof c === "string" && c) return c;
    return undefined;
  };

  const chunkSize = 10;

  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);

    try {
      const qy = query(collection(db, "spaces"), where(documentId(), "in", chunk));
      const snap = await getDocs(qy);

      snap.forEach((docSnap) => {
        const d = docSnap.data() as Record<string, unknown>;

        results.push({
          type: "space",
          id: docSnap.id,
          title: pickTitle(d) || "Space",
          status: pickStatus(d),
          updatedAt: pickUpdated(d),
          href: hrefForSpace(locale, mode, docSnap.id),
          meta: [],
          ownerUid: pickOwnerUidLoose(d),
          joinCode: readJoinCode(d),
          deletedAt: toDateSafe(d.deletedAt),
        });
      });
    } catch {
      // ignore
    }
  }

  return results;
}

async function fetchMySpaces(db: Firestore, uid: string, mode: AppMode, locale: string) {
  const results: ContentItem[] = [];

  const readJoinCode = (d: Record<string, unknown>) => {
    if (typeof d.joinCode === "string") return d.joinCode;
    if (typeof d.code === "string") return d.code;
    const join = d.join;
    if (join && typeof join === "object" && typeof (join as Record<string, unknown>).code === "string") {
      return String((join as Record<string, unknown>).code);
    }
    return undefined;
  };

  const pickOwnerUidLoose = (d: Record<string, unknown>): string | undefined => {
    const a = d.ownerUid;
    const b = d.ownerId;
    const c = d.createdBy;
    const c2 = d.createdAtBy;
    if (typeof a === "string" && a) return a;
    if (typeof b === "string" && b) return b;
    if (typeof c === "string" && c) return c;
    if (typeof c2 === "string" && c2) return c2;
    return undefined;
  };

  const pushDoc = (docSnap: { id: string; data: () => Record<string, unknown> }) => {
    const d = docSnap.data();

    results.push({
      type: "space",
      id: docSnap.id,
      title: pickTitle(d) || "Space",
      status: pickStatus(d),
      updatedAt: pickUpdated(d),
      href: hrefForSpace(locale, mode, docSnap.id),
      meta: [],
      ownerUid: pickOwnerUidLoose(d),
      joinCode: readJoinCode(d),
      deletedAt: toDateSafe(d.deletedAt),
    });
  };

  async function runSpaceQuery(field: string) {
    try {
      const qy = query(
        collection(db, "spaces"),
        where(field, "==", uid),
        orderBy("updatedAt", "desc"),
        limit(80)
      );
      const snap = await getDocs(qy);
      snap.forEach((s) => pushDoc(s as unknown as { id: string; data: () => Record<string, unknown> }));
      return;
    } catch {
      // ignore
    }

    try {
      const qy2 = query(collection(db, "spaces"), where(field, "==", uid), limit(200));
      const snap2 = await getDocs(qy2);
      snap2.forEach((s) => pushDoc(s as unknown as { id: string; data: () => Record<string, unknown> }));
    } catch {
      // ignore
    }
  }

  await runSpaceQuery("ownerUid");
  await runSpaceQuery("ownerId");
  await runSpaceQuery("createdBy");
  await runSpaceQuery("createdAtBy");

  try {
    const qy = query(collection(db, "spaceMembers"), where("uid", "==", uid), limit(400));
    const snap = await getDocs(qy);

    const spaceIds: string[] = [];

    snap.forEach((docSnap) => {
      const d = docSnap.data() as Record<string, unknown>;
      const sid = typeof d.spaceId === "string" ? d.spaceId : "";
      if (sid) spaceIds.push(sid);
    });

    const memberSpaces = await fetchSpacesByIds(db, spaceIds, mode, locale);
    results.push(...memberSpaces);
  } catch {
    // ignore
  }

  const seen = new Set<string>();

  const deduped = results.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });

  deduped.sort((a, b) => {
    const ta = a.updatedAt ? a.updatedAt.getTime() : 0;
    const tb = b.updatedAt ? b.updatedAt.getTime() : 0;
    return tb - ta;
  });

  return deduped;
}

export async function loadMyContent(opts: {
  db: Firestore;
  mode: AppMode;
  uid?: string | null;
  isAnon?: boolean;
  locale?: string;
}) {
  const { db, mode, uid, isAnon, locale = "no" } = opts;

  if (!uid || isAnon) {
    return {
      items: [] as ContentItem[],
      notes: ["Gjestemodus: Innhold lagres lokalt (kommer). Logg inn for å synkronisere."],
      warnings: [] as string[],
    };
  }

  const warnings: string[] = [];

  const [lessons, writingActivities, submissions, practiceSubs, spaceSubs, spaces] = await Promise.all([
    fetchMyLessons(db, uid, mode, locale),
    mode === "teacher" || mode === "creator" ? fetchMyWritingActivities(db, uid, locale) : Promise.resolve([] as ContentItem[]),
    fetchMySubmissions(db, uid, mode, locale),
    fetchMyPracticeSubmissions(db, uid, mode, locale),
    mode === "student" ? fetchMySpaceSubmissions(db, uid, locale, warnings) : Promise.resolve([] as ContentItem[]),
    fetchMySpaces(db, uid, mode, locale),
  ]);

  const seen = new Set<string>();

  const merged = [...lessons, ...writingActivities, ...submissions, ...practiceSubs, ...spaceSubs, ...spaces].filter((it) => {
    const k = `${it.type}:${it.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const items = merged.sort((a, b) => {
    const ta = a.updatedAt ? a.updatedAt.getTime() : 0;
    const tb = b.updatedAt ? b.updatedAt.getTime() : 0;
    return tb - ta;
  });

  if (items.length === 0) {
    warnings.push(
      "Fant ingen dokumenter i feeden ennå. Hvis dette er uventet: sjekk at du er innlogget (ikke anon), og at spaceSubmissions finnes."
    );
  }

  return { items, notes: [] as string[], warnings };
}
