import { accountErrorStatus } from "@/lib/security/accountAccess.server";
import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";
import { getSpaceAccess } from "@/lib/security/spaceAccess.server";
import { matchesTransferredSchoolSubmission, transferredSchoolParticipant } from "@/lib/server/transferredSchoolSubmissions";

function serialize(value: unknown): unknown {
  if (value instanceof Timestamp) return { seconds: value.seconds, nanoseconds: value.nanoseconds };
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  return value;
}

// Cross-Space client queries cannot prove membership for every possible result.
// Account-owned records and explicitly transferred pupil history are loaded within their room scope.
export async function GET(req: Request) {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const source = new URL(req.url).searchParams.get("source");
  if (source !== "submissions" && source !== "spaceSubmissions") return NextResponse.json({ error: "Invalid source" }, { status: 400 });
  const { auth, db } = getAdmin();
  let decoded;
  try { decoded = await auth.verifyIdToken(token, true); }
  catch (accountError) { return NextResponse.json({ error: "Unauthorized" }, { status: (accountErrorStatus(accountError) ?? 401) }); }
  const uid = decoded.uid;
  const submissions = db.collection(source);
  const [snapshot, transfers] = await Promise.all([
    submissions.where("uid", "==", uid).get(),
    source === "spaceSubmissions" ? db.collection("spaceMembers").where("schoolPupilAccountUid", "==", uid).get() : null,
  ]);
  const transferRooms = (transfers?.docs ?? []).flatMap(doc => {
    const data = doc.data();
    return typeof data.spaceId === "string" && data.spaceId && !data.spaceId.includes("/")
      && data.uid === uid && doc.id === data.spaceId + "_" + uid ? [data.spaceId] : [];
  });
  const spaceIds = new Set([...transferRooms, ...snapshot.docs.map(doc => doc.get("spaceId")).filter(
    (id): id is string => typeof id === "string" && !!id && !id.includes("/"),
  )]);
  const access = new Map(await Promise.all([...spaceIds].map(async id =>
    [id, await getSpaceAccess(db, id, uid, undefined, decoded)] as const)));
  const owned = snapshot.docs.filter(doc => {
    const spaceId = doc.data().spaceId;
    return (source === "submissions" && spaceId === undefined) || (typeof spaceId === "string" && access.get(spaceId)?.canRead === true);
  });
  const transferred = await Promise.all(transferRooms.map(async spaceId => {
    const room = access.get(spaceId);
    if (!room) return [];
    const participantId = await transferredSchoolParticipant(db, spaceId, uid, room);
    if (!participantId) return [];
    const candidates = await submissions.where("spaceId", "==", spaceId).where("participantId", "==", participantId).get();
    const matches = await Promise.all(candidates.docs.filter(doc => doc.get("uid") !== uid).map(async doc =>
      await matchesTransferredSchoolSubmission(db, spaceId, uid, participantId, doc.id, doc.data()) ? doc : null,
    ));
    return matches.filter(doc => doc !== null);
  }));
  const documents = [...owned, ...transferred.flat()].map(doc => ({ id: doc.id, data: serialize(doc.data()) }));
  return NextResponse.json({ documents }, { headers: { "Cache-Control": "private, no-store" } });
}
