import "server-only";
import { getAdmin } from "@/lib/firebaseAdmin";
import { createAnonymousDirectoryHandler, findLinkedMemberUids, type DirectoryMembership } from "@/lib/anonymousUsers";

export const runtime = "nodejs";

function string(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function chunks<T>(values: T[], size = 30) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}

export const GET = createAnonymousDirectoryHandler({
  async verifyToken(token) {
    const decoded = await getAdmin().auth.verifyIdToken(token, true);
    return { uid: decoded.uid, anonymous: decoded.firebase?.sign_in_provider === "anonymous" };
  },
  async getProfile(uid) {
    const snapshot = await getAdmin().db.collection("users").doc(uid).get();
    return snapshot.exists ? snapshot.data() || null : null;
  },
  async listAccounts(pageToken) { return getAdmin().auth.listUsers(200, pageToken); },
  async getAccount(uid) { return getAdmin().auth.getUser(uid); },
  async getMemberships(uids) {
    const { db } = getAdmin();
    const batchSnapshots = await Promise.all(chunks(uids).flatMap(batch => [
      db.collection("spaceMembers").where("uid", "in", batch).get(),
      db.collection("spaceMembers").where("userId", "in", batch).get(),
    ]));
    const members = new Map(batchSnapshots.flatMap(snapshot => snapshot.docs.map(doc => [doc.id, doc] as const)));
    const data = Array.from(members.values()).map(doc => ({ ...doc.data(), id: doc.id } as Record<string, unknown>));
    const spaceIds = [...new Set(data.map(member => string(member.spaceId)).filter(Boolean))];
    const spaces = spaceIds.length ? await db.getAll(...spaceIds.map(id => db.collection("spaces").doc(id))) : [];
    const spaceById = new Map(spaces.map(space => [space.id, space.data() || {}]));
    const participantIds = [...new Set(data.map(member => string(member.participantId)).filter(Boolean))];
    const codeKeys = [...new Set(data.map(member => {
      const spaceId = string(member.spaceId);
      const code = string(member.studentCode);
      return string(member.studentCodeKey) || (spaceId && code ? `${spaceId}:${code}` : "");
    }).filter(Boolean))];
    const linkedSnapshots = await Promise.all([
      ...chunks(participantIds).map(batch => db.collection("spaceMembers").where("participantId", "in", batch).get()),
      ...chunks(codeKeys).map(batch => db.collection("spaceMembers").where("studentCodeKey", "in", batch).get()),
    ]);
    const linked = [...data, ...linkedSnapshots.flatMap(snapshot => snapshot.docs.map(doc => doc.data()))];
    const result: Record<string, DirectoryMembership[]> = {};
    for (const member of data) {
      const spaceId = string(member.spaceId);
      const space = spaceById.get(spaceId);
      const participantId = string(member.participantId);
      const studentCode = string(member.studentCode);
      const linkedUids = findLinkedMemberUids(member, linked);
      const membership: DirectoryMembership = {
        id: string(member.id), spaceId, spaceTitle: string(space?.title),
        roomCode: string(space?.joinCode) || string(space?.code), displayName: string(member.displayName),
        participantId, studentCode, linkedUids,
        active: member.archived !== true && member.active !== false && !["removed", "linked"].includes(string(member.status).toLowerCase()),
        anonymousAtJoin: member.isAnon === true,
      };
      for (const targetUid of new Set([string(member.uid), string(member.userId)].filter(target => uids.includes(target)))) {
        (result[targetUid] ||= []).push(membership);
      }
    }
    return result;
  },
});
