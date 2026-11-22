"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useLocale, useTranslations } from "next-intl";
import SpacePupilIdentity from "@/components/SpacePupilIdentity";
import { Link } from "@/i18n/navigation";
import { auth, db } from "@/lib/firebase";
import {
  listStudentContentMemberships,
  loadStudentContentRoom,
  loadStudentContentRoomChoice,
  type StudentContentRoom,
  type StudentContentRoomChoice,
  type StudentContentTask,
} from "@/lib/studentContentTasks";
import { readLastStudentSpaceId } from "@/lib/studentLastSpace";

type RoomChoicesState = {
  sessionKey: string;
  rooms: StudentContentRoomChoice[];
  lastRoomId: string | null;
  failed: boolean;
};

type AssignmentListState = {
  scopeKey: string;
  rooms: StudentContentRoom[];
  failed: boolean;
};

const noRooms: StudentContentRoomChoice[] = [];
const actionClass = "inline-flex min-h-11 items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700";

function isCurrentSession(uid: string, isAnonymous: boolean) {
  const current = auth.currentUser;
  return current?.uid === uid && current.isAnonymous === isAnonymous;
}

function TaskList({ tasks }: { tasks: StudentContentTask[] }) {
  const t = useTranslations("content.student");
  const locale = useLocale();
  const formatDate = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  return (
    <ul className="m-0 grid list-none gap-2 p-0">
      {tasks.map((task) => {
        const title = task.title ?? t("untitledTask");
        const canContinue = task.status === "draft" || task.status === "needsWork" || task.status === "planningReviewed";
        return (
          <li key={`${task.kind}:${task.id}`} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-solid border-slate-200 bg-white p-3 sm:px-4">
            <div className="min-w-0 flex-1 basis-48">
              <h4 className="m-0 break-words text-base font-semibold text-slate-950">{title}</h4>
              <p className="mb-0 mt-1 flex flex-wrap gap-x-2 gap-y-1 text-sm text-slate-700">
                <span className="font-medium">{t(`status.${task.status}`)}</span>
                {task.dueAt ? <span>{t("due", { date: formatDate.format(task.dueAt) })}</span> : null}
              </p>
            </div>
            <Link href={task.href} className={`${actionClass} bg-emerald-800 text-white hover:bg-emerald-900`}>
              {t(canContinue ? "continueTask" : "openTask")}
              <span className="sr-only"> {title}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default function StudentContentAssignments({
  uid,
  isAnonymous,
  hasOwnWork,
}: {
  uid: string | null;
  isAnonymous: boolean;
  hasOwnWork: boolean;
}) {
  const t = useTranslations("content.student");
  const sessionKey = uid ? `${uid}:${isAnonymous}` : "";
  const [roomChoices, setRoomChoices] = useState<RoomChoicesState | null>(null);
  const [selection, setSelection] = useState<{ sessionKey: string; roomId: string } | null>(null);
  const [assignments, setAssignments] = useState<AssignmentListState | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!uid) return;

    let stopped = false;
    let generation = 0;
    const update = (next: RoomChoicesState | null, version: number) => {
      if (!stopped && version === generation && isCurrentSession(uid, isAnonymous)) {
        setRoomChoices(next);
      }
    };

    const memberships = query(collection(db, "spaceMembers"), where("uid", "==", uid));
    const stop = onSnapshot(memberships, { includeMetadataChanges: true }, (snapshot) => {
      const version = ++generation;
      update(null, version);
      if (snapshot.metadata.fromCache) {
        // A previous session's cached membership is not proof of current access.
        return;
      }

      const approved = listStudentContentMemberships(snapshot.docs, uid);
      const lastRoomId = isAnonymous ? readLastStudentSpaceId() : null;
      void Promise.allSettled(approved.map((member) => loadStudentContentRoomChoice(db, member))).then((results) => {
        const rooms = results.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
        update({ sessionKey, rooms, lastRoomId, failed: results.some((result) => result.status === "rejected") }, version);
      });
    }, () => update({ sessionKey, rooms: [], lastRoomId: null, failed: true }, ++generation));

    return () => {
      stopped = true;
      stop();
    };
  }, [uid, isAnonymous, sessionKey, retry]);

  const choices = roomChoices?.sessionKey === sessionKey ? roomChoices : null;
  const rooms = choices?.rooms ?? noRooms;
  const preferredRoomId = selection?.sessionKey === sessionKey ? selection.roomId : choices?.lastRoomId;
  const selectedRoom = rooms.length === 1 ? rooms[0] : rooms.find((room) => room.spaceId === preferredRoomId);
  const selectedRooms = useMemo(() => selectedRoom ? [selectedRoom] : isAnonymous ? noRooms : rooms, [selectedRoom, isAnonymous, rooms]);
  const scopeKey = JSON.stringify([sessionKey, retry, selectedRooms.map(({ spaceId, participantId }) => [spaceId, participantId])]);

  useEffect(() => {
    if (!uid || selectedRooms.length === 0) return;

    let stopped = false;
    void Promise.allSettled(selectedRooms.map((room) => loadStudentContentRoom(db, room, uid))).then((results) => {
      if (stopped || !isCurrentSession(uid, isAnonymous)) return;
      const rooms = results.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
      setAssignments({ scopeKey, rooms, failed: results.some((result) => result.status === "rejected" || !result.value) });
    });
    return () => { stopped = true; };
  }, [uid, isAnonymous, selectedRooms, scopeKey]);

  const currentAssignments = assignments?.scopeKey === scopeKey ? assignments : null;
  const loading = !!uid && (!choices || (selectedRooms.length > 0 && !currentAssignments));
  const failed = choices?.failed || currentAssignments?.failed;
  if (hasOwnWork && !loading && !failed && rooms.length === 0) return null;

  return (
    <section aria-labelledby="student-content-assignments" className="space-y-3">
      {selectedRoom || (uid && isAnonymous) ? (
        <SpacePupilIdentity
          key={JSON.stringify([sessionKey, selectedRoom?.spaceId, selectedRoom?.participantId])}
          spaceId={selectedRoom?.spaceId ?? null}
          returnToContent
        />
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="student-content-assignments" className="m-0 text-xl font-semibold text-slate-950">{t("assignments")}</h2>
        {rooms.length > 1 ? (
          <label className="flex w-full min-w-0 flex-col gap-1 text-sm font-medium text-slate-700 sm:w-auto">
            {t("selectRoom")}
            <select
              value={selectedRoom?.spaceId ?? ""}
              onChange={(event) => setSelection({ sessionKey, roomId: event.currentTarget.value })}
              className="min-h-11 w-full min-w-0 rounded-lg border border-solid border-slate-300 bg-white px-3 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:min-w-52"
            >
              <option value="" disabled={isAnonymous}>{t(isAnonymous ? "chooseRoom" : "allRooms")}</option>
              {rooms.map((room) => (
                <option key={room.spaceId} value={room.spaceId}>{room.title ?? t("untitledRoom")}</option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {loading ? <p role="status" className="m-0 text-sm text-slate-600">{t("loading")}</p> : null}
      {failed ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">
          <p role="alert" className="m-0">{t("loadFailed")}</p>
          <button
            type="button"
            onClick={() => { setRoomChoices(null); setRetry((previous) => previous + 1); }}
            className={`${actionClass} border border-solid border-slate-300 bg-white text-slate-800`}
          >
            {t("retry")}
          </button>
        </div>
      ) : null}

      {!loading && !failed && rooms.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-solid border-slate-200 bg-white p-3 text-sm text-slate-700">
          <p className="m-0">{t("joinHint")}</p>
          <Link href="/join" className={`${actionClass} bg-emerald-800 text-white hover:bg-emerald-900`}>
            {t("join")}
          </Link>
        </div>
      ) : null}

      {currentAssignments?.rooms.map((room) => {
        const active = room.tasks.filter((task) => !task.archived);
        const archived = room.tasks.filter((task) => task.archived);
        return (
          <div key={room.id} className="space-y-2">
            <h3 className="m-0 break-words text-sm font-semibold text-slate-700">{room.title ?? t("untitledRoom")}</h3>
            {active.length ? <TaskList tasks={active} /> : (
              <p className="m-0 rounded-xl border border-solid border-slate-200 bg-white p-3 text-sm text-slate-600">{t("noAssignments")}</p>
            )}
            {archived.length > 0 ? (
              <details className="rounded-xl border border-solid border-slate-200 bg-white">
                <summary className="cursor-pointer rounded-xl px-3 py-3 text-sm font-medium text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700">
                  {t("archived")}
                </summary>
                <div className="px-3 pb-3"><TaskList tasks={archived} /></div>
              </details>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
