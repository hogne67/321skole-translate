import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { getAdmin } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

const PARTNER_ROLES = new Set([
  "teacher",
  "parent",
  "school_leader",
  "developer",
  "content_creator",
  "marketing_sales",
  "researcher",
]);

const COMPETENCE_AREAS = new Set([
  "ai_learning",
  "content",
  "math",
  "a1_start",
  "quiz",
  "images_video",
  "parents",
  "assessment",
  "languages",
  "marketing",
  "sales",
]);

const CONTRIBUTION_TYPES = new Set([
  "test_features",
  "give_feedback",
  "create_content",
  "share_321school",
  "school_contacts",
  "translate",
  "social_media",
  "local_market_insight",
]);

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  const m = h?.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function readString(v: unknown, maxLength = 1000): string {
  return typeof v === "string" ? v.trim().slice(0, maxLength) : "";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isAdminProfile(data: Record<string, unknown>): boolean {
  const roles = isRecord(data.roles) ? data.roles : {};
  return data.role === "admin" || roles.admin === true;
}

function readAllowedArray(v: unknown, allowed: Set<string>, maxItems = 12): string[] {
  if (!Array.isArray(v)) return [];

  return Array.from(
    new Set(
      v
        .map((item) => readString(item, 80))
        .filter((item) => allowed.has(item))
        .slice(0, maxItems)
    )
  );
}

function readAvailability(v: unknown): "low" | "medium" | "high" | null {
  if (v === "low" || v === "medium" || v === "high") return v;
  return null;
}

async function requireActivePartner(req: Request) {
  const token = getBearerToken(req);
  if (!token) return { error: json({ error: "Missing Authorization Bearer token" }, 401) };

  const { auth, db } = getAdmin();
  const decoded = await auth.verifyIdToken(token);
  const uid = decoded.uid;
  const authEmail = readString(decoded.email, 160).toLowerCase();
  if (!uid) return { error: json({ error: "Unauthorized" }, 401) };

  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  const userData = userSnap.data() ?? {};
  const profileEmail = readString(userData.email, 160).toLowerCase();

  if (isAdminProfile(userData)) {
    return { error: json({ error: "Admin users cannot use partner profile tools" }, 403) };
  }

  if (authEmail && profileEmail && authEmail !== profileEmail) {
    return { error: json({ error: "Profile email does not match the signed-in account" }, 409) };
  }

  if (userData.partnerAccess !== true || userData.partnerStatus !== "active") {
    return { error: json({ error: "No active partner access" }, 403) };
  }

  return { db, uid, userRef };
}

export async function PATCH(req: Request) {
  try {
    const partner = await requireActivePartner(req);
    if ("error" in partner) return partner.error;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const partnerRoles = readAllowedArray(body.partnerRoles, PARTNER_ROLES);
    const partnerCompetenceAreas = readAllowedArray(
      body.partnerCompetenceAreas,
      COMPETENCE_AREAS
    );
    const partnerContributionTypes = readAllowedArray(
      body.partnerContributionTypes,
      CONTRIBUTION_TYPES
    );
    const partnerAvailability = readAvailability(body.partnerAvailability);
    const partnerProfileBio = readString(body.partnerProfileBio, 800);
    const partnerDirectoryVisible = body.partnerDirectoryVisible === true;

    if (!partnerAvailability) {
      return json({ error: "Invalid partnerAvailability" }, 400);
    }

    const updatedAt = FieldValue.serverTimestamp();

    await partner.db.runTransaction(async (tx) => {
      tx.set(
        partner.userRef,
        {
          partnerRoles,
          partnerCompetenceAreas,
          partnerContributionTypes,
          partnerAvailability,
          partnerProfileBio,
          partnerDirectoryVisible,
          partnerProfileUpdatedAt: updatedAt,
          updatedAt,
        },
        { merge: true }
      );

      tx.set(partner.db.collection("adminAuditEvents").doc(), {
        type: "partner_profile_updated",
        targetUid: partner.uid,
        actorUid: partner.uid,
        createdAt: updatedAt,
      });
    });

    return json({
      ok: true,
      profile: {
        partnerRoles,
        partnerCompetenceAreas,
        partnerContributionTypes,
        partnerAvailability,
        partnerProfileBio,
        partnerDirectoryVisible,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Could not update partner profile" }, 500);
  }
}
