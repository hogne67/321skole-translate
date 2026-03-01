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

      // For space-submissions index
      assignmentId?: string;

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

function safeMeta(d: unknown): string[] {
  const x = d as Record<string, unknown> | null;
  const out: string[] = [];

  const level = x?.level || x?.cefr || x?.difficulty;
  const textType = x?.textType || x?.texttype || x?.type;
  const lang = x?.language || x?.lang;

  if (level) out.push(String(level));
  if (textType) out.push(String(textType));
  if (lang) out.push(String(lang));

  return out;
}

function pickVisibility(d: unknown): PublishVisibility | undefined {
  const x = d as Record<string, unknown> | null;
  const pub = x?.publish as Record<string, unknown> | undefined;
  const v = pub?.visibility;
  return v === "public" || v === "unlisted" || v === "private" ? v : undefined;
}

function withLocale(locale: string, path: string) {
  const loc = (locale || "no").replace(/^\//, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `/${loc}${p}`;
}

function hrefForLesson(locale: string, mode: AppMode, lessonId: string) {
  if (mode === "teacher" || mode === "creator") return withLocale(locale, `/producer/${lessonId}`);
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
      results.push({
        type: "lesson",
        id: docSnap.id,
        title: pickTitle(d) || "Lesson",
        status: pickStatus(d),
        updatedAt: pickUpdated(d),
        href: hrefForLesson(locale, mode, docSnap.id),
        meta: safeMeta(d),

        ownerId: typeof d.ownerId === "string" ? d.ownerId : undefined,
        activePublishedId: typeof d.activePublishedId === "string" ? d.activePublishedId : null,
        visibility: pickVisibility(d),

        deletedAt: toDateSafe(d.deletedAt),
      });
    });
  } catch {
    // ignore
  }
  return results;
}

/**
 * Hent lesson-meta (tittel + level) i batch.
 * ✅ Viktig: bibliotekoppgaver lever i `published_lessons`, mens egne oppgaver lever i `lessons`.
 * Vi prøver `lessons` først, og slår deretter opp manglende IDs i `published_lessons`.
 */
type LessonMeta = { title: string; level?: string };

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
        if (title) metaById.set(docSnap.id, { title, level });
        else if (level) metaById.set(docSnap.id, { title: "", level }); // sjeldent, men ok
      });
    } catch {
      // ignore
    }
  };

  // 1) lessons
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    await fetchFrom("lessons", chunk);
  }

  // 2) published_lessons for de som mangler
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

      const status = pickStatus(d) || ((d as { reviewedAt?: unknown }).reviewedAt ? "reviewed" : "submitted");

      const fallbackHref = lessonId ? hrefForLesson(locale, mode, lessonId) : withLocale(locale, `/student/results`);

      const meta: string[] = [];
      if (lessonMeta?.level) meta.push(String(lessonMeta.level));
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

        deletedAt: toDateSafe((d as Record<string, unknown>).deletedAt),
      });
    }
  } catch {
    // ignore
  }

  return results;
}

/**
 * ✅ practiceSubmissions for student (draft/submitted feedback-flow).
 * FIX: Tittel/level ligger ofte i `published_lessons`, ikke i `lessons`.
 * Nå slår vi opp i begge og viser riktig tittel på kortet (ikke bare "Draft").
 */
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

      // ✅ Vis oppgavetittel som korttittel (bibliotek), ikke "Draft"
      const title = lessonMeta?.title ? lessonMeta.title : "Draft";

      const status = typeof d.status === "string" ? d.status : "draft";

      // NB: her åpner vi selve lesson-siden (published lessonId)
      const href = lessonId ? withLocale(locale, `/student/lesson/${lessonId}`) : withLocale(locale, `/content`);

      const meta: string[] = ["practice"];
      if (lessonMeta?.level) meta.push(String(lessonMeta.level));
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
        deletedAt: toDateSafe(d.deletedAt),
      });
    }
  } catch {
    // ignore
  }

  return results;
}

/**
 * ✅ NYTT: Space submissions (index collection `spaceSubmissions`)
 */
async function fetchMySpaceSubmissions(db: Firestore, uid: string, locale: string, warnings: string[]) {
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

/**
 * ✅ FIX: Nye rom vises ikke i My Content.
 * Årsak: rom kan være lagret med ownerId (ikke ownerUid) + updatedAt kan mangle.
 * Løsning:
 * - prøv flere feltvarianter (ownerUid/ownerId/createdBy/createdAtBy)
 * - fall back uten orderBy hvis query feiler (f.eks. manglende updatedAt)
 * - dedupe og sortér i JS til slutt
 */
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
    // 1) prøv med orderBy(updatedAt)
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
      // ignore -> fall back
    }

    // 2) fallback: uten orderBy (robust når updatedAt mangler)
    try {
      const qy2 = query(
        collection(db, "spaces"),
        where(field, "==", uid),
        limit(200)
      );
      const snap2 = await getDocs(qy2);
      snap2.forEach((s) => pushDoc(s as unknown as { id: string; data: () => Record<string, unknown> }));
    } catch {
      // ignore
    }
  }

  // ✅ prøv flere feltvarianter
  await runSpaceQuery("ownerUid");
  await runSpaceQuery("ownerId");
  await runSpaceQuery("createdBy");
  await runSpaceQuery("createdAtBy");

  // medlemskap via spaceMembers (toppkolleksjon)
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

  // ✅ dedupe på space-id (samme rom kan komme fra flere queries)
  const seen = new Set<string>();
  const deduped = results.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });

  // sort i JS (robust)
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
    mode === "student" ? fetchMyPracticeSubmissions(db, uid, locale) : Promise.resolve([] as ContentItem[]),
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