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

// ✅ Returnerer "" hvis ingenting finnes (ikke "Untitled").
// Det gjør at vi kan legge bedre fallback i feed/UI.
function pickTitle(d: unknown): string {
  const x = d as Record<string, unknown> | null;

  const candidates = [
    x?.title,
    x?.name,
    x?.lessonTitle,
    x?.spaceName,
    x?.topic,
  ];

  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }

  return "";
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

function hrefForLesson(mode: AppMode, lessonId: string) {
  if (mode === "teacher") return `/teacher/lessons/${lessonId}`;
  if (mode === "creator") return `/producer/texts/${lessonId}`;
  // ✅ du ønsker open til student/lesson
  return `/student/lesson/${lessonId}`;
}

async function fetchMyLessons(db: Firestore, uid: string, mode: AppMode) {
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
        href: hrefForLesson(mode, docSnap.id),
        meta: safeMeta(d),

        ownerId: typeof d.ownerId === "string" ? d.ownerId : undefined,
        activePublishedId: typeof d.activePublishedId === "string" ? d.activePublishedId : null,
        visibility: pickVisibility(d),
      });
    });
  } catch {
    // ignore
  }
  return results;
}

// Hent lesson-titler i batch (documentId in <=10)
async function fetchLessonTitlesByIds(db: Firestore, ids: string[]) {
  const map = new Map<string, string>();
  const unique = Array.from(new Set(ids.filter(Boolean)));

  const chunkSize = 10;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    try {
      const qy = query(collection(db, "lessons"), where(documentId(), "in", chunk));
      const snap = await getDocs(qy);
      snap.forEach((docSnap) => {
        const d = docSnap.data() as Record<string, unknown>;
        const t = pickTitle(d);
        if (t) map.set(docSnap.id, t);
      });
    } catch {
      // ignore (rules/index/permissions etc)
    }
  }

  return map;
}

async function fetchMySubmissions(db: Firestore, uid: string, mode: AppMode) {
  const results: ContentItem[] = [];

  try {
    const qy = query(
      collection(db, "submissions"),
      where("uid", "==", uid),
      orderBy("updatedAt", "desc"),
      limit(50)
    );
    const snap = await getDocs(qy);

    // Først: plukk lessonId’er så vi kan slå opp titler
    const submissionRows: Array<{
      id: string;
      d: Record<string, unknown>;
      lessonId?: string;
      spaceId?: string;
    }> = [];

    const lessonIds: string[] = [];

    snap.forEach((docSnap) => {
      const d = docSnap.data() as Record<string, unknown>;

      // ✅ support both field names: lessonId and publishedLessonId
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

    // ✅ slå opp lesson-titler (best effort)
    const lessonTitleById = await fetchLessonTitlesByIds(db, lessonIds);

    for (const row of submissionRows) {
      const { id, d, lessonId, spaceId } = row;

      const rawTitle = pickTitle(d);
      const lessonTitle = lessonId ? lessonTitleById.get(lessonId) : undefined;

      // ✅ Tittel-logikk:
      // 1) bruk submission sin egen title hvis den finnes
      // 2) ellers bruk lessonTitle hvis vi fant den
      // 3) ellers fallback
      const title =
        rawTitle && rawTitle.toLowerCase() !== "untitled"
          ? rawTitle
          : lessonTitle
            ? `Submission · ${lessonTitle}`
            : "Submission";

      const status = pickStatus(d) || (d.reviewedAt ? "reviewed" : "submitted");

      // For “open submission” er dette riktig for student,
      // ellers fall tilbake til en lesson-lenke hvis vi har den.
      const fallbackHref = lessonId ? hrefForLesson(mode, lessonId) : `/student/results`;

      const meta: string[] = [];
      if (lessonTitle) meta.push(`Lesson: ${lessonTitle}`);
      if (spaceId) meta.push(`space:${spaceId}`);
      if (lessonId) meta.push(`lesson:${lessonId}`);

      results.push({
        type: "submission",
        id,
        title,
        status,
        updatedAt: pickUpdated(d),
        href: mode === "student" ? `/student/submissions/${id}` : fallbackHref,
        meta,

        uid: typeof d.uid === "string" ? d.uid : null,
        lessonId,
        spaceId,
      });
    }
  } catch {
    // ignore
  }

  return results;
}

async function fetchMySpaces(db: Firestore, uid: string) {
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

  try {
    const qy = query(
      collection(db, "spaces"),
      where("ownerUid", "==", uid),
      orderBy("updatedAt", "desc"),
      limit(50)
    );
    const snap = await getDocs(qy);

    snap.forEach((docSnap) => {
      const d = docSnap.data() as Record<string, unknown>;
      results.push({
        type: "space",
        id: docSnap.id,
        title: pickTitle(d) || "Space",
        status: pickStatus(d),
        updatedAt: pickUpdated(d),
        href: `/teacher/spaces/${docSnap.id}`,
        meta: [],

        ownerUid: typeof d.ownerUid === "string" ? d.ownerUid : undefined,
        joinCode: readJoinCode(d),
      });
    });
  } catch {
    // ignore
  }

  // fallback: createdBy
  try {
    const qy = query(
      collection(db, "spaces"),
      where("createdBy", "==", uid),
      orderBy("updatedAt", "desc"),
      limit(50)
    );
    const snap = await getDocs(qy);

    snap.forEach((docSnap) => {
      const d = docSnap.data() as Record<string, unknown>;
      results.push({
        type: "space",
        id: docSnap.id,
        title: pickTitle(d) || "Space",
        status: pickStatus(d),
        updatedAt: pickUpdated(d),
        href: `/teacher/spaces/${docSnap.id}`,
        meta: [],

        ownerUid: typeof d.createdBy === "string" ? d.createdBy : undefined,
        joinCode: readJoinCode(d),
      });
    });
  } catch {
    // ignore
  }

  return results;
}

export async function loadMyContent(opts: {
  db: Firestore;
  mode: AppMode;
  uid?: string | null;
  isAnon?: boolean;
}) {
  const { db, mode, uid, isAnon } = opts;

  if (!uid || isAnon) {
    return {
      items: [] as ContentItem[],
      notes: ["Gjestemodus: Innhold lagres lokalt (kommer). Logg inn for å synkronisere."],
      warnings: [] as string[],
    };
  }

  const warnings: string[] = [];

  const [lessons, submissions, spaces] = await Promise.all([
    fetchMyLessons(db, uid, mode),
    fetchMySubmissions(db, uid, mode),
    fetchMySpaces(db, uid),
  ]);

  const seen = new Set<string>();
  const merged = [...lessons, ...submissions, ...spaces].filter((it) => {
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
      "Fant ingen dokumenter i feeden ennå. Hvis dette er uventet, kan vi justere mapping (feltnavn for ownerId/updatedAt/status)."
    );
  }

  return { items, notes: [] as string[], warnings };
}