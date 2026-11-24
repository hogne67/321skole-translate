"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { ChevronDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import SpacePupilIdentity from "@/components/SpacePupilIdentity";
import { Link } from "@/i18n/navigation";
import { auth, db } from "@/lib/firebase";
import {
  listStudentContentMemberships,
  watchStudentContentRoom,
  type StudentContentRoomUpdate,
  type StudentContentTask,
} from "@/lib/studentContentTasks";
import { readLastStudentSpaceId, saveLastStudentSpaceId } from "@/lib/studentLastSpace";
import { onStudentRoomReturn, refreshSchoolStudentRooms } from "@/lib/studentRoomRefresh";

type ContentState = {
  scopeKey: string;
  rooms: StudentContentRoomUpdate[];
  lastRoomId: string | null;
  failed: boolean;
};

type RoomWatch = {
  participantId: string;
  state: StudentContentRoomUpdate;
  stop: () => void;
};

type RoomTask = StudentContentTask & {
  roomId: string;
  roomTitle: string | null;
};

const schoolRoomRefreshMs = 30_000;
const actionClass = "inline-flex min-h-11 items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700";

function isCurrentSession(uid: string, isAnonymous: boolean) {
  const current = auth.currentUser;
  return current?.uid === uid && current.isAnonymous === isAnonymous;
}

function TaskList({ tasks }: { tasks: RoomTask[] }) {
  const t = useTranslations("content.student");
  const locale = useLocale();
  const formatDate = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  return (
    <ul className="m-0 grid list-none gap-2 p-0">
      {tasks.map((task) => {
        const title = task.title ?? t("untitledTask");
        const roomTitle = task.roomTitle ?? t("untitledRoom");
        const canContinue = task.status === "draft" || task.status === "needsWork" || task.status === "planningReviewed";
        return (
          <li key={`${task.roomId}:${task.kind}:${task.id}`} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-solid border-slate-200 bg-white p-3 sm:px-4">
            <div className="min-w-0 flex-1 basis-48">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h3 className="m-0 min-w-0 break-words text-base font-semibold text-slate-950">{title}</h3>
                <span className="max-w-full break-words rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{roomTitle}</span>
              </div>
              <p className="mb-0 mt-1 flex flex-wrap gap-x-2 gap-y-1 text-sm text-slate-700">
                <span className="font-medium">{t(`status.${task.status}`)}</span>
                {task.dueAt ? <span>{t("due", { date: formatDate.format(task.dueAt) })}</span> : null}
              </p>
            </div>
            <Link href={task.href} className={`${actionClass} bg-emerald-800 text-white hover:bg-emerald-900`}>
              {t(canContinue ? "continueTask" : "openTask")}
              <span className="sr-only"> {title} ({roomTitle})</span>
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
  const [selection, setSelection] = useState<{ sessionKey: string; roomId: string } | null>(null);
  const [content, setContent] = useState<ContentState | null>(null);
  const [retry, setRetry] = useState(0);
  const scopeKey = JSON.stringify([sessionKey, retry]);

  useEffect(() => {
    if (!uid) return;

    const watches = new Map<string, RoomWatch>();
    const refreshController = new AbortController();
    let stopped = false;
    let syncingRooms = false;
    let hasSchoolCodeAccess = false;
    const refreshRooms = () => {
      const current = auth.currentUser;
      if (stopped || syncingRooms || current?.uid !== uid || current.isAnonymous !== isAnonymous) return;
      syncingRooms = true;
      void refreshSchoolStudentRooms(current, refreshController.signal).catch(() => {}).finally(() => {
        syncingRooms = false;
      });
    };
    refreshRooms();
    const stopRefresh = onStudentRoomReturn(refreshRooms);
    // Enrollments added by a teacher become room memberships after this server check.
    const refreshTimer = window.setInterval(() => {
      if (hasSchoolCodeAccess && document.visibilityState === "visible") refreshRooms();
    }, schoolRoomRefreshMs);

    const clearWatches = () => {
      hasSchoolCodeAccess = false;
      for (const watch of watches.values()) watch.stop();
      watches.clear();
    };
    const publish = (failed = false) => {
      if (stopped || !isCurrentSession(uid, isAnonymous)) return;
      setContent({
        scopeKey,
        rooms: Array.from(watches.values(), (watch) => watch.state),
        lastRoomId: isAnonymous ? readLastStudentSpaceId() : null,
        failed,
      });
    };

    const memberships = query(collection(db, "spaceMembers"), where("uid", "==", uid));
    const stop = onSnapshot(memberships, { includeMetadataChanges: true }, (snapshot) => {
      if (stopped || !isCurrentSession(uid, isAnonymous)) return;
      if (snapshot.metadata.fromCache) {
        // A previous session's cached membership is not proof of current access.
        clearWatches();
        setContent(null);
        return;
      }

      const rows = snapshot.docs.filter((row) => !row.metadata.hasPendingWrites);
      const approved = listStudentContentMemberships(rows, uid);
      const participants = new Map(approved.map(({ spaceId, participantId }) => [spaceId, participantId]));
      const codeMemberships = new Set(rows.filter((row) => row.get("schoolPupilCodeAccess") === true).map((row) => row.id));
      hasSchoolCodeAccess = approved.some(({ spaceId }) => codeMemberships.has(`${spaceId}_${uid}`));

      for (const [spaceId, watch] of watches) {
        if (participants.get(spaceId) === watch.participantId) continue;
        watch.stop();
        watches.delete(spaceId);
      }
      for (const member of approved) {
        const { spaceId, participantId } = member;
        if (watches.has(spaceId)) continue;
        const watch: RoomWatch = {
          participantId,
          state: { status: "loading" },
          stop: watchStudentContentRoom(db, member, uid, (state) => {
            if (watches.get(spaceId) !== watch) return;
            watch.state = state;
            publish();
          }),
        };
        watches.set(spaceId, watch);
      }
      publish();
    }, () => {
      clearWatches();
      publish(true);
    });

    return () => {
      stopped = true;
      refreshController.abort();
      window.clearInterval(refreshTimer);
      stopRefresh();
      stop();
      clearWatches();
    };
  }, [uid, isAnonymous, scopeKey]);

  const current = content?.scopeKey === scopeKey ? content : null;
  const rooms = current?.rooms.flatMap(({ choice }) => choice ? [choice] : []) ?? [];
  const selectedRoom = selection?.sessionKey === sessionKey
    ? rooms.find((room) => room.spaceId === selection.roomId)
    : undefined;
  const selectedRoomId = selectedRoom?.spaceId ?? "";
  const identityRoom = selectedRoom
    ?? rooms.find((room) => room.spaceId === current?.lastRoomId)
    ?? (isAnonymous || rooms.length === 1 ? rooms[0] : undefined);
  const visibleTasks = useMemo(() => {
    return (current?.rooms ?? [])
      .flatMap((room) => {
        if (room.status !== "ready" || (selectedRoomId && room.choice.spaceId !== selectedRoomId)) return [];
        const { spaceId, title } = room.choice;
        return room.tasks.map((task): RoomTask => ({ ...task, roomId: spaceId, roomTitle: title }));
      })
      .sort((a, b) => (b.assignedAt ?? -Infinity) - (a.assignedAt ?? -Infinity)
        || a.roomId.localeCompare(b.roomId)
        || a.kind.localeCompare(b.kind)
        || a.id.localeCompare(b.id));
  }, [current, selectedRoomId]);
  const activeTasks = visibleTasks.filter((task) => !task.archived);
  const archivedTasks = visibleTasks.filter((task) => task.archived);
  const loading = !!uid && (!current || current.rooms.some((room) =>
    room.status === "loading" && (!selectedRoomId || room.choice?.spaceId === selectedRoomId)));
  const failed = current?.failed || current?.rooms.some((room) => room.status === "error");
  if (hasOwnWork && !loading && !failed && rooms.length === 0) return null;

  return (
    <section aria-labelledby="student-content-assignments" className="space-y-3">
      {identityRoom || (uid && isAnonymous) ? (
        <SpacePupilIdentity
          key={JSON.stringify([sessionKey, identityRoom?.spaceId, identityRoom?.participantId])}
          spaceId={identityRoom?.spaceId ?? null}
          returnToContent
        />
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="student-content-assignments" className="m-0 text-xl font-semibold text-slate-950">{t("assignments")}</h2>
        {rooms.length > 1 ? (
          <label className="flex w-full min-w-0 flex-col gap-1 text-sm font-medium text-slate-700 sm:w-auto sm:max-w-xs">
            {t("selectRoom")}
            <span className="relative">
              <select
                value={selectedRoomId}
                onChange={(event) => {
                  const roomId = event.currentTarget.value;
                  setSelection({ sessionKey, roomId });
                  if (roomId && isAnonymous && uid && isCurrentSession(uid, isAnonymous)) saveLastStudentSpaceId(roomId);
                }}
                className="min-h-11 w-full min-w-0 appearance-none rounded-lg border border-solid border-slate-300 bg-white pl-3 pr-9 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 sm:min-w-52"
              >
                <option value="">{t("allRooms")}</option>
                {rooms.map((room) => (
                  <option key={room.spaceId} value={room.spaceId}>{room.title ?? t("untitledRoom")}</option>
                ))}
              </select>
              <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
            </span>
          </label>
        ) : null}
      </div>

      {loading && visibleTasks.length === 0 ? <p role="status" className="m-0 text-sm text-slate-600">{t("loading")}</p> : null}
      {failed ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">
          <p role="alert" className="m-0">{t("loadFailed")}</p>
          <button
            type="button"
            onClick={() => setRetry((previous) => previous + 1)}
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

      {activeTasks.length > 0 ? <TaskList tasks={activeTasks} /> : null}
      {!loading && !failed && rooms.length > 0 && activeTasks.length === 0 ? (
        <p className="m-0 rounded-xl border border-solid border-slate-200 bg-white p-3 text-sm text-slate-600">{t("noAssignments")}</p>
      ) : null}
      {archivedTasks.length > 0 ? (
        <details className="rounded-xl border border-solid border-slate-200 bg-white">
          <summary className="cursor-pointer rounded-xl px-3 py-3 text-sm font-medium text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700">
            {t("archived")}
          </summary>
          <div className="px-3 pb-3"><TaskList tasks={archivedTasks} /></div>
        </details>
      ) : null}
    </section>
  );
}
