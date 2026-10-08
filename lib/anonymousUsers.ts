export type DirectoryAccount = {
  uid: string;
  displayName?: string;
  email?: string;
  phoneNumber?: string;
  providerData: { providerId: string }[];
  disabled: boolean;
  metadata: { creationTime?: string; lastSignInTime?: string };
};

export type DirectoryMembership = {
  id: string;
  spaceId: string;
  spaceTitle: string;
  roomCode: string;
  displayName: string;
  participantId: string;
  studentCode: string;
  active: boolean;
  anonymousAtJoin: boolean;
  linkedUids: string[];
};

export type AnonymousDirectoryRow = {
  uid: string;
  displayName: string;
  anonymousCandidate: boolean;
  disabled: boolean;
  providers: string[];
  createdAt: string | null;
  lastSignInAt: string | null;
  memberships: DirectoryMembership[];
};

// Admin Auth records have no isAnonymous flag. Membership evidence is displayed separately.
export function isAnonymousCandidate(account: DirectoryAccount) {
  return account.providerData.length === 0 && !account.email && !account.phoneNumber;
}

export function canInspectAnonymousUsers(profile: Record<string, unknown> | null) {
  const roles = profile?.roles;
  return profile?.disabled !== true && (profile?.role === "admin" ||
    (typeof roles === "object" && roles !== null && "admin" in roles && roles.admin === true));
}

export function findLinkedMemberUids(member: Record<string, unknown>, others: Record<string, unknown>[]) {
  const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
  const spaceId = text(member.spaceId);
  const participantId = text(member.participantId);
  const studentCode = text(member.studentCode);
  const uid = text(member.uid) || text(member.userId);
  if (!spaceId) return [];
  return [...new Set(others.filter(other => text(other.spaceId) === spaceId &&
    ((participantId && text(other.participantId) === participantId) || (studentCode && text(other.studentCode) === studentCode)))
    .map(other => text(other.uid) || text(other.userId)).filter(otherUid => otherUid && otherUid !== uid))];
}

export type AnonymousDirectoryDependencies = {
  verifyToken: (token: string) => Promise<{ uid: string; anonymous: boolean }>;
  getProfile: (uid: string) => Promise<Record<string, unknown> | null>;
  listAccounts: (pageToken?: string) => Promise<{ users: DirectoryAccount[]; pageToken?: string }>;
  getAccount: (uid: string) => Promise<DirectoryAccount>;
  getMemberships: (uids: string[]) => Promise<Record<string, DirectoryMembership[]>>;
};

export function createAnonymousDirectoryHandler(dependencies: AnonymousDirectoryDependencies) {
  function json(body: unknown, status = 200) {
    return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
  }
  return async (request: Request) => {
    const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return json({ error: "unauthorized" }, 401);
    let identity: { uid: string; anonymous: boolean };
    try { identity = await dependencies.verifyToken(token); }
    catch { return json({ error: "unauthorized" }, 401); }
    try {
      if (identity.anonymous || !canInspectAnonymousUsers(await dependencies.getProfile(identity.uid))) {
        return json({ error: "admin_required" }, 403);
      }
      const params = new URL(request.url).searchParams;
      const uid = params.get("uid")?.trim();
      const pageToken = params.get("pageToken") || undefined;
      if ((uid && (uid.length > 128 || /[\s/]/.test(uid))) || (pageToken && pageToken.length > 4096)) {
        return json({ error: "invalid_query" }, 400);
      }
      const page = uid ? { users: [await dependencies.getAccount(uid)], pageToken: undefined }
        : await dependencies.listAccounts(pageToken);
      const accounts = uid ? page.users : page.users.filter(isAnonymousCandidate);
      const memberships = accounts.length ? await dependencies.getMemberships(accounts.map(account => account.uid)) : {};
      const rows: AnonymousDirectoryRow[] = accounts.map(account => ({
        uid: account.uid,
        displayName: account.displayName || memberships[account.uid]?.find(member => member.displayName)?.displayName || "",
        anonymousCandidate: isAnonymousCandidate(account),
        disabled: account.disabled,
        providers: account.providerData.map(provider => provider.providerId),
        createdAt: account.metadata.creationTime || null,
        lastSignInAt: account.metadata.lastSignInTime || null,
        memberships: memberships[account.uid] || [],
      }));
      return json({ rows, nextPageToken: page.pageToken || null, scanned: page.users.length });
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? error.code : null;
      if (code === "auth/user-not-found") return json({ error: "uid_not_found" }, 404);
      if (code === "auth/invalid-page-token") return json({ error: "invalid_query" }, 400);
      return json({ error: "lookup_failed" }, 500);
    }
  };
}
