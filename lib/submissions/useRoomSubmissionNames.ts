"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isActiveSpaceMember } from "@/lib/security/spaceAccess";

type RoomName = {
  label: string;
  participantId: string;
  schoolPupil: boolean;
  priority: number;
};

type RoomNames = {
  spaceId: string;
  viewerUid: string;
  byParticipant: Map<string, RoomName>;
  byUid: Map<string, RoomName>;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function readSubmissionParticipantId(submission: { participantId?: unknown; auth?: unknown }) {
  const auth = submission.auth;
  return text(submission.participantId) || (auth && typeof auth === "object" && "participantId" in auth
    ? text(auth.participantId)
    : "");
}

function addName(map: Map<string, RoomName>, key: string, name: RoomName) {
  const previous = map.get(key);
  if (key && (!previous || name.priority > previous.priority)) map.set(key, name);
}

export function useRoomSubmissionNames(spaceId: string | undefined, viewerUid: string | null | undefined) {
  const [names, setNames] = useState<RoomNames | null>(null);

  useEffect(() => {
    if (!spaceId || !viewerUid) return;
    const roomMembers = query(collection(db, "spaceMembers"), where("spaceId", "==", spaceId));

    return onSnapshot(roomMembers, { includeMetadataChanges: true }, snapshot => {
      if (snapshot.metadata.fromCache) return;
      const byParticipant = new Map<string, RoomName>();
      const byUid = new Map<string, RoomName>();
      const memberPrefix = spaceId + "_";
      for (const document of snapshot.docs) {
        const data = document.data();
        if (data.role && data.role !== "student") continue;
        const schoolPupil = Boolean(text(data.schoolPupilId));
        const label = text(data.displayName) || text(data.studentName) || (schoolPupil ? "" : text(data.name) || text(data.fullName));
        if (!label) continue;
        const participantId = text(data.participantId);
        const uid = document.id.startsWith(memberPrefix) ? document.id.slice(memberPrefix.length) : "";
        const memberUid = text(data.uid) || text(data.userId);
        const priority = schoolPupil && data.schoolPupilRegistration === true ? 2 : Number(isActiveSpaceMember(data));
        const name = { label, participantId, schoolPupil, priority };
        addName(byParticipant, participantId, name);
        if (data.schoolPupilRegistration !== true && (!memberUid || uid === memberUid)) {
          addName(byUid, uid, name);
        }
      }
      setNames({ spaceId, viewerUid, byParticipant, byUid });
    }, () => setNames(null));
  }, [spaceId, viewerUid]);

  return (participantId: string, uid: string | null | undefined) => {
    if (!names || names.spaceId !== spaceId || names.viewerUid !== viewerUid) return undefined;
    const registered = names.byParticipant.get(participantId);
    if (registered) return registered;
    const account = names.byUid.get(text(uid));
    if (account && (!participantId || !account.participantId || account.participantId === participantId)) return account;
    return undefined;
  };
}
