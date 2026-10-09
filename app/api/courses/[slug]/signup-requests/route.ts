import "server-only";

import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { registerCourseSignup } from "@/lib/courses/registerSignup";
import { sendCourseConfirmation } from "@/lib/courses/confirmationEmail";
import { sendEmail } from "@/lib/email/resend";
import { CourseFullError } from "@/lib/courses/registration";

type SignupBody = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  message?: unknown;
  website?: unknown;
  locale?: unknown;
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    if (!slug) return json({ error: "Missing slug" }, 400);

    const body = (await req.json().catch(() => ({}))) as SignupBody;
    if (safeString(body.website)) {
      return json({ ok: true }, 200);
    }

    const name = safeString(body.name).slice(0, 120);
    const email = safeString(body.email).toLowerCase().slice(0, 180);
    const phone = safeString(body.phone).slice(0, 60);
    const message = safeString(body.message).slice(0, 1000);

    if (!name) return json({ error: "Name is required" }, 400);
    if (!email || !validEmail(email)) return json({ error: "Valid email is required" }, 400);

    const { db } = getAdmin();
    const courseSnap = await db.collection("courses").where("slug", "==", slug).limit(1).get();
    const courseDoc = courseSnap.docs[0];
    if (!courseDoc) return json({ error: "Course not found" }, 404);

    const course = courseDoc.data();
    if (course.status !== "published" && course.status !== "active") {
      return json({ error: "Course is not open for requests" }, 403);
    }

    const locale = ["nb", "en", "pt"].includes(safeString(body.locale)) ? safeString(body.locale) : "nb";
    const result = await registerCourseSignup(db, courseDoc.id, { name, email, phone, message, locale });
    let emailStatus: string | undefined;
    if (result.created) {
      emailStatus = await sendCourseConfirmation({
        db, courseId: courseDoc.id, requestId: result.requestId,
        origin: process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || new URL(req.url).origin,
        locale, send: sendEmail, once: true, ...(result.accepted ? {} : { kind: "receipt" as const }),
      }).catch(() => "failed");
    }
    return json({ ok: true, accepted: result.accepted, duplicate: !result.created, emailStatus }, 200);
  } catch (error) {
    if (error instanceof CourseFullError) return json({ error: "Course is full", code: "course_full" }, 409);
    const message = error instanceof Error ? error.message : "Could not create request";
    return json({ error: message }, 500);
  }
}
