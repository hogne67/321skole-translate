// lib/contentFeed.ts
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  Timestamp,
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

function pickTitle(d: unknown): string {
  const x = d as Record<string, unknown> | null;
  return String(
    x?.title ||
      x?.name ||
      x?.lessonTitle ||
      x?.spaceName ||
      x?.topic ||
      "Untitled"
  );
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
  return `/lesson/${lessonId}`;
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
        title: pickTitle(d),
        status: pickStatus(d),
        updatedAt: pickUpdated(d),
        href: hrefForLesson(mode, docSnap.id),
        meta: safeMeta(d),

        ownerId: typeof d.ownerId === "string" ? d.ownerId : undefined,
        activePublishedId:
          typeof d.activePublishedId === "string" ? d.activePublishedId : null,
        visibility: pickVisibility(d),
      });
    });
  } catch {
    // ignore
  }
  return results;
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

      const fallbackHref = lessonId ? `/lesson/${lessonId}` : `/student/results`;

      results.push({
        type: "submission",
        id: docSnap.id,
        title: pickTitle(d) || "Submission",
        status: pickStatus(d) || (d.reviewedAt ? "reviewed" : "submitted"),
        updatedAt: pickUpdated(d),
        href: mode === "student" ? `/student/submissions/${docSnap.id}` : fallbackHref,
        meta: [
          ...(spaceId ? [`space:${spaceId}`] : []),
          ...(lessonId ? [`lesson:${lessonId}`] : []),
        ],

        uid: typeof d.uid === "string" ? d.uid : null,
        lessonId,
        spaceId,
      });
    });
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
    if (
      join &&
      typeof join === "object" &&
      typeof (join as Record<string, unknown>).code === "string"
    ) {
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
        title: pickTitle(d),
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
        title: pickTitle(d),
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