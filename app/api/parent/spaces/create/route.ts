import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { needsEmailVerification } from "@/lib/emailVerificationGuard";
import { getAdmin } from "@/lib/firebaseAdmin";
import { AccountAccessError, accountErrorStatus, assertActiveProfile } from "@/lib/security/accountAccess.server";
import { getSpaceOwnerUid } from "@/lib/security/spaceOwnership";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return NextResponse.json({ error: "Sign in to create a family room." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const roomId = typeof body?.roomId === "string" ? body.roomId : "";
  if (!title || title.length > 120 || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(roomId)) {
    return NextResponse.json({ error: "Invalid room name or request." }, { status: 400 });
  }

  try {
    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const { uid } = decoded;
    if (decoded.firebase?.sign_in_provider === "anonymous" || needsEmailVerification(decoded)) {
      return NextResponse.json({ error: "A verified parent account is required." }, { status: 403 });
    }

    const roomRef = db.collection("spaces").doc(roomId);
    const memberRef = db.collection("spaceMembers").doc(roomId + "_" + uid);
    const created = await db.runTransaction(async (transaction) => {
      const [profileSnapshot, roomSnapshot] = await Promise.all([
        transaction.get(db.collection("users").doc(uid)),
        transaction.get(roomRef),
      ]);
      const profile = profileSnapshot.data();
      assertActiveProfile(profile, decoded);
      if (profile?.role !== "parent") {
        throw new AccountAccessError("A parent account is required.", 403, "auth/forbidden");
      }

      if (roomSnapshot.exists) {
        const room = roomSnapshot.data();
        return room?.kind === "family" && !room.deletedAt && getSpaceOwnerUid(room) === uid;
      }

      const displayName = typeof profile.displayName === "string" ? profile.displayName.trim().slice(0, 80) : "";
      const now = FieldValue.serverTimestamp();
      transaction.create(roomRef, {
        title,
        ownerId: uid,
        kind: "family",
        createdByRole: "parent",
        isOpen: false,
        createdAt: now,
        updatedAt: now,
      });
      transaction.create(memberRef, {
        spaceId: roomId,
        uid,
        displayName: displayName || "Parent",
        role: "parent",
        status: "active",
        active: true,
        archived: false,
        createdAt: now,
      });
      return true;
    });

    return created
      ? NextResponse.json({ spaceId: roomId })
      : NextResponse.json({ error: "Could not create this family room." }, { status: 409 });
  } catch (error) {
    return NextResponse.json({ error: "Could not create this family room." }, { status: accountErrorStatus(error) ?? 503 });
  }
}
