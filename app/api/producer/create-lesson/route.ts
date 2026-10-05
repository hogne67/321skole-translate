import "server-only";
import { NextResponse } from "next/server";
import type { DecodedIdToken } from "firebase-admin/auth";
import { getAdmin } from "@/lib/firebaseAdmin";
import { createLessonForUser } from "@/lib/lessons/server/createLessonForUser";
import { LessonError } from "@/lib/lessons/validation";

export async function POST(req: Request) {
  try {
    const header = req.headers.get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    const { auth, db } = getAdmin();
    let decoded: DecodedIdToken;
    try {
      decoded = await auth.verifyIdToken(token, true);
    } catch {
      return NextResponse.json({ error: "Invalid or expired token." }, { status: 401 });
    }
    let input: unknown;
    try {
      input = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
    }
    return NextResponse.json(await createLessonForUser(decoded, input, db));
  } catch (error: unknown) {
    if (error instanceof LessonError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Create lesson failed", error);
    return NextResponse.json({ error: "Could not create lesson." }, { status: 500 });
  }
}
