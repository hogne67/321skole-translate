import "server-only";

import { FieldPath } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { getAdmin } from "@/lib/firebaseAdmin";
import { accountErrorStatus } from "@/lib/security/accountAccess.server";
import { getSpaceOwnerUid } from "@/lib/security/spaceOwnership";

export const runtime = "nodejs";

const pageSize = 50;

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

function bearer(req: Request) {
  return req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isPlatformAdmin(data: Record<string, unknown>) {
  const roles = data.roles && typeof data.roles === "object" ? data.roles as Record<string, unknown> : {};
  return data.disabled !== true
    && (data.role === "admin" || roles.admin === true)
    && data.adminLevel !== "moderator";
}

export async function GET(req: Request, context: { params: Promise<{ schoolId: string }> }) {
  try {
    const token = bearer(req);
    if (!token) return json({ ok: false, error: "Unauthorized" }, 401);
    const { auth, db } = getAdmin();
    let decoded;
    try {
      decoded = await auth.verifyIdToken(token, true);
    } catch (error) {
      return json({ ok: false, error: "Authentication unavailable or denied" }, accountErrorStatus(error) ?? 401);
    }
    if (!decoded.uid) return json({ ok: false, error: "Unauthorized" }, 401);
    const profileSnap = await db.collection("users").doc(decoded.uid).get();
    if (!profileSnap.exists || !isPlatformAdmin(profileSnap.data() ?? {})) {
      return json({ ok: false, error: "Forbidden" }, 403);
    }

    const schoolId = text((await context.params).schoolId);
    if (!schoolId || schoolId.includes("/")) return json({ ok: false, error: "Invalid school" }, 400);
    const schoolSnap = await db.collection("schools").doc(schoolId).get();
    if (!schoolSnap.exists) return json({ ok: false, error: "School not found" }, 404);

    const after = text(new URL(req.url).searchParams.get("after"));
    if (after.includes("/") || after.length > 1500) return json({ ok: false, error: "Invalid cursor" }, 400);
    const spaces = db.collection("spaces");
    let query = spaces.where("schoolId", "==", schoolId).orderBy(FieldPath.documentId()).limit(pageSize + 1);
    if (after) {
      const cursor = await spaces.doc(after).get();
      if (!cursor.exists || cursor.get("schoolId") !== schoolId) {
        return json({ ok: false, error: "Invalid cursor" }, 400);
      }
      query = query.startAfter(cursor);
    }

    const snapshot = await query.select(
      "title", "ownerId", "ownerUid", "isOpen", "archived",
      "lessonAiFeedbackDisabled", "writingAiDisabled"
    ).get();
    const visible = snapshot.docs.slice(0, pageSize);
    const rooms = visible.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        title: text(data.title) || "Uten navn",
        ownerUid: getSpaceOwnerUid(data) || "",
        isOpen: data.isOpen === true,
        archived: data.archived === true,
        lessonAiFeedbackDisabled: data.lessonAiFeedbackDisabled === true,
        writingAiDisabled: data.writingAiDisabled === true,
      };
    });
    return json({ ok: true, schoolId, rooms, nextCursor: snapshot.size > pageSize ? visible.at(-1)?.id ?? null : null });
  } catch {
    return json({ ok: false, error: "Could not load school Spaces" }, 500);
  }
}
