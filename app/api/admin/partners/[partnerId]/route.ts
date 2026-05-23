import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { getAdmin } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    partnerId?: string;
  }>;
};

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

function readString(v: unknown, maxLength = 4000): string {
  return typeof v === "string" ? v.trim().slice(0, maxLength) : "";
}

function readPartnerStatus(v: unknown): "active" | "disabled" | null {
  if (v === "active" || v === "disabled") return v;
  return null;
}

function readFollowUpStatus(v: unknown): "needs_follow_up" | "waiting" | "done" | null {
  if (v === "needs_follow_up" || v === "waiting" || v === "done") return v;
  return null;
}

function readCommunicationVisibility(v: unknown): "admin_internal" | "partner_visible" {
  if (v === "partner_visible") return "partner_visible";
  return "admin_internal";
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

async function requireAdmin(req: Request) {
  const token = getBearerToken(req);
  if (!token) return { error: json({ error: "Missing Authorization Bearer token" }, 401) };

  const { auth, db } = getAdmin();
  const decoded = await auth.verifyIdToken(token);
  const adminUid = decoded.uid;

  if (!adminUid || !(await isAdminUser(db, adminUid))) {
    return { error: json({ error: "No access (admin required)" }, 403) };
  }

  return { db, adminUid };
}

async function resolvePartner(
  db: FirebaseFirestore.Firestore,
  partnerId: string
): Promise<{
  applicationId: string | null;
  application: Record<string, unknown> | null;
  uid: string | null;
  userProfile: Record<string, unknown> | null;
}> {
  const applicationRef = db.collection("partnerApplications").doc(partnerId);
  const applicationSnap = await applicationRef.get();

  let applicationId: string | null = null;
  let application: Record<string, unknown> | null = null;

  if (applicationSnap.exists) {
    applicationId = applicationSnap.id;
    application = toJsonSafe(applicationSnap.data() ?? {});
  } else {
    const byUidSnap = await db
      .collection("partnerApplications")
      .where("uid", "==", partnerId)
      .limit(1)
      .get();

    const first = byUidSnap.docs[0];
    if (first) {
      applicationId = first.id;
      application = toJsonSafe(first.data() ?? {});
    }
  }

  const uidFromApplication =
    application && typeof application.uid === "string" ? application.uid : "";
  const uid = uidFromApplication || partnerId;
  const userSnap = uid ? await db.collection("users").doc(uid).get() : null;
  const userProfile = userSnap?.exists
    ? {
        id: userSnap.id,
        uid: userSnap.id,
        ...toJsonSafe(userSnap.data() ?? {}),
      }
    : null;

  return {
    applicationId,
    application,
    uid: userProfile ? uid : uidFromApplication || null,
    userProfile,
  };
}

async function loadCommunicationLog(
  db: FirebaseFirestore.Firestore,
  partnerId: string,
  uid: string | null
) {
  const querySnap = uid
    ? await db.collection("partnerCommunications").where("targetUid", "==", uid).limit(50).get()
    : await db
        .collection("partnerCommunications")
        .where("partnerId", "==", partnerId)
        .limit(50)
        .get();

  return querySnap.docs
    .map(
      (doc): Record<string, unknown> & { id: string } => ({
      id: doc.id,
      ...toJsonSafe(doc.data() ?? {}),
    }))
    .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
}

export async function GET(req: Request, context: RouteContext) {
  try {
    const admin = await requireAdmin(req);
    if ("error" in admin) return admin.error;

    const { partnerId: rawPartnerId } = await context.params;
    const partnerId = readString(rawPartnerId, 200);
    if (!partnerId) return json({ error: "Missing partner ID" }, 400);

    const partner = await resolvePartner(admin.db, partnerId);

    if (!partner.application && !partner.userProfile) {
      return json({ error: "Partner not found" }, 404);
    }

    const applicationNotes =
      partner.application && typeof partner.application.adminNotes === "string"
        ? partner.application.adminNotes
        : "";
    const userNotes =
      partner.userProfile && typeof partner.userProfile.partnerAdminNotes === "string"
        ? partner.userProfile.partnerAdminNotes
        : "";
    const communications = await loadCommunicationLog(admin.db, partnerId, partner.uid);

    return json({
      ok: true,
      partnerId,
      applicationId: partner.applicationId,
      uid: partner.uid,
      application: partner.application,
      userProfile: partner.userProfile,
      adminNotes: applicationNotes || userNotes,
      communications,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Could not load partner" }, 500);
  }
}

export async function POST(req: Request, context: RouteContext) {
  try {
    const admin = await requireAdmin(req);
    if ("error" in admin) return admin.error;

    const { partnerId: rawPartnerId } = await context.params;
    const partnerId = readString(rawPartnerId, 200);
    if (!partnerId) return json({ error: "Missing partner ID" }, 400);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const message = readString(body.message, 4000);
    const visibility = readCommunicationVisibility(body.visibility);
    if (!message) return json({ error: "Message is required" }, 400);

    const partner = await resolvePartner(admin.db, partnerId);
    if (!partner.application && !partner.userProfile) {
      return json({ error: "Partner not found" }, 404);
    }

    const createdAt = FieldValue.serverTimestamp();
    const communicationRef = admin.db.collection("partnerCommunications").doc();

    await admin.db.runTransaction(async (tx) => {
      tx.set(communicationRef, {
        partnerId,
        applicationId: partner.applicationId,
        targetUid: partner.uid,
        type: "admin_note",
        visibility,
        message,
        createdBy: admin.adminUid,
        createdAt,
        updatedAt: createdAt,
      });

      tx.set(admin.db.collection("adminAuditEvents").doc(), {
        type: "partner_communication_added",
        partnerId,
        applicationId: partner.applicationId,
        targetUid: partner.uid,
        communicationId: communicationRef.id,
        actorUid: admin.adminUid,
        createdAt,
      });
    });

    return json({
      ok: true,
      id: communicationRef.id,
      partnerId,
      applicationId: partner.applicationId,
      uid: partner.uid,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Could not add partner communication" }, 500);
  }
}

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const admin = await requireAdmin(req);
    if ("error" in admin) return admin.error;

    const { partnerId: rawPartnerId } = await context.params;
    const partnerId = readString(rawPartnerId, 200);
    if (!partnerId) return json({ error: "Missing partner ID" }, 400);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const hasAdminNotes = Object.prototype.hasOwnProperty.call(body, "adminNotes");
    const adminNotes = hasAdminNotes ? readString(body.adminNotes, 4000) : "";
    const requestedPartnerStatus = readPartnerStatus(body.partnerStatus);
    const requestedFollowUpStatus = readFollowUpStatus(body.partnerFollowUpStatus);
    const shouldMarkRepliesReviewed = body.markPartnerRepliesReviewed === true;

    if (Object.prototype.hasOwnProperty.call(body, "partnerStatus") && !requestedPartnerStatus) {
      return json({ error: "Invalid partnerStatus" }, 400);
    }

    if (
      Object.prototype.hasOwnProperty.call(body, "partnerFollowUpStatus") &&
      !requestedFollowUpStatus
    ) {
      return json({ error: "Invalid partnerFollowUpStatus" }, 400);
    }

    const partner = await resolvePartner(admin.db, partnerId);

    if (!partner.application && !partner.userProfile) {
      return json({ error: "Partner not found" }, 404);
    }

    if (requestedPartnerStatus && !partner.uid) {
      return json({ error: "Partner user profile not found" }, 400);
    }

    if (requestedFollowUpStatus && !partner.uid) {
      return json({ error: "Partner user profile not found" }, 400);
    }

    const batch = admin.db.batch();
    const updatedAt = FieldValue.serverTimestamp();
    let reviewedReplyCount = 0;

    if (hasAdminNotes && partner.applicationId) {
      batch.set(
        admin.db.collection("partnerApplications").doc(partner.applicationId),
        {
          adminNotes,
          adminNotesUpdatedAt: updatedAt,
          adminNotesUpdatedBy: admin.adminUid,
          updatedAt,
        },
        { merge: true }
      );
    }

    if (hasAdminNotes && partner.uid) {
      batch.set(
        admin.db.collection("users").doc(partner.uid),
        {
          partnerAdminNotes: adminNotes,
          partnerAdminNotesUpdatedAt: updatedAt,
          partnerAdminNotesUpdatedBy: admin.adminUid,
          updatedAt,
        },
        { merge: true }
      );
    }

    if (requestedPartnerStatus && partner.uid) {
      batch.set(
        admin.db.collection("users").doc(partner.uid),
        {
          partnerAccess: requestedPartnerStatus === "active",
          partnerStatus: requestedPartnerStatus,
          partnerLevel: requestedPartnerStatus === "active" ? "partner" : "none",
          partnerStatusUpdatedAt: updatedAt,
          partnerStatusUpdatedBy: admin.adminUid,
          updatedAt,
        },
        { merge: true }
      );
    }

    if (requestedFollowUpStatus && partner.uid) {
      batch.set(
        admin.db.collection("users").doc(partner.uid),
        {
          partnerFollowUpStatus: requestedFollowUpStatus,
          partnerFollowUpStatusUpdatedAt: updatedAt,
          partnerFollowUpStatusUpdatedBy: admin.adminUid,
          updatedAt,
        },
        { merge: true }
      );
    }

    if (hasAdminNotes) {
      batch.set(admin.db.collection("adminAuditEvents").doc(), {
        type: "partner_notes_updated",
        partnerId,
        applicationId: partner.applicationId,
        targetUid: partner.uid,
        actorUid: admin.adminUid,
        createdAt: updatedAt,
      });
    }

    if (requestedPartnerStatus) {
      batch.set(admin.db.collection("adminAuditEvents").doc(), {
        type: "partner_status_updated",
        partnerId,
        applicationId: partner.applicationId,
        targetUid: partner.uid,
        partnerStatus: requestedPartnerStatus,
        actorUid: admin.adminUid,
        createdAt: updatedAt,
      });
    }

    if (requestedFollowUpStatus) {
      batch.set(admin.db.collection("adminAuditEvents").doc(), {
        type: "partner_follow_up_status_updated",
        partnerId,
        applicationId: partner.applicationId,
        targetUid: partner.uid,
        partnerFollowUpStatus: requestedFollowUpStatus,
        actorUid: admin.adminUid,
        createdAt: updatedAt,
      });
    }

    if (shouldMarkRepliesReviewed && partner.uid) {
      const repliesSnap = await admin.db
        .collection("partnerCommunications")
        .where("targetUid", "==", partner.uid)
        .where("type", "==", "partner_reply")
        .limit(100)
        .get();

      for (const doc of repliesSnap.docs) {
        const data = doc.data() ?? {};
        if (data.reviewedAt) continue;

        reviewedReplyCount += 1;
        batch.set(
          doc.ref,
          {
            reviewedAt: updatedAt,
            reviewedBy: admin.adminUid,
            updatedAt,
          },
          { merge: true }
        );
      }

      batch.set(admin.db.collection("adminAuditEvents").doc(), {
        type: "partner_replies_reviewed",
        partnerId,
        applicationId: partner.applicationId,
        targetUid: partner.uid,
        reviewedReplyCount,
        actorUid: admin.adminUid,
        createdAt: updatedAt,
      });
    }

    await batch.commit();

    return json({
      ok: true,
      partnerId,
      applicationId: partner.applicationId,
      uid: partner.uid,
      reviewedReplyCount,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Could not update partner" }, 500);
  }
}
