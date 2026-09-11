import "server-only";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { getAdmin } from "@/lib/firebaseAdmin";
import { isActiveSchoolAdminMember } from "@/lib/schools";
import { getSchoolMember, schoolMembersCollectionRef } from "@/lib/schools/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    schoolId?: string;
  }>;
};

type SchoolSpace = {
  id: string;
  title: string;
  code: string;
  isOpen: boolean;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  memberCount: number;
  createdAt: string | null;
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function getBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function timestampToIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value !== null && "toDate" in value) {
    const maybeDate = (value as { toDate?: unknown }).toDate;
    if (typeof maybeDate === "function") {
      const date = maybeDate.call(value);
      return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
    }
  }
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function countActiveMembers(db: FirebaseFirestore.Firestore, spaceId: string): Promise<number> {
  const snap = await db
    .collection("spaceMembers")
    .where("spaceId", "==", spaceId)
    .where("archived", "==", false)
    .get();

  return snap.docs.filter((doc) => {
    const data = doc.data() as { active?: unknown; status?: unknown };
    return data.active !== false && readString(data.status).toLowerCase() !== "removed";
  }).length;
}

export async function GET(req: Request, context: RouteContext) {
  try {
    const authToken = getBearerToken(req);
    if (!authToken) return json({ ok: false, error: "Missing Authorization Bearer token" }, 401);

    const { schoolId: rawSchoolId } = await context.params;
    const schoolId = readString(rawSchoolId);
    if (!schoolId) return json({ ok: false, error: "Missing schoolId" }, 400);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(authToken);
    const uid = decoded.uid;

    const adminMember = await getSchoolMember(schoolId, uid);
    if (!isActiveSchoolAdminMember(adminMember)) {
      return json({ ok: false, error: "Forbidden" }, 403);
    }

    const teacherSnap = await schoolMembersCollectionRef(schoolId)
      .where("role", "==", "school_teacher")
      .where("status", "==", "active")
      .get();

    const teacherByUid = new Map<string, { name: string; email: string }>();
    for (const doc of teacherSnap.docs) {
      const data = doc.data();
      const teacherUid = readString(data.uid) || doc.id;
      if (!teacherUid) continue;
      teacherByUid.set(teacherUid, {
        name: readString(data.displayName) || readString(data.email) || "Teacher",
        email: readString(data.email),
      });
    }

    const teacherUids = Array.from(teacherByUid.keys());
    const spaceDocs = new Map<string, FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>>();

    for (const batch of chunkArray(teacherUids, 10)) {
      const [ownerIdSnap, ownerUidSnap] = await Promise.all([
        db.collection("spaces").where("ownerId", "in", batch).get(),
        db.collection("spaces").where("ownerUid", "in", batch).get(),
      ]);

      for (const doc of ownerIdSnap.docs) spaceDocs.set(doc.id, doc);
      for (const doc of ownerUidSnap.docs) spaceDocs.set(doc.id, doc);
    }

    const schoolTaggedSnap = await db.collection("spaces").where("schoolId", "==", schoolId).get();
    for (const doc of schoolTaggedSnap.docs) spaceDocs.set(doc.id, doc);

    const spaces: SchoolSpace[] = await Promise.all(
      Array.from(spaceDocs.values()).map(async (doc) => {
        const data = doc.data() as Record<string, unknown>;
        const ownerId = readString(data.ownerId) || readString(data.ownerUid);
        const owner = teacherByUid.get(ownerId) ?? { name: "Teacher", email: "" };
        const memberCount = await countActiveMembers(db, doc.id);
        const currentSchoolId = readString(data.schoolId);

        if (teacherByUid.has(ownerId) && !currentSchoolId) {
          await doc.ref.set(
            {
              schoolId,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        }

        return {
          id: doc.id,
          title: readString(data.title) || "Untitled space",
          code: readString(data.code) || readString(data.joinCode),
          isOpen: data.isOpen === true,
          ownerId,
          ownerName: owner.name,
          ownerEmail: owner.email,
          memberCount,
          createdAt: timestampToIso(data.createdAt),
        };
      })
    );

    spaces.sort((a, b) => {
      const aMs = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bMs = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bMs - aMs || a.title.localeCompare(b.title, "nb");
    });

    return json({ ok: true, schoolId, spaces });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ ok: false, error: message || "Failed to load school spaces" }, 500);
  }
}
