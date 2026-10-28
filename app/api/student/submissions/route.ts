import { accountErrorStatus } from "@/lib/security/accountAccess.server";
import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import { getSpaceAccess } from "@/lib/security/spaceAccess.server";

function serialize(value: unknown): unknown {
  if (value instanceof Timestamp) return { seconds: value.seconds, nanoseconds: value.nanoseconds };
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  return value;
}

// Cross-Space client queries cannot prove membership for every possible result.
// Only the authenticated user's own records are loaded, then each Space is checked.
export async function GET(req: Request) {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const source = new URL(req.url).searchParams.get("source");
  if (source !== "submissions" && source !== "spaceSubmissions") return NextResponse.json({ error: "Invalid source" }, { status: 400 });
  const { auth, db } = getAdmin();
  let decoded;
  try { decoded = await auth.verifyIdToken(token, true); }
  catch (accountError) { return NextResponse.json({ error: "Unauthorized" }, { status: (accountErrorStatus(accountError) ?? 401) }); }
  const snapshot = await db.collection(source).where("uid", "==", decoded.uid).get();
  const spaceIds = new Set(snapshot.docs.map(doc => doc.data().spaceId).filter((id): id is string => typeof id === "string" && !!id && !id.includes("/")));
  const access = new Map(await Promise.all([...spaceIds].map(async id => [id, (await getSpaceAccess(db, id, decoded.uid)).canRead] as const)));
  const documents = snapshot.docs.filter(doc => {
    const spaceId = doc.data().spaceId;
    return source === "submissions" && spaceId === undefined || typeof spaceId === "string" && access.get(spaceId) === true;
  }).map(doc => ({ id: doc.id, data: serialize(doc.data()) }));
  return NextResponse.json({ documents }, { headers: { "Cache-Control": "private, no-store" } });
}
