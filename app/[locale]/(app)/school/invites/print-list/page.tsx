"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useUserProfile } from "@/lib/useUserProfile";

type Invitation = { id: string; email: string; displayName?: string; inviteToken?: string; inviteCode?: string; status: string; expiresAt?: { seconds?: number; _seconds?: number } };
type PrintRow = Invitation & { url: string; qr: string };
export default function SchoolInviteListPage() {
  const { user, profile, loading } = useUserProfile();
  const params = useSearchParams();
  const locale = useLocale();
  const t = useTranslations("schoolAdmin.batch");
  const schoolId = params.get("schoolId") || profile?.schoolId || "";
  const [rows, setRows] = useState<PrintRow[]>([]);
  const [schoolName, setSchoolName] = useState("");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (loading || !user || user.isAnonymous || !schoolId) return;
    let cancelled = false;
    async function load() {
      try {
        const token = await user!.getIdToken();
        const headers = { Authorization: `Bearer ${token}` };
        const [inviteResponse, schoolResponse] = await Promise.all([
          fetch(`/api/schools/${encodeURIComponent(schoolId)}/invites`, { headers }),
          fetch(`/api/schools/${encodeURIComponent(schoolId)}`, { headers }),
        ]);
        const invites = await inviteResponse.json();
        const school = await schoolResponse.json();
        if (!inviteResponse.ok || !invites.ok || !schoolResponse.ok || !school.ok) throw new Error(t("failed"));
        const QRCode = (await import("qrcode")).default;
        const active: Invitation[] = invites.invites.filter((invite: Invitation) => invite.status === "pending" && invite.inviteToken &&
          (!invite.expiresAt || (invite.expiresAt.seconds ?? invite.expiresAt._seconds ?? 0) * 1000 > Date.now()));
        active.sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email, locale));
        const generated = await Promise.all(active.map(async (invite) => {
          const url = `${window.location.origin}/${locale}/school/accept?token=${encodeURIComponent(invite.inviteToken!)}`;
          return { ...invite, url, qr: await QRCode.toDataURL(url, { margin: 1, width: 160, errorCorrectionLevel: "M" }) };
        }));
        if (!cancelled) { setRows(generated); setSchoolName(school.school.name || ""); setReady(true); }
      } catch (err) { if (!cancelled) { setError(err instanceof Error ? err.message : t("failed")); setReady(true); } }
    }
    void load();
    return () => { cancelled = true; };
  }, [loading, user, schoolId, locale, t]);
  return (
    <main className="schoolTeacherPrint">
      <div className="printToolbar"><Link href={`/${locale}/school/teachers`}>{t("back")}</Link><button disabled={!ready || !rows.length || !!error} onClick={() => window.print()}>{t("print")}</button></div>
      <h1>{t("listTitle")}{schoolName ? ` · ${schoolName}` : ""}</h1>
      <p>{t("listIntro")}</p>
      {error ? <p role="alert">{error}</p> : !user && !loading ? <p>{t("signIn")}</p> : !ready ? <p>{t("working")}</p> : !rows.length ? <p>{t("empty")}</p> : null}
      {rows.map((row) => (
        <article key={row.id} className="teacherPrintCard">
          <div>
            <h2>{row.displayName || row.email}</h2><p>{row.email}</p>
            <p>{t("registerHelp")}</p>
            {row.inviteCode ? <><span>{t("code")}</span><strong className="teacherInviteCode">{row.inviteCode}</strong><p>{t("manualHelp", { url: `${window.location.origin}/${locale}/school/accept` })}</p></> : null}
            <a href={row.url}>{row.url}</a>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={row.qr} alt={t("qrAlt", { name: row.displayName || row.email })} width={120} height={120} />
        </article>
      ))}
      <style jsx>{`
        .schoolTeacherPrint { max-width:960px; padding:24px; margin:auto; font-family:Arial,sans-serif; color:#263f32; }
        .printToolbar { display:flex; justify-content:space-between; gap:16px; margin-bottom:24px; }
        .printToolbar button { padding:10px 16px; border:0; border-radius:10px; background:#32634b; color:white; }
        h1 { font-size:26px; } p { font-size:14px; line-height:1.5; } a { color:#32634b; overflow-wrap:anywhere; font-size:12px; }
        .teacherPrintCard { display:grid; grid-template-columns:1fr 120px; gap:20px; border:1px solid #dae3d8; border-radius:14px; padding:20px; margin:16px 0; break-inside:avoid; }
        .teacherPrintCard h2 { font-size:19px; margin:0; } .teacherPrintCard p { margin:6px 0; }
        .teacherInviteCode { display:block; font-family:monospace; font-size:17px; margin-top:5px; overflow-wrap:anywhere; }
        @media(max-width:500px) { .teacherPrintCard { grid-template-columns:1fr; } }
        @media print { .printToolbar { display:none; } .schoolTeacherPrint { padding:0; max-width:none; } .teacherPrintCard { border-radius:0; margin:10px 0; padding:14px; } }
        @page { size:A4; margin:12mm; }
      `}</style>
    </main>
  );
}
