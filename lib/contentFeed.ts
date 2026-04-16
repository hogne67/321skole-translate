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
    language?: string;
    level?: string;
    authorName?: string;
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
  };

function toDateSafe(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Timestamp) return v.toDate();

  if (typeof v === "object" && v !== null) {
    const anyV = v as { seconds?: unknown; nanoseconds?: unknown };
    if (typeof anyV.seconds === "number") {
      const ns = typeof anyV.nanoseconds === "number" ? anyV.nanoseconds : 0;
      return new Timestamp(anyV.seconds, ns).toDate();
    }
  }

  if (v instanceof Date) return v;
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
    toDateSafe(x?.modifiedAt) ||
    toDateSafe(x?.lastEditedAt) ||
    toDateSafe(x?.createdAt) ||
    null
  );
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
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function pickTexttype(d: unknown): string | undefined {
  const x = d as Record<string, unknown> | null;
  const v = x?.texttype;
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
  ]
    .map((v) => (typeof v === "string" ? v.toLowerCase() : ""))
    .filter(Boolean);

  const joined = values.join(" | ");
  const out: string[] = [];

  if (
    joined.includes("math_generator") ||
    joined.includes("math-generator") ||
    joined.includes("math_worksheet") ||
    joined.includes("geometry_worksheet")
  ) {
    out.push("math");
  }

  if (joined.includes("geometry") || joined.includes("geometri") || joined.includes("geometry_worksheet")) {
    out.push("geometry");
  }

  if (joined.includes("algebra")) out.push("algebra");
  if (joined.includes("fractions")) out.push("fractions");
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

  pushUnique(out, level);
  pushUnique(out, textType);
  pushUnique(out, texttype);
  pushUnique(out, typeValue);
  pushUnique(out, lang);
  pushUnique(out, lessonType);

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

function hrefForLesson(
  locale: string,
  mode: AppMode,
  lessonId: string,
  lessonType?: string
) {
  const normalizedLessonType = String(lessonType || "").trim().toLowerCase();

  if (normalizedLessonType === "reading_test") {
    return withLocale(locale, `/reading-tests/${lessonId}`);
  }

  if (mode === "teacher" || mode === "creator") {
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
      limit(50)
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
        language: pickLanguage(d),
        level: pickLevel(d) || undefined,
        authorName: pickAuthorName(d),
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
  level?: string;
  language?: string;
  lessonType?: string;
  textType?: string;
  texttype?: string;
  meta?: string[];
  authorName?: string;
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
        const level = pickLevel(d) || undefined;
        const language = pickLanguage(d);
        const lessonType = pickLessonType(d);
        const textType = pickTextType(d);
        const texttype = pickTexttype(d);
        const meta = safeMeta(d);
        const authorName = pickAuthorName(d);

        metaById.set(docSnap.id, {
          title: title || "",
          level,
          language,
          lessonType,
          textType,
          texttype,
          meta,
          authorName,
        });
      });
    } catch {
      // ignore
    }
  };

  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    await fetchFrom("lessons", chunk);
  }

  const missing = unique.filter((id) => !metaById.has(id));

  for (let i = 0; i < missing.length; i += chunkSize) {
    const chunk = missing.slice(i, i + chunkSize);
    await fetchFrom("published_lessons", chunk);
  }

  return metaById;
}

async function fetchMySubmissions(db: Firestore, uid: string, mode: AppMode, locale: string) {
  const results: ContentItem[] = [];

  try {
    const qy = query(
      collection(db, "submissions"),
      where("uid", "==", uid),
      orderBy("updatedAt", "desc"),
      limit(50)
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

      const title =
        rawTitle && rawTitle.toLowerCase() !== "untitled"
          ? rawTitle
          : lessonMeta?.title
            ? `Submission · ${lessonMeta.title}`
            : "Submission";

      const status =
        pickStatus(d) ||
        ((d as { reviewedAt?: unknown }).reviewedAt ? "reviewed" : "submitted");

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
      if (lessonMeta?.textType) meta.push(String(lessonMeta.textType));
      if (lessonMeta?.texttype) meta.push(String(lessonMeta.texttype));
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
        updatedAt: pickUpdated(d),
        href: mode === "student" ? withLocale(locale, `/student/submissions/${id}`) : fallbackHref,
        meta,
        uid: typeof d.uid === "string" ? d.uid : null,
        lessonId,
        spaceId,
        authorName: lessonMeta?.authorName,
        deletedAt: toDateSafe((d as Record<string, unknown>).deletedAt),
      });
    }
  } catch {
    // ignore
  }

  return results;
}

async function fetchMyPracticeSubmissions(db: Firestore, uid: string, locale: string) {
  const results: ContentItem[] = [];

  try {
    const qy = query(
      collection(db, "practiceSubmissions"),
      where("uid", "==", uid),
      orderBy("updatedAt", "desc"),
      limit(80)
    );
    const snap = await getDocs(qy);

    const rows: Array<{ id: string; d: Record<string, unknown>; lessonId?: string }> = [];
    const lessonIds: string[] = [];

    snap.forEach((docSnap) => {
      const d = docSnap.data() as Record<string, unknown>;
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

      const title =
        typeof d.title === "string" && d.title.trim()
          ? d.title.trim()
          : lessonMeta?.title
            ? lessonMeta.title
            : "Draft";

      const status = typeof d.status === "string" ? d.status : "draft";
      const href = lessonId
        ? withLocale(locale, `/student/lesson/${lessonId}`)
        : withLocale(locale, `/content`);

      const meta: string[] = ["practice"];
      if (lessonMeta?.level) meta.push(String(lessonMeta.level));
      if (lessonMeta?.language) meta.push(String(lessonMeta.language));
      if (lessonMeta?.lessonType) meta.push(String(lessonMeta.lessonType));
      if (lessonMeta?.textType) meta.push(String(lessonMeta.textType));
      if (lessonMeta?.texttype) meta.push(String(lessonMeta.texttype));
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
        updatedAt: pickUpdated(d),
        href,
        meta,
        uid,
        lessonId,
        spaceId: undefined,
        authorName: lessonMeta?.authorName,
        deletedAt: toDateSafe(d.deletedAt),
      });
    }
  } catch {
    // ignore
  }

  return results;
}

async function fetchMySpaceSubmissions(
  db: Firestore,
  uid: string,
  locale: string,
  warnings: string[]
) {
  const results: ContentItem[] = [];

  try {
    const qy = query(
      collection(db, "spaceSubmissions"),
      where("uid", "==", uid),
      orderBy("updatedAt", "desc"),
      limit(80)
    );

    const snap = await getDocs(qy);

    snap.forEach((docSnap) => {
      const d = docSnap.data() as Record<string, unknown>;

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

  const [lessons, submissions, practiceSubs, spaceSubs, spaces] = await Promise.all([
    fetchMyLessons(db, uid, mode, locale),
    fetchMySubmissions(db, uid, mode, locale),
    fetchMyPracticeSubmissions(db, uid, locale),
    mode === "student" ? fetchMySpaceSubmissions(db, uid, locale, warnings) : Promise.resolve([] as ContentItem[]),
    fetchMySpaces(db, uid, mode, locale),
  ]);

  const seen = new Set<string>();
  const merged = [...lessons, ...submissions, ...practiceSubs, ...spaceSubs, ...spaces].filter((it) => {
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