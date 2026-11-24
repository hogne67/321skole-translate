"use client";

import { createContext, useEffect, useId, useRef, useState } from "react";
import { collection, onSnapshot, query, Timestamp, where, type QueryDocumentSnapshot } from "firebase/firestore";
import { ChevronDown, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { SpacePupilSession } from "@/components/SpacePupilIdentity";
import { auth, db } from "@/lib/firebase";
import { isStudentCodeMembership, listStudentContentMemberships } from "@/lib/studentContentTasks";
import { readLastStudentSpaceId } from "@/lib/studentLastSpace";

type ConfirmedSpacePupil = { uid: string; status: "active"; spaceId: string; name: string };
type PupilCodeChange = { uid: string; status: "code_changed" };

export const SpacePupilContext = createContext<ConfirmedSpacePupil | PupilCodeChange | null>(null);

function schoolCodeWasChanged(rows: QueryDocumentSnapshot[], uid: string) {
  const schoolRooms = rows.filter((row) => {
    const member = row.data();
    return member.uid === uid && member.role === "student" && member.schoolPupilCodeAccess === true
      && typeof member.spaceId === "string" && row.id === `${member.spaceId}_${uid}`;
  });
  const updatedAt = (row: QueryDocumentSnapshot) => {
    const value = row.get("updatedAt");
    return value instanceof Timestamp ? value.toMillis() : 0;
  };
  const latest = schoolRooms.sort((a, b) => updatedAt(b) - updatedAt(a))[0]?.data();
  return latest?.status === "school_code_rotated" && latest.active === false && latest.archived === true;
}

export function useSpacePupilAccess(uid: string | null, currentRoomId: string | null) {
  const [confirmed, setConfirmed] = useState<{
    uid: string;
    pupils: ConfirmedSpacePupil[];
    codeChange: PupilCodeChange | null;
  } | null>(null);
  useEffect(() => {
    if (!uid) return;
    const update = (pupils: ConfirmedSpacePupil[], codeWasChanged = false) => {
      if (auth.currentUser?.uid === uid && auth.currentUser.isAnonymous) {
        setConfirmed({ uid, pupils, codeChange: codeWasChanged ? { uid, status: "code_changed" } : null });
      }
    };
    const memberships = query(collection(db, "spaceMembers"), where("uid", "==", uid));
    return onSnapshot(memberships, { includeMetadataChanges: true }, (snapshot) => {
      if (snapshot.metadata.fromCache) {
        update([]);
        return;
      }
      const rows = snapshot.docs.filter((row) => !row.metadata.hasPendingWrites && isStudentCodeMembership(row.data()));
      const aliases = new Map(rows.map((row) => [row.id, row.get("displayName")]));
      const pupils = listStudentContentMemberships(rows, uid).map(({ spaceId }): ConfirmedSpacePupil => {
        const alias = aliases.get(`${spaceId}_${uid}`);
        return { uid, status: "active", spaceId, name: typeof alias === "string" ? alias.trim() : "" };
      });
      update(pupils, pupils.length === 0 && schoolCodeWasChanged(rows, uid));
    }, () => update([]));
  }, [uid]);

  if (!uid || confirmed?.uid !== uid) return null;
  if (!confirmed.pupils.length) return confirmed.codeChange;
  const preferredRoomId = currentRoomId ?? readLastStudentSpaceId();
  return confirmed.pupils.find(({ spaceId }) => spaceId === preferredRoomId) ?? confirmed.pupils[0];
}

export default function SpacePupilMenu({ name }: { name: string }) {
  const t = useTranslations("topNav");
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  return (
    <div ref={root} className="relative" onKeyDown={(event) => {
      if (!open || event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    }}>
      <button
        ref={trigger}
        type="button"
        aria-label={t("pupilMenu")}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((previous) => !previous)}
        className="inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-full border border-solid border-emerald-200 bg-white px-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:px-3"
      >
        <UserRound className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden="true" />
        {name ? (
          <>
            <span className="sm:hidden">{t("pupil")}</span>
            <span className="hidden max-w-[9rem] truncate sm:block">{name}</span>
          </>
        ) : <span>{t("pupil")}</span>}
        <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      </button>
      <div id={panelId} hidden={!open} className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-3rem)] rounded-xl shadow-xl">
        {open ? <SpacePupilSession name={name} returnToContent /> : null}
      </div>
    </div>
  );
}
