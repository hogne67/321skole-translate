"use client";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useUserProfile } from "@/lib/useUserProfile";

export default function AcceptSchoolInvitePage() {
  const locale = useLocale();
  const t = useTranslations("schoolAdmin.accept");
  const params = useSearchParams();
  const router = useRouter();
  const { user, loading } = useUserProfile();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const token = params.get("token")?.trim() || "";
  const signedIn = user && !user.isAnonymous;
  const next = encodeURIComponent(`/${locale}/school/accept?token=${encodeURIComponent(token)}`);
  async function accept() {
    if (!signedIn || busy) return;
    setBusy(true); setError("");
    try {
      const authToken = await user.getIdToken();
      const response = await fetch("/api/schools/accept-invite", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` }, body: JSON.stringify({ token }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.reason && t.has(data.reason) ? t(data.reason) : data.error || t("failed"));
      setSuccess(true);
    } catch (err) { setError(err instanceof Error ? err.message : t("failed")); }
    finally { setBusy(false); }
  }
  return (
    <main style={{ maxWidth:600, margin:"40px auto", padding:24, color:"#263f32" }}>
      <section style={{ padding:28, borderRadius:20, background:"#f2f7ec", border:"1px solid #dce8d9" }}>
        <p>321school</p><h1>{t("title")}</h1>
        {loading ? <p>{t("loading")}</p> : !token ? (
          <form onSubmit={(event) => { event.preventDefault(); router.push(`/${locale}/school/accept?token=${encodeURIComponent(code.trim())}`); }}>
            <label>{t("code")}<input required value={code} onChange={(event) => setCode(event.target.value)} style={inputStyle} autoComplete="off" /></label>
            <button style={buttonStyle}>{t("continue")}</button>
          </form>
        ) : !signedIn ? (
          <><p style={{ lineHeight:1.7 }}>{t("registerHelp")}</p><div style={{ display:"flex", flexWrap:"wrap", gap:12 }}>
            <Link style={buttonStyle} href={`/${locale}/login?next=${next}`}>{t("login")}</Link>
            <Link style={buttonStyle} href={`/${locale}/login?mode=signup&next=${next}`}>{t("signup")}</Link>
          </div></>
        ) : success ? (
          <><p role="status">{t("success")}</p><Link style={buttonStyle} href={`/${locale}/post-login`}>{t("continue")}</Link></>
        ) : (
          <><p style={{ lineHeight:1.7 }}>{t("signedIn", { email:user.email || "" })}</p>
            <button style={buttonStyle} disabled={busy} onClick={accept}>{t(busy ? "working" : "accept")}</button></>
        )}
        {error ? <p role="alert" style={{ color:"#991b1b", lineHeight:1.6 }}>{error}</p> : null}
      </section>
    </main>
  );
}
const inputStyle: React.CSSProperties = { display:"block", width:"100%", padding:12, margin:"8px 0 16px", borderRadius:10, border:"1px solid #cbd5e1" };
const buttonStyle: React.CSSProperties = { display:"inline-block", padding:"12px 18px", border:0, borderRadius:10, background:"#32634b", color:"white", fontWeight:700, textDecoration:"none", cursor:"pointer" };
