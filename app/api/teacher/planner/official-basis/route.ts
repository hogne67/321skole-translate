import "server-only";

import { NextResponse } from "next/server";
import { hasAdminAccess } from "@/lib/courses/academyAccess";
import { getAdmin } from "@/lib/firebaseAdmin";
import { fetchOfficialCurriculumBasis } from "@/lib/planner/officialCurriculum";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export async function POST(request: Request) {
  try {
    const token = bearerToken(request);
    if (!token) return json({ error: "Du må være logget inn." }, 401);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const profileSnap = await db.collection("users").doc(decoded.uid).get();
    const profile = profileSnap.exists ? profileSnap.data() ?? {} : {};
    const roles = isRecord(profile.roles) ? profile.roles : {};
    if (profile.role !== "teacher" && roles.teacher !== true && !hasAdminAccess(profile)) {
      return json({ error: "Denne funksjonen er bare tilgjengelig for lærere." }, 403);
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const country = typeof body.country === "string" ? body.country.trim() : "";
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const level = typeof body.level === "string" ? body.level.trim() : "";
    if (country !== "Norge") {
      return json({ error: "Automatisk, verifisert oppslag er foreløpig bare tilgjengelig for Norge." }, 422);
    }
    if (!subject || !level) return json({ error: "Fag og trinn mangler." }, 400);

    const basis = await fetchOfficialCurriculumBasis({ subject, level });
    return json({ basis });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Det offisielle grunnlaget kunne ikke hentes.";
    return json({ error: message }, 422);
  }
}
