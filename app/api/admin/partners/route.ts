import "server-only";

import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";

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

type PartnerApplicationItem = {
  id: string;
  createdAt?: unknown;
  status?: unknown;
  uid?: unknown;
} & Record<string, unknown>;

type ActivePartnerItem = {
  id: string;
  uid: string;
  email?: unknown;
  displayName?: unknown;
  partnerStatus?: unknown;
  partnerLevel?: unknown;
  partnerRegion?: unknown;
  partnerLanguages?: unknown;
  partnerApprovedAt?: unknown;
  partnerFollowUpStatus?: unknown;
  partnerFollowUpStatusUpdatedAt?: unknown;
  partnerReplyCount?: number;
  unreviewedPartnerReplyCount?: number;
  latestPartnerReplyAt?: string | null;
  latestUnreviewedPartnerReplyAt?: string | null;
  latestAdminContactAt?: string | null;
  latestContactAt?: string | null;
} & Record<string, unknown>;

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

    const [applicationsSnap, activeUsersSnap] = await Promise.all([
      db.collection("partnerApplications").limit(200).get(),
      db.collection("users").where("partnerStatus", "==", "active").limit(200).get(),
    ]);

    const communicationsSnap = await db.collection("partnerCommunications").limit(500).get();

    const replyStatsByUid = new Map<
      string,
      {
        count: number;
        latestAt: string;
        unreviewedCount: number;
        latestUnreviewedAt: string;
      }
    >();
    const contactStatsByUid = new Map<string, { latestAdminAt: string; latestContactAt: string }>();

    for (const doc of communicationsSnap.docs) {
      const data = toJsonSafe(doc.data() ?? {});
      const targetUid = typeof data.targetUid === "string" ? data.targetUid : "";
      if (!targetUid) continue;

      const createdAt = typeof data.createdAt === "string" ? data.createdAt : "";
      const type = typeof data.type === "string" ? data.type : "";
      const currentContact = contactStatsByUid.get(targetUid) ?? {
        latestAdminAt: "",
        latestContactAt: "",
      };

      contactStatsByUid.set(targetUid, {
        latestAdminAt:
          type !== "partner_reply" && createdAt > currentContact.latestAdminAt
            ? createdAt
            : currentContact.latestAdminAt,
        latestContactAt:
          createdAt > currentContact.latestContactAt ? createdAt : currentContact.latestContactAt,
      });

      if (type !== "partner_reply") continue;

      const isReviewed = Boolean(data.reviewedAt);
      const current = replyStatsByUid.get(targetUid) ?? {
        count: 0,
        latestAt: "",
        unreviewedCount: 0,
        latestUnreviewedAt: "",
      };

      replyStatsByUid.set(targetUid, {
        count: current.count + 1,
        latestAt: createdAt > current.latestAt ? createdAt : current.latestAt,
        unreviewedCount: current.unreviewedCount + (isReviewed ? 0 : 1),
        latestUnreviewedAt:
          !isReviewed && createdAt > current.latestUnreviewedAt
            ? createdAt
            : current.latestUnreviewedAt,
      });
    }

    const applications: PartnerApplicationItem[] = applicationsSnap.docs
      .map(
        (doc): PartnerApplicationItem => ({
          id: doc.id,
          ...toJsonSafe(doc.data() ?? {}),
        })
      )
      .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));

    const applicationUidSet = new Set(
      applications
        .map((item) => (typeof item.uid === "string" ? item.uid : ""))
        .filter(Boolean)
    );

    function partnerPriority(item: ActivePartnerItem): number {
      if ((item.unreviewedPartnerReplyCount ?? 0) > 0) return 0;
      if (item.partnerFollowUpStatus === "needs_follow_up") return 1;
      if (item.partnerFollowUpStatus === "waiting") return 2;
      if (item.partnerFollowUpStatus === "done") return 4;
      return 3;
    }

    const activePartners: ActivePartnerItem[] = activeUsersSnap.docs
      .map((doc): ActivePartnerItem => {
        const data = toJsonSafe(doc.data() ?? {});
        return {
          id: doc.id,
          uid: doc.id,
          partnerReplyCount: replyStatsByUid.get(doc.id)?.count ?? 0,
          unreviewedPartnerReplyCount: replyStatsByUid.get(doc.id)?.unreviewedCount ?? 0,
          latestPartnerReplyAt: replyStatsByUid.get(doc.id)?.latestAt ?? null,
          latestUnreviewedPartnerReplyAt:
            replyStatsByUid.get(doc.id)?.latestUnreviewedAt ?? null,
          latestAdminContactAt: contactStatsByUid.get(doc.id)?.latestAdminAt ?? null,
          ...data,
          latestContactAt: [
            contactStatsByUid.get(doc.id)?.latestContactAt ?? "",
            typeof data.partnerFollowUpStatusUpdatedAt === "string"
              ? data.partnerFollowUpStatusUpdatedAt
              : "",
            typeof data.partnerApprovedAt === "string" ? data.partnerApprovedAt : "",
          ].sort((a, b) => b.localeCompare(a))[0] || null,
        };
      })
      .sort((a, b) => {
        const priorityDiff = partnerPriority(a) - partnerPriority(b);
        if (priorityDiff !== 0) return priorityDiff;

        return String(b.partnerApprovedAt ?? "").localeCompare(String(a.partnerApprovedAt ?? ""));
      });

    const activePartnersWithoutApplication = activePartners.filter(
      (partner) => !applicationUidSet.has(partner.uid)
    );

    const pendingCount = applications.filter((item) => item.status === "pending").length;
    const approvedCount = applications.filter((item) => item.status === "approved").length;
    const rejectedCount = applications.filter((item) => item.status === "rejected").length;
    const needsFollowUpCount = activePartners.filter(
      (item) => item.partnerFollowUpStatus === "needs_follow_up"
    ).length;
    const waitingCount = activePartners.filter(
      (item) => item.partnerFollowUpStatus === "waiting"
    ).length;
    const doneCount = activePartners.filter((item) => item.partnerFollowUpStatus === "done").length;
    const unreviewedPartnerReplyCount = Array.from(replyStatsByUid.values()).reduce(
      (sum, item) => sum + item.unreviewedCount,
      0
    );

    return json({
      ok: true,
      applications,
      activePartners,
      activePartnersWithoutApplication,
      stats: {
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
        active: activePartners.length,
        needsFollowUp: needsFollowUpCount,
        waiting: waitingCount,
        done: doneCount,
        partnerReplies: Array.from(replyStatsByUid.values()).reduce(
          (sum, item) => sum + item.count,
          0
        ),
        unreviewedPartnerReplies: unreviewedPartnerReplyCount,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Could not load partners" }, 500);
  }
}
