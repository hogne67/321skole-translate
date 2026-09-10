import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";

type CurrentRole = "teacher" | "parent" | "student" | "other";

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

function readString(v: unknown, maxLength: number): string {
  return typeof v === "string" ? v.trim().slice(0, maxLength) : "";
}

function readLanguages(v: unknown): string[] {
  const values = Array.isArray(v)
    ? v
    : typeof v === "string"
      ? v.split(",")
      : [];

  return Array.from(
    new Set(
      values
        .map((item) => readString(item, 40))
        .filter(Boolean)
        .slice(0, 12)
    )
  );
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

function readAvailability(v: unknown): "low" | "medium" | "high" {
  if (v === "low" || v === "medium" || v === "high") return v;
  return "medium";
}

function readCurrentRole(v: unknown): CurrentRole {
  if (v === "teacher" || v === "parent" || v === "student" || v === "other") return v;
  return "other";
}

function isAdminProfile(data: Record<string, unknown>): boolean {
  const roles = data.roles && typeof data.roles === "object" ? data.roles as Record<string, unknown> : {};
  return data.role === "admin" || roles.admin === true;
}

export async function POST(req: Request) {
  try {
    const token = getBearerToken(req);
    if (!token) return json({ error: "Missing Authorization Bearer token" }, 401);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;
    if (!uid) return json({ error: "Unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const authEmail = readString(decoded.email, 160);
    const requestedEmail = readString(body.email, 160);
    const email = authEmail || requestedEmail;
    const name = readString(body.name, 120);
    const city = readString(body.city, 80);
    const country = readString(body.country, 80);
    const languages = readLanguages(body.languages);
    const currentRole = readCurrentRole(body.currentRole);
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

    if (!name) return json({ error: "Name is required" }, 400);
    if (!email) return json({ error: "Email is required" }, 400);
    if (
      authEmail &&
      requestedEmail &&
      requestedEmail.toLowerCase() !== authEmail.toLowerCase()
    ) {
      return json({
        error:
          "Email must match the signed-in user. Open the invitation in the candidate's own account.",
      }, 400);
    }
    if (!city) return json({ error: "City/place is required" }, 400);
    if (!country) return json({ error: "Country is required" }, 400);
    if (languages.length === 0) return json({ error: "At least one language is required" }, 400);

    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    const userData = userSnap.data() ?? {};
    const profileEmail = readString(userData.email, 160);

    if (isAdminProfile(userData)) {
      return json({
        error:
          "Admin users cannot submit partner applications. Send the invitation link to the candidate instead.",
      }, 400);
    }
    if (
      authEmail &&
      profileEmail &&
      profileEmail.toLowerCase() !== authEmail.toLowerCase()
    ) {
      return json({
        error:
          "Your profile email does not match the signed-in account. Contact 321school before applying.",
      }, 409);
    }

    const applicationRef = db.collection("partnerApplications").doc();
    const profilePatch: Record<string, unknown> = {
      partnerStatus: "pending",
      partnerAccess: false,
      partnerLevel: "none",
      partnerRoles,
      partnerCompetenceAreas,
      partnerContributionTypes,
      partnerAvailability,
      partnerProfileBio,
      partnerDirectoryVisible,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (!userSnap.exists) {
      profilePatch.email = authEmail;
      profilePatch.displayName = readString(decoded.name, 120) || name;
      profilePatch.createdAt = FieldValue.serverTimestamp();
    }

    await db.runTransaction(async (tx) => {
      tx.set(applicationRef, {
        uid,
        email,
        name,
        city,
        country,
        languages,
        currentRole,
        partnerRoles,
        partnerCompetenceAreas,
        partnerContributionTypes,
        partnerAvailability,
        partnerProfileBio,
        partnerDirectoryVisible,
        status: "pending",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      tx.set(
        userRef,
        profilePatch,
        { merge: true }
      );
    });

    return json({ ok: true, id: applicationRef.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Partner application failed" }, 500);
  }
}
