import "server-only";

import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { createHash } from "node:crypto";

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

    const now = new Date();
    await db.runTransaction(async (tx) => {
      const requests = courseDoc.ref.collection("signupRequests");
      const existing = await tx.get(requests.where("email", "==", email));
      // Repeated form submissions must not create a new request or reset an approval.
      if (!existing.empty) return;
      const requestRef = requests.doc(`email-${createHash("sha256").update(email).digest("hex")}`);
      tx.set(requestRef, {
        name, email, phone, message,
        locale: ["nb", "en", "pt"].includes(safeString(body.locale)) ? safeString(body.locale) : "nb",
        status: "new", createdAt: now, updatedAt: now,
      });
    });

    return json({ ok: true }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create request";
    return json({ error: message }, 500);
  }
}
