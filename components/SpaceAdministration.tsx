"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ChevronDown, Copy, Link2, Printer, Settings2, Users } from "lucide-react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import SpaceDeletionAction from "./SpaceDeletionAction";
import { db } from "@/lib/firebase";
import { getSpaceJoinCode } from "@/lib/spaceCode";
import { isLessonAiFeedbackDisabled } from "@/lib/security/lessonAiFeedbackPolicy";
import { isWritingAiDisabled } from "@/lib/security/writingAiPolicy";
import type { SpaceDoc } from "@/lib/spacesClient";

const actionClass = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-solid border-slate-300 bg-white px-3 py-2 text-center text-sm font-semibold text-slate-800 no-underline hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-50";
const summaryClass = "flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 [&::-webkit-details-marker]:hidden";
type Notice = { area: "code" | "sharing" | "settings"; text: string; error?: boolean };

export default function SpaceAdministration({ spaceId, space, canControl, canSetLessonAiFeedbackPolicy, canDelete = false }: {
  spaceId: string;
  space: SpaceDoc;
  canControl: boolean;
  canSetLessonAiFeedbackPolicy: boolean;
  canDelete?: boolean;
}) {
  const t = useTranslations("spaces");
  const detail = useTranslations("spaceDetail.administration");
  const locale = useLocale();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [qr, setQr] = useState<{ code: string; dataUrl: string } | null>(null);
  const [qrBusy, setQrBusy] = useState(false);
  const code = getSpaceJoinCode(space);
  const lessonAiFeedbackDisabled = isLessonAiFeedbackDisabled(space);
  const writingAiDisabled = isWritingAiDisabled(space);
  const qrImage = qr?.code === code ? qr.dataUrl : null;
  const roomName = String(space.title ?? "");
  const title = roomName.trim() || t("list.untitled");
  const spacesHref = `/${locale}/teacher/spaces`;
  const basePath = `${spacesHref}/${spaceId}`;

  function cancelEditing() {
    setEditing(false);
    setNotice(null);
  }

  async function save(fields: Partial<Pick<SpaceDoc, "title" | "lessonAiFeedbackDisabled" | "writingAiDisabled">>) {
    if (!canControl || busy) return false;

    setBusy(true);
    setNotice(null);
    try {
      await updateDoc(doc(db, "spaces", spaceId), { ...fields, updatedAt: serverTimestamp() });
      setNotice({ area: "settings", text: detail(fields.title === undefined ? "saved" : "nameSaved") });
      return true;
    } catch {
      setNotice({ area: "settings", text: detail("saveFailed"), error: true });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveTitle() {
    if (!canControl || busy) return;
    const title = titleDraft.trim();
    if (!title) {
      setNotice({ area: "settings", text: t("list.editTitleRequired"), error: true });
      return;
    }

    if (await save({ title })) setEditing(false);
  }

  function joinUrl() {
    return `${window.location.origin}/${locale}/join?code=${encodeURIComponent(code)}`;
  }

  async function copy(value: string, area: "code" | "sharing") {
    setNotice(null);
    try {
      await navigator.clipboard.writeText(value);
      setNotice({ area, text: detail(area === "code" ? "codeCopied" : "linkCopied") });
    } catch {
      setNotice({ area, text: detail("copyFailed"), error: true });
    }
  }

  async function toggleQr() {
    setNotice(null);
    if (qrImage) {
      setQr(null);
      return;
    }

    setQrBusy(true);
    try {
      const QRCode = (await import("qrcode")).default;
      const dataUrl = await QRCode.toDataURL(joinUrl(), { margin: 2, scale: 6 });
      setQr({ code, dataUrl });
    } catch {
      setNotice({ area: "sharing", text: detail("qrFailed"), error: true });
    } finally {
      setQrBusy(false);
    }
  }

  function renderNotice(area: Notice["area"]) {
    const message = notice?.area === area ? notice : null;
    return (
      <p role={message?.error ? "alert" : "status"} className={message ? `mb-0 mt-2 text-sm ${message.error ? "text-red-700" : "text-emerald-800"}` : "sr-only"}>
        {message?.text}
      </p>
    );
  }

  return (
    <section className="min-w-0 rounded-2xl border border-solid border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <header>
        <Link href={spacesHref} className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 no-underline hover:underline">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          {detail("backToRooms")}
        </Link>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <h1 className="m-0 min-w-0 flex-1 basis-64 break-words text-2xl font-semibold text-slate-950 sm:text-3xl">{title}</h1>
          <div className="flex max-w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-solid border-emerald-200 bg-emerald-50 px-3 py-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-emerald-900">{detail("roomCode")}</div>
              <div className="break-all font-mono text-xl font-bold leading-tight tracking-wide text-emerald-950">{code || detail("codeMissing")}</div>
            </div>
            <button type="button" disabled={!code} onClick={() => void copy(code, "code")} className={actionClass}>
              <Copy aria-hidden="true" className="h-4 w-4" />
              {t("list.copyCodeTitle")}
            </button>
          </div>
        </div>
        {renderNotice("code")}
      </header>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-0 border-t border-solid border-slate-200 pt-4">
        <Link href={`${basePath}/members`} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-800 px-3 py-2 text-sm font-semibold text-white no-underline hover:bg-emerald-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
          <Users aria-hidden="true" className="h-4 w-4" />
          {detail("members")}
        </Link>
        <Link href={`${basePath}/print`} className={actionClass}>
          <Printer aria-hidden="true" className="h-4 w-4" />
          {t("list.printRoom")}
        </Link>
      </div>

      <div className="mt-3 grid gap-2">
        <details className="group rounded-xl border border-solid border-slate-200 bg-slate-50">
          <summary className={summaryClass}>
            <Link2 aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-800" />
            {detail("accessTitle")}
            <ChevronDown aria-hidden="true" className="ml-auto h-4 w-4 shrink-0 group-open:rotate-180" />
          </summary>
          <div className="border-0 border-t border-solid border-slate-200 p-3">
            <p className="m-0 text-sm text-slate-700">{detail("sharedEntrance")}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={!code} onClick={() => void copy(joinUrl(), "sharing")} className={actionClass}>{t("list.copyJoinLink")}</button>
              <button type="button" disabled={!code || qrBusy} onClick={() => void toggleQr()} aria-expanded={Boolean(qrImage)} aria-controls="space-join-qr" className={actionClass}>
                {qrImage ? detail("hideRoomQr") : t("list.joinWithQr")}
              </button>
            </div>
            {qrBusy ? <p role="status" className="mb-0 mt-2 text-sm text-slate-600">{t("qr.generating")}</p> : null}
            <div id="space-join-qr" hidden={!qrImage}>
              {qrImage ? <Image src={qrImage} alt={t("qr.imageAlt")} width={256} height={256} unoptimized className="mt-3 h-auto max-w-full rounded-xl border border-solid border-slate-200" /> : null}
            </div>
            {renderNotice("sharing")}
          </div>
        </details>

        {canControl || canSetLessonAiFeedbackPolicy || canDelete ? (
          <details className="group rounded-xl border border-solid border-slate-200 bg-slate-50">
            <summary className={summaryClass}>
              <Settings2 aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-800" />
              {detail("title")}
              <ChevronDown aria-hidden="true" className="ml-auto h-4 w-4 shrink-0 group-open:rotate-180" />
            </summary>
            <div className="border-0 border-t border-solid border-slate-200 p-3">
              {canControl ? (
                editing ? (
                  <form onSubmit={(event) => { event.preventDefault(); void saveTitle(); }} className="space-y-2">
                    <label htmlFor="space-title" className="block text-sm font-semibold text-slate-900">{t("list.editTitleLabel")}</label>
                    <input
                      id="space-title"
                      value={titleDraft}
                      onChange={(event) => setTitleDraft(event.target.value)}
                      onKeyDown={(event) => { if (event.key === "Escape" && !busy) cancelEditing(); }}
                      disabled={busy}
                      autoFocus
                      className="box-border min-h-10 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:!outline focus-visible:!outline-2 focus-visible:!outline-emerald-700 sm:max-w-sm"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button type="submit" disabled={busy} className={actionClass}>{t(busy ? "list.savingTitle" : "list.saveTitle")}</button>
                      <button type="button" disabled={busy} onClick={cancelEditing} className={actionClass}>{t("list.cancelEditTitle")}</button>
                    </div>
                  </form>
                ) : (
                  <button type="button" onClick={() => { setTitleDraft(roomName); setEditing(true); setNotice(null); }} className={actionClass}>
                    {detail("editRoomName")}
                  </button>
                )
              ) : null}

              {canSetLessonAiFeedbackPolicy ? (
                <div className="grid gap-2 pt-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                    <input type="checkbox" checked={lessonAiFeedbackDisabled} disabled={busy}
                      onChange={(event) => void save({ lessonAiFeedbackDisabled: event.target.checked })} />
                    {detail("disableLessonAiFeedback")}
                  </label>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                    <input type="checkbox" checked={writingAiDisabled} disabled={busy}
                      onChange={(event) => void save({ writingAiDisabled: event.target.checked })} />
                    {detail("disableWritingAi")}
                  </label>
                </div>
              ) : null}

              {canDelete ? (
                <div className={`flex flex-wrap items-center justify-between gap-3 ${canControl ? "mt-3 border-0 border-t border-solid border-slate-200 pt-3" : ""}`}>
                  <p className="m-0 text-sm text-slate-600">{t("deletion.requirement")}</p>
                  <SpaceDeletionAction spaceId={spaceId} title={title} onChanged={() => router.push(spacesHref)} />
                </div>
              ) : null}
              {renderNotice("settings")}
            </div>
          </details>
        ) : null}
      </div>
    </section>
  );
}
