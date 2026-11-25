"use client";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { signOut, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { clearLastStudentSpaceId } from "@/lib/studentLastSpace";
import { useUserProfile } from "@/lib/useUserProfile";

export default function AcceptSchoolInvitePage() {
  const params = useSearchParams();
  const { user, loading } = useUserProfile();
  const token = params.get("token")?.trim() || "";
  return <SchoolInviteForm key={JSON.stringify([token, user?.uid])} token={token} user={user} loading={loading} />;
}

function SchoolInviteForm({ token, user, loading }: { token: string; user: User | null; loading: boolean }) {
  const locale = useLocale();
  const t = useTranslations("schoolAdmin.accept");
  const tTop = useTranslations("topNav");
  const router = useRouter();
  const [code, setCode] = useState("");
  const [pending, setPending] = useState<"accept" | "switch" | null>(null);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const signedIn = user && !user.isAnonymous;
  const next = encodeURIComponent(`/${locale}/school/accept?token=${encodeURIComponent(token)}`);

  async function accept() {
    if (!signedIn || pending) return;
    setPending("accept");
    setError("");
    try {
      const authToken = await user.getIdToken();
      const response = await fetch("/api/schools/accept-invite", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` }, body: JSON.stringify({ token }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.reason && t.has(data.reason) ? t(data.reason) : data.error || t("failed"));
      setSuccess(true);
    } catch (err) { setError(err instanceof Error ? err.message : t("failed")); }
    finally { setPending(null); }
  }

  async function switchAccount() {
    if (!signedIn || pending) return;
    setPending("switch");
    setError("");
    try {
      await signOut(auth);
      clearLastStudentSpaceId();
      window.location.replace(`/${locale}/login?next=${next}`);
    } catch {
      setError(tTop("signOutError"));
      setPending(null);
    }
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
            <div className="flex flex-wrap gap-3">
              <button type="button" style={buttonStyle} disabled={pending !== null} onClick={accept}>
                {t(pending === "accept" ? "working" : "accept")}
              </button>
              <button type="button" disabled={pending !== null} onClick={() => void switchAccount()}
                className="min-h-11 rounded-xl border border-solid border-emerald-800 bg-white px-4 py-2 font-semibold text-emerald-950 disabled:opacity-60">
                {tTop("switchAccount")}
              </button>
            </div></>
        )}
        {error ? <p role="alert" style={{ color:"#991b1b", lineHeight:1.6 }}>{error}</p> : null}
      </section>
    </main>
  );
}
const inputStyle: React.CSSProperties = { display:"block", width:"100%", padding:12, margin:"8px 0 16px", borderRadius:10, border:"1px solid #cbd5e1" };
const buttonStyle: React.CSSProperties = { display:"inline-block", padding:"12px 18px", border:0, borderRadius:10, background:"#32634b", color:"white", fontWeight:700, textDecoration:"none", cursor:"pointer" };
