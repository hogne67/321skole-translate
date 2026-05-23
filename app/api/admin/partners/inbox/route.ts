import "server-only";

import { NextResponse } from "next/server";

import { getAdmin } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  const m = h?.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

async function isAdminUser(db: FirebaseFirestore.Firestore, uid: string): Promise<boolean> {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) return false;

  const data = snap.data() ?? {};
  const roles = isRecord(data.roles) ? data.roles : {};

  return data.role === "admin" || roles.admin === true;
}

function toJsonSafe(data: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => {
      if (isRecord(value) && typeof value.toDate === "function") {
        return [key, value.toDate().toISOString()];
      }

      return [key, value];
    })
  );
}

export async function GET(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const adminUid = decoded.uid;

    if (!adminUid || !(await isAdminUser(db, adminUid))) {
      return json({ error: "No access (admin required)" }, 403);
    }

    const repliesSnap = await db
      .collection("partnerCommunications")
      .where("type", "==", "partner_reply")
      .limit(200)
      .get();

    const replies = repliesSnap.docs
      .map(
        (doc): Record<string, unknown> & { id: string } => ({
          id: doc.id,
          ...toJsonSafe(doc.data() ?? {}),
        })
      )
      .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));

    const openReplies = replies.filter((item) => !item.reviewedAt);
    const handledReplies = replies
      .filter((item) => item.reviewedAt)
      .sort((a, b) => String(b.reviewedAt ?? "").localeCompare(String(a.reviewedAt ?? "")))
      .slice(0, 20);

    const uids = Array.from(
      new Set(
        replies
          .map((item) => (typeof item.targetUid === "string" ? item.targetUid : ""))
          .filter(Boolean)
      )
    );

    const userEntries = await Promise.all(
      uids.map(async (uid) => {
        const snap = await db.collection("users").doc(uid).get();
        return [
          uid,
          snap.exists
            ? {
                id: snap.id,
                uid: snap.id,
                ...toJsonSafe(snap.data() ?? {}),
              }
            : null,
        ] as const;
      })
    );

    const usersByUid = Object.fromEntries(userEntries);

    function withPartner(reply: Record<string, unknown> & { id: string }) {
      const uid = typeof reply.targetUid === "string" ? reply.targetUid : "";

      return {
        ...reply,
        partner: uid ? usersByUid[uid] : null,
      };
    }

    return json({
      ok: true,
      items: openReplies.map(withPartner),
      handledItems: handledReplies.map(withPartner),
      stats: {
        needsReview: openReplies.length,
        handled: handledReplies.length,
        partners: new Set(
          openReplies
            .map((item) => (typeof item.targetUid === "string" ? item.targetUid : ""))
            .filter(Boolean)
        ).size,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Could not load partner inbox" }, 500);
  }
}
