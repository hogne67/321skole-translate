import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import { isRecord, safeString, type QuizSessionDoc } from "@/lib/quizSessions";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function getBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

export async function POST(req: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);
    const { sessionId } = await ctx.params;
    if (!sessionId) return json({ error: "Missing sessionId" }, 400);

    const body = (await req.json().catch(() => ({}))) as {
      action?: unknown;
      mode?: unknown;
      answerSeconds?: unknown;
      revealSeconds?: unknown;
      resultsSeconds?: unknown;
      nextSeconds?: unknown;
    };
    const action = safeString(body.action);
    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const sessionRef = db.collection("quizSessions").doc(sessionId);
    const [sessionSnap, userSnap] = await Promise.all([sessionRef.get(), db.collection("users").doc(uid).get()]);
    if (!sessionSnap.exists) return json({ error: "Session not found" }, 404);
    const session = (sessionSnap.data() ?? {}) as QuizSessionDoc;
    const user = userSnap.data() ?? {};
    const roles = isRecord(user.roles) ? user.roles : {};
    const isAdmin = user.role === "admin" || roles.admin === true;
    if (session.ownerId !== uid && !isAdmin) return json({ error: "Not allowed" }, 403);

    const questions = Array.isArray(session.questions) ? session.questions : [];
    const currentIndex = typeof session.currentIndex === "number" ? session.currentIndex : 0;
    const now = Date.now();
    const numberFrom = (value: unknown, fallback: number, allowed: number[]) => {
      const next = typeof value === "number" ? value : Number(value);
      return allowed.includes(next) ? next : fallback;
    };
    const timingPayload = {
      answerSeconds: numberFrom(body.answerSeconds, typeof session.answerSeconds === "number" ? session.answerSeconds : 30, [15, 30, 60]),
      revealSeconds: numberFrom(body.revealSeconds, typeof session.revealSeconds === "number" ? session.revealSeconds : 20, [10, 20, 30]),
      resultsSeconds: numberFrom(body.resultsSeconds, typeof session.resultsSeconds === "number" ? session.resultsSeconds : 20, [10, 20, 30]),
      nextSeconds: numberFrom(body.nextSeconds, typeof session.nextSeconds === "number" ? session.nextSeconds : 5, [5, 10]),
    };

    if (action === "settings") {
      await sessionRef.set({ ...timingPayload, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return json({ ok: true });
    }

    if (action === "start") {
      await sessionRef.set(
        {
          status: "active",
          mode: body.mode === "auto" ? "auto" : "manual",
          currentIndex: 0,
          showAnswer: false,
          questionStartedAt: now,
          answerShownAt: null,
          ...timingPayload,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return json({ ok: true });
    }

    if (action === "showAnswer") {
      await sessionRef.set({ showAnswer: true, answerShownAt: now, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return json({ ok: true });
    }

    if (action === "next") {
      const nextIndex = currentIndex + 1;
      if (nextIndex >= questions.length) {
        await sessionRef.set({ status: "finished", showAnswer: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      } else {
        await sessionRef.set(
          {
            status: "active",
            currentIndex: nextIndex,
            showAnswer: false,
            questionStartedAt: now,
            answerShownAt: null,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
      return json({ ok: true });
    }

    if (action === "finish") {
      await sessionRef.set({ status: "finished", showAnswer: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return json({ ok: true });
    }

    if (action === "reset") {
      await sessionRef.collection("answers").get().then(async (snap) => {
        const batch = db.batch();
        snap.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
      });
      await sessionRef.set(
        {
          status: "lobby",
          mode: "manual",
          currentIndex: 0,
          showAnswer: false,
          questionStartedAt: null,
          answerShownAt: null,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not control session";
    return json({ error: message }, 500);
  }
}
