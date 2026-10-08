import "server-only";
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { invitationId, checkPartnerInvitation } from "@/lib/partnerInvitation";

export async function POST(req: Request) {
  try {
    const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!bearer) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
    const { auth, db } = getAdmin();
    const user = await auth.verifyIdToken(bearer);
    if (!user.email || !user.email_verified) return NextResponse.json({ error: "Verify your email before accepting the invitation." }, { status: 403 });
    const body = await req.json();
    if (typeof body.token !== "string" || !/^[a-f0-9]{64}$/.test(body.token)) return NextResponse.json({ error: "Invalid invitation" }, { status: 400 });
    const ref = db.collection("partnerApplications").doc(invitationId(body.token));
    await db.runTransaction(async (tx) => {
      const invitation = await tx.get(ref);
      const profileRef = db.collection("users").doc(user.uid);
      const profile = await tx.get(profileRef);
      const data = invitation.data();
      const current = profile.data() ?? {};
      if (checkPartnerInvitation(data, user, current) === "accepted") return;
      if (!data) throw new Error("Invalid invitation");
      const now = new Date().toISOString();
      tx.set(profileRef, {
        email: user.email, displayName: current.displayName || data.name,
        partnerAddress: data.address, phone: data.phone,
        partnerAccess: true, partnerStatus: "active", partnerLevel: "partner",
        partnerApprovedAt: now, partnerApprovedBy: data.createdBy, updatedAt: now,
      }, { merge: true });
      tx.update(ref, { uid: user.uid, status: "approved", reviewedAt: now, reviewedBy: data.createdBy });
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not accept invitation" }, { status: 400 });
  }
}
