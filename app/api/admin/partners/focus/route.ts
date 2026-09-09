import "server-only";

import { FieldValue } from "firebase-admin/firestore";
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

function readString(v: unknown, maxLength = 1000): string {
  return typeof v === "string" ? v.trim().slice(0, maxLength) : "";
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

async function isAdminUser(db: FirebaseFirestore.Firestore, uid: string): Promise<boolean> {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) return false;

  const data = snap.data() ?? {};
  const roles = isRecord(data.roles) ? data.roles : {};

  return data.role === "admin" || roles.admin === true;
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

export async function GET(req: Request) {
  try {
    const admin = await requireAdmin(req);
    if ("error" in admin) return admin.error;

    const snap = await admin.db.collection("partnerProgram").doc("monthlyFocus").get();

    return json({
      ok: true,
      focus: snap.exists ? toJsonSafe(snap.data() ?? {}) : null,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Could not load partner focus" }, 500);
  }
}

export async function PATCH(req: Request) {
  try {
    const admin = await requireAdmin(req);
    if ("error" in admin) return admin.error;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const title = readString(body.title, 140);
    const description = readString(body.description, 1200);
    const task = readString(body.task, 1000);
    const meetingUrl = readString(body.meetingUrl, 500);
    const meetingTime = readString(body.meetingTime, 80);
    const onboardingCourseUrl = readString(body.onboardingCourseUrl, 500);

    if (!title) return json({ error: "Title is required" }, 400);
    if (!description) return json({ error: "Description is required" }, 400);

    const updatedAt = FieldValue.serverTimestamp();
    const focusRef = admin.db.collection("partnerProgram").doc("monthlyFocus");

    await admin.db.runTransaction(async (tx) => {
      tx.set(
        focusRef,
        {
          title,
          description,
          task,
          meetingUrl,
          meetingTime,
          onboardingCourseUrl,
          updatedAt,
          updatedBy: admin.adminUid,
        },
        { merge: true }
      );

      tx.set(admin.db.collection("adminAuditEvents").doc(), {
        type: "partner_monthly_focus_updated",
        actorUid: admin.adminUid,
        createdAt: updatedAt,
      });
    });

    return json({
      ok: true,
      focus: {
        title,
        description,
        task,
        meetingUrl,
        meetingTime,
        onboardingCourseUrl,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg || "Could not save partner focus" }, 500);
  }
}
