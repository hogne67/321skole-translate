import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
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

function readString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function readStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const reviewerUid = decoded.uid;

    if (!reviewerUid || !(await isAdminUser(db, reviewerUid))) {
      return json({ error: "No access (admin required)" }, 403);
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const id = readString(body.id);
    const action = readString(body.action);

    if (!id) return json({ error: "Missing body.id" }, 400);
    if (action !== "approve" && action !== "reject") {
      return json({ error: "Invalid action" }, 400);
    }

    const applicationRef = db.collection("partnerApplications").doc(id);

    await db.runTransaction(async (tx) => {
      const applicationSnap = await tx.get(applicationRef);
      if (!applicationSnap.exists) throw new Error("Partner application not found");

      const application = applicationSnap.data() ?? {};
      const uid = readString(application.uid);
      if (!uid) throw new Error("Partner application is missing uid");

      const userRef = db.collection("users").doc(uid);
      const reviewedAt = FieldValue.serverTimestamp();

      if (action === "approve") {
        const country = readString(application.country);
        const city = readString(application.city);
        const languages = readStringArray(application.languages);

        tx.update(applicationRef, {
          status: "approved",
          reviewedAt,
          reviewedBy: reviewerUid,
          updatedAt: reviewedAt,
        });

        tx.set(
          userRef,
          {
            partnerAccess: true,
            partnerStatus: "active",
            partnerLevel: "partner",
            partnerRegion: city ? `${city}, ${country}` : country,
            partnerLanguages: languages,
            partnerApprovedAt: reviewedAt,
            partnerApprovedBy: reviewerUid,
            updatedAt: reviewedAt,
          },
          { merge: true }
        );

        return;
      }

      tx.update(applicationRef, {
        status: "rejected",
        reviewedAt,
        reviewedBy: reviewerUid,
        updatedAt: reviewedAt,
      });

      tx.set(
        userRef,
        {
          partnerAccess: false,
          partnerStatus: "rejected",
          updatedAt: reviewedAt,
        },
        { merge: true }
      );
    });

    return json({ ok: true, id, action });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Partner review failed" }, 500);
  }
}
