import "server-only";

import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { normalizeCoursePlan } from "@/lib/courses/types";

type ParticipantStatus = "invited" | "enrolled" | "active" | "completed" | "cancelled";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function profileDisplayName(profile: unknown): string {
  if (!profile || typeof profile !== "object") return "";
  const record = profile as Record<string, unknown>;
  return safeString(record.displayName) || safeString(record.fullName) || safeString(record.name);
}

function normalizeParticipantStatus(value: unknown): ParticipantStatus {
  if (value === "invited" || value === "active" || value === "completed" || value === "cancelled") {
    return value;
  }

  return "enrolled";
}

function canSeeCourseStatus(status: string): boolean {
  return status === "published" || status === "active" || status === "completed";
}

function dailyRoomName(courseId: string, sessionNumber: number): string {
  const cleanCourseId = courseId.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
  return `course-${cleanCourseId}-s${sessionNumber}`.replace(/-+/g, "-").slice(0, 80);
}

async function dailyFetch(path: string, init: RequestInit) {
  const apiKey = process.env.DAILY_API_KEY;
  if (!apiKey) throw new Error("DAILY_API_KEY is not configured");

  const res = await fetch(`https://api.daily.co/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { res, data };
}

function buildDailyRoomProperties(startsAt: string, durationMinutes: number) {
  const startMs = startsAt ? new Date(startsAt).getTime() : Number.NaN;
  const nbf = Math.floor(Date.now() / 1000) - 60;
  const exp = Number.isFinite(startMs)
    ? Math.floor(startMs / 1000) + Math.max(durationMinutes || 120, 60) * 60 + 60 * 60
    : undefined;

  return {
    nbf,
    ...(exp ? { exp } : {}),
    enable_prejoin_ui: true,
    enable_people_ui: true,
    enable_chat: true,
    enable_advanced_chat: true,
    enable_hand_raising: true,
    enable_emoji_reactions: true,
    enable_screenshare: true,
    enable_breakout_rooms: true,
    start_video_off: false,
    start_audio_off: false,
    eject_at_room_exp: false,
    lang: "en",
  };
}

async function updateDailyRoom(roomName: string, startsAt: string, durationMinutes: number) {
  const { res, data } = await dailyFetch(`/rooms/${encodeURIComponent(roomName)}`, {
    method: "POST",
    body: JSON.stringify({
      privacy: "private",
      properties: buildDailyRoomProperties(startsAt, durationMinutes),
    }),
  });

  if (!res.ok) {
    throw new Error(safeString(data.error) || safeString(data.info) || "Could not update Daily room");
  }

  return typeof data.url === "string" ? data.url : "";
}

async function createDailyRoom(roomName: string, startsAt: string, durationMinutes: number) {
  const { res, data } = await dailyFetch("/rooms", {
    method: "POST",
    body: JSON.stringify({
      name: roomName,
      privacy: "private",
      properties: buildDailyRoomProperties(startsAt, durationMinutes),
    }),
  });

  if (res.ok && typeof data.url === "string") return data.url;

  const domain = safeString(process.env.DAILY_DOMAIN || process.env.NEXT_PUBLIC_DAILY_DOMAIN);
  if (res.status === 400 && domain) {
    const updatedUrl = await updateDailyRoom(roomName, startsAt, durationMinutes);
    return updatedUrl || `https://${domain.replace(/^https?:\/\//, "")}/${roomName}`;
  }

  throw new Error(safeString(data.error) || safeString(data.info) || "Could not create Daily room");
}

async function createMeetingToken(args: {
  roomName: string;
  uid: string;
  userName: string;
  startsAt: string;
  durationMinutes: number;
}) {
  const startMs = args.startsAt ? new Date(args.startsAt).getTime() : Number.NaN;
  const nbf = Number.isFinite(startMs) ? Math.floor(startMs / 1000) - 30 * 60 : undefined;
  const exp = Number.isFinite(startMs)
    ? Math.floor(startMs / 1000) + Math.max(args.durationMinutes || 120, 60) * 60 + 60 * 60
    : Math.floor(Date.now() / 1000) + 8 * 60 * 60;

  const { res, data } = await dailyFetch("/meeting-tokens", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        room_name: args.roomName,
        ...(nbf ? { nbf } : {}),
        exp,
        is_owner: false,
        user_id: args.uid,
        user_name: args.userName || "Course participant",
        enable_screenshare: true,
        enable_prejoin_ui: true,
        enable_live_captions_ui: true,
        eject_at_token_exp: false,
        lang: "en",
      },
    }),
  });

  if (!res.ok || typeof data.token !== "string") {
    throw new Error(safeString(data.error) || safeString(data.info) || "Could not create Daily token");
  }

  return data.token;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ courseId: string; sessionNumber: string }> }
) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);

    const { courseId, sessionNumber: rawSessionNumber } = await ctx.params;
    const sessionNumber = Number(rawSessionNumber);
    if (!courseId || !Number.isFinite(sessionNumber)) return json({ error: "Missing session" }, 400);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;
    const rawEmail = safeString(decoded.email);
    const email = rawEmail.toLowerCase();
    if (!email) return json({ error: "Participant email is required" }, 403);

    const emailCandidates = Array.from(new Set([rawEmail, email].filter(Boolean)));
    const participantDocs = (
      await Promise.all([
        db
          .collection("courses")
          .doc(courseId)
          .collection("participants")
          .where("participantUid", "==", uid)
          .limit(5)
          .get(),
        ...emailCandidates.map((candidate) =>
          db
            .collection("courses")
            .doc(courseId)
            .collection("participants")
            .where("email", "==", candidate)
            .limit(5)
            .get()
        ),
      ])
    ).flatMap((snap) => snap.docs);

    const participantDoc = participantDocs[0];
    if (!participantDoc) return json({ error: "No course access" }, 403);

    const participant = participantDoc.data() ?? {};
    const participantStatus = normalizeParticipantStatus(participant.status);
    if (participantStatus === "cancelled") return json({ error: "No course access" }, 403);

    const courseRef = db.collection("courses").doc(courseId);
    const courseSnap = await courseRef.get();
    if (!courseSnap.exists) return json({ error: "Course not found" }, 404);

    const profileSnap = await db.collection("users").doc(uid).get();
    const profile = profileSnap.exists ? (profileSnap.data() ?? {}) : {};

    const course = courseSnap.data() ?? {};
    const status = safeString(course.status);
    if (!canSeeCourseStatus(status)) return json({ error: "Course is not available" }, 404);

    const coursePlan = normalizeCoursePlan(course.coursePlan);
    const sessionIndex = coursePlan.findIndex((item) => item.sessionNumber === sessionNumber);
    const session = sessionIndex >= 0 ? coursePlan[sessionIndex] : null;
    if (!session) return json({ error: "Session not found" }, 404);

    const roomName = dailyRoomName(courseId, sessionNumber);
    const existingDailyUrl = session.meetingUrl.includes("daily.co") ? session.meetingUrl : "";
    const roomUrl = existingDailyUrl
      ? (await updateDailyRoom(roomName, session.startsAt, session.durationMinutes)) || existingDailyUrl
      : await createDailyRoom(roomName, session.startsAt, session.durationMinutes);

    if (!existingDailyUrl) {
      const nextPlan = coursePlan.map((item, index) =>
        index === sessionIndex ? { ...item, meetingUrl: roomUrl } : item
      );
      await courseRef.update({
        coursePlan: nextPlan,
        updatedAt: new Date(),
      });
    }

    const displayName =
      safeString(participant.name) ||
      profileDisplayName(profile) ||
      safeString(decoded.name) ||
      rawEmail ||
      "Course participant";
    const meetingToken = await createMeetingToken({
      roomName,
      uid,
      userName: displayName,
      startsAt: session.startsAt,
      durationMinutes: session.durationMinutes,
    });

    return json({ roomUrl, token: meetingToken }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start Daily session";
    return json({ error: message }, 500);
  }
}
