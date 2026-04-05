// app\api\spaces\[spaceId]\geometry-assign\route.ts
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    spaceId: string;
  }>;
};

type AssignGeometryBody = {
  title?: string;
  description?: string;
  worksheet?: unknown;
};

export async function POST(req: Request, context: RouteContext) {
  try {
    const { spaceId } = await context.params;

    const authHeader =
      req.headers.get("authorization") ||
      req.headers.get("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const idToken = authHeader.slice(7).trim();
    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(idToken);
    const uid = decoded.uid;

    const body = (await req.json()) as AssignGeometryBody;
    const title =
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim()
        : "Geometry worksheet";
    const description =
      typeof body.description === "string" ? body.description.trim() : "";
    const worksheet = body.worksheet;

    if (!spaceId) {
      return NextResponse.json(
        { ok: false, error: "Missing spaceId" },
        { status: 400 }
      );
    }

    if (!worksheet || typeof worksheet !== "object") {
      return NextResponse.json(
        { ok: false, error: "Missing worksheet" },
        { status: 400 }
      );
    }

    const spaceRef = db.collection("spaces").doc(spaceId);
    const spaceSnap = await spaceRef.get();

    if (!spaceSnap.exists) {
      return NextResponse.json(
        { ok: false, error: "Space not found" },
        { status: 404 }
      );
    }

    const lessonRef = spaceRef.collection("lessons").doc();
    const now = new Date();

    await lessonRef.set({
      title,
      description,
      ownerId: uid,
      assignedByUid: uid,

      sourceType: "geometry_generator",
      lessonType: "math_geometry",
      taskType: "math_geometry",

      mathWorksheet: worksheet,

      status: "published",
      isActive: true,

      createdAt: now,
      updatedAt: now,
      assignedAt: now,
    });

    return NextResponse.json({
      ok: true,
      assignmentId: lessonRef.id,
      spaceId,
    });
  } catch (err) {
    console.error("geometry-assign failed:", err);

    return NextResponse.json(
      { ok: false, error: "Failed to assign geometry worksheet" },
      { status: 500 }
    );
  }
}