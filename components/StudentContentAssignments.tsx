"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useLocale, useTranslations } from "next-intl";
import SpacePupilIdentity from "@/components/SpacePupilIdentity";
import { Link } from "@/i18n/navigation";
import { auth, db } from "@/lib/firebase";
import {
  loadStudentContentRoom,
  selectStudentContentMemberships,
  type StudentContentRoom,
  type StudentContentTask,
} from "@/lib/studentContentTasks";
import { readLastStudentSpaceId } from "@/lib/studentLastSpace";

type AssignmentListState = {
  phase: "loading" | "ready" | "chooseRoom";
  activeRoomId: string | null;
  rooms: StudentContentRoom[];
  failed: boolean;
};

const initialState: AssignmentListState = { phase: "loading", activeRoomId: null, rooms: [], failed: false };
const actionClass = "inline-flex min-h-11 items-center justify-center rounded-lg px-3 py-2 text-sm font-semibold no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700";

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
  const [state, setState] = useState<AssignmentListState>(initialState);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!uid) return;

    let stopped = false;
    let generation = 0;
    const update = (next: AssignmentListState, version: number) => {
      const session = auth.currentUser;
      if (!stopped && version === generation && session?.uid === uid && session.isAnonymous === isAnonymous) {
        setState(next);
      }
    };

    const memberships = query(collection(db, "spaceMembers"), where("uid", "==", uid));
    const stop = onSnapshot(memberships, { includeMetadataChanges: true }, (snapshot) => {
      const version = ++generation;
      if (snapshot.metadata.fromCache) {
        // A previous session's cached membership is not proof of current access.
        update(initialState, version);
        return;
      }

      const selected = selectStudentContentMemberships(
        snapshot.docs, uid, isAnonymous, isAnonymous ? readLastStudentSpaceId() : null,
      );
      if (selected.memberships.length === 0) {
        update({ ...initialState, phase: selected.chooseRoom ? "chooseRoom" : "ready" }, version);
        return;
      }

      const activeRoomId = isAnonymous ? selected.memberships[0].spaceId : null;
      update({ ...initialState, activeRoomId }, version);
      void Promise.allSettled(selected.memberships.map((member) => loadStudentContentRoom(db, member, uid))).then((results) => {
        const rooms = results.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
        update({ phase: "ready", activeRoomId, rooms, failed: results.some((result) => result.status === "rejected") }, version);
      });
    }, () => update({ ...initialState, phase: "ready", failed: true }, ++generation));

    return () => {
      stopped = true;
      stop();
    };
  }, [uid, isAnonymous, retry]);

  const phase = uid ? state.phase : "ready";
  const hasRooms = state.rooms.length > 0;
  if (hasOwnWork && phase === "ready" && !state.failed && !hasRooms) return null;

  return (
    <section aria-labelledby="student-content-assignments" className="space-y-3">
      {state.activeRoomId ? <SpacePupilIdentity key={state.activeRoomId} spaceId={state.activeRoomId} /> : null}
      <h2 id="student-content-assignments" className="m-0 text-xl font-semibold text-slate-950">{t("assignments")}</h2>

      {phase === "loading" ? <p role="status" className="m-0 text-sm text-slate-600">{t("loading")}</p> : null}
      {state.failed ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">
          <p role="alert" className="m-0">{t("loadFailed")}</p>
          <button
            type="button"
            onClick={() => { setState(initialState); setRetry((previous) => previous + 1); }}
            className={`${actionClass} border border-solid border-slate-300 bg-white text-slate-800`}
          >
            {t("retry")}
          </button>
        </div>
      ) : null}

      {(phase === "chooseRoom" || (phase === "ready" && !hasRooms && !state.failed)) ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-solid border-slate-200 bg-white p-3 text-sm text-slate-700">
          <p className="m-0">{t(phase === "chooseRoom" ? "chooseRoom" : "joinHint")}</p>
          <Link href={phase === "chooseRoom" ? "/student/spaces" : "/join"} className={`${actionClass} bg-emerald-800 text-white hover:bg-emerald-900`}>
            {t(phase === "chooseRoom" ? "mySpaces" : "join")}
          </Link>
        </div>
      ) : null}

      {state.rooms.map((room) => {
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
