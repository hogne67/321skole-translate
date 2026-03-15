// app/[locale]/(auth)/login/LoginClient.tsx
"use client";

import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  onAuthStateChanged,
  type User,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { signInWithGoogle, signInWithEmail, signUpWithEmail } from "@/lib/auth";
import { linkAnonymousWithGoogle, linkAnonymousWithEmailPassword } from "@/lib/anonAuth";
import { useLocale, useTranslations } from "next-intl";

function toErrorString(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;

  if (typeof err === "object") {
    const o = err as Record<string, unknown>;
    const code = typeof o.code === "string" ? o.code : "";
    const message = typeof o.message === "string" ? o.message : "";
    return code || message || JSON.stringify(o);
  }

  return String(err);
}

function friendlyAuthErrorKey(msg: string): string {
  const m = (msg || "").toLowerCase();

  if (m.includes("auth/invalid-credential") || m.includes("auth/wrong-password")) return "invalidCredential";
  if (m.includes("auth/user-not-found")) return "userNotFound";
  if (m.includes("auth/email-already-in-use")) return "emailAlreadyInUse";
  if (m.includes("already in use")) return "emailAlreadyInUseLoginInstead";
  if (m.includes("auth/weak-password")) return "weakPassword";
  if (m.includes("auth/invalid-email")) return "invalidEmail";
  if (m.includes("auth/too-many-requests")) return "tooManyRequests";
  if (m.includes("popup-closed-by-user")) return "popupClosed";

  return "generic";
}

export default function LoginClient() {
  const t = useTranslations("auth.login");
  const locale = useLocale();
  const sp = useSearchParams();
  const router = useRouter();

  function safeT(key: string, fallback: string): string {
    try {
      return t(key);
    } catch {
      return fallback;
    }
  }

  const postLoginUrl = useMemo(() => {
    const rawNext = sp.get("next");
    const q = rawNext ? `?next=${encodeURIComponent(rawNext)}` : "";
    return `/${locale}/post-login${q}`;
  }, [sp, locale]);

  const [mode, setMode] = useState<"signin" | "signup">("signin");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const isAnon = !!currentUser?.isAnonymous;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setCurrentUser(u));
    return () => unsub();
  }, []);

  async function applyPersistence() {
    await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
  }

  async function handleGoogle() {
    setError(null);
    setInfo(null);
    setLoadingGoogle(true);

    try {
      await applyPersistence();

      if (isAnon) {
        await linkAnonymousWithGoogle();
      } else {
        await signInWithGoogle();
      }

      router.replace(postLoginUrl);
    } catch (err: unknown) {
      const key = friendlyAuthErrorKey(toErrorString(err));
      setError(
        safeT(
          `errors.${key}`,
          key === "popupClosed"
            ? "Sign-in was cancelled."
            : "Could not continue with Google. Please try again."
        )
      );
    } finally {
      setLoadingGoogle(false);
    }
  }

  async function handleEmail() {
    setError(null);
    setInfo(null);

    const e = email.trim();
    if (!e) {
      setError(safeT("errors.missingEmail", "Enter your email."));
      return;
    }

    if (!password) {
      setError(safeT("errors.missingPassword", "Enter your password."));
      return;
    }

    if (mode === "signup" && !displayName.trim()) {
      setError(safeT("errors.missingName", "Enter your name."));
      return;
    }

    setLoadingEmail(true);
    try {
      await applyPersistence();

      if (mode === "signin") {
        await signInWithEmail(e, password);
      } else {
        if (isAnon) {
          await linkAnonymousWithEmailPassword(e, password);
        } else {
          await signUpWithEmail(e, password, displayName.trim());
        }
      }

      router.replace(postLoginUrl);
    } catch (err: unknown) {
      const key = friendlyAuthErrorKey(toErrorString(err));
      setError(safeT(`errors.${key}`, "Could not continue. Please try again."));
    } finally {
      setLoadingEmail(false);
    }
  }

  async function handleForgotPassword() {
    setError(null);
    setInfo(null);

    const e = email.trim();
    if (!e) {
      setError(safeT("errors.missingEmail", "Enter your email."));
      return;
    }

    setSendingReset(true);
    try {
      auth.languageCode = locale;
      await sendPasswordResetEmail(auth, e);
      setInfo(
        safeT(
          "messages.resetSent",
          "We sent you an email with a link to reset your password."
        )
      );
      setShowForgotPassword(false);
    } catch (err: unknown) {
      const key = friendlyAuthErrorKey(toErrorString(err));
      setError(safeT(`errors.${key}`, "Could not send password reset email."));
    } finally {
      setSendingReset(false);
    }
  }

  const busy = loadingGoogle || loadingEmail || sendingReset;

  const pageStyle: React.CSSProperties = {
    minHeight: "100vh",
    padding: 16,
    background:
      "linear-gradient(180deg, rgba(124,199,255,0.16), rgba(255,255,255,1) 320px)",
  };

  const wrapStyle: React.CSSProperties = {
    maxWidth: 560,
    margin: "32px auto",
  };

  const cardStyle: React.CSSProperties = {
    background: "#fff",
    border: "1px solid rgba(15,23,42,0.08)",
    borderRadius: 24,
    boxShadow: "0 18px 50px rgba(15,23,42,0.10)",
    padding: 22,
  };

  const logoWrap: React.CSSProperties = {
    display: "flex",
    justifyContent: "center",
    marginBottom: 14,
  };

  const headerStyle: React.CSSProperties = {
    textAlign: "center",
    display: "grid",
    gap: 8,
    marginBottom: 18,
  };

  const titleStyle: React.CSSProperties = {
    margin: 0,
    fontSize: 30,
    lineHeight: 1.1,
    fontWeight: 900,
    color: "#0f172a",
  };

  const subtitleStyle: React.CSSProperties = {
    margin: 0,
    color: "rgba(15,23,42,0.72)",
    fontSize: 15,
    lineHeight: 1.5,
  };

  const tabRowStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    marginTop: 8,
    marginBottom: 18,
    padding: 6,
    background: "rgba(148,163,184,0.12)",
    borderRadius: 16,
  };

  const tabButton = (active: boolean): React.CSSProperties => ({
    minHeight: 48,
    borderRadius: 12,
    border: active ? "1px solid rgba(59,130,246,0.36)" : "1px solid transparent",
    background: active ? "linear-gradient(180deg, #2563eb, #1d4ed8)" : "transparent",
    color: active ? "white" : "#0f172a",
    fontWeight: 800,
    fontSize: 15,
    cursor: busy ? "not-allowed" : "pointer",
    opacity: busy ? 0.7 : 1,
    boxShadow: active ? "0 8px 22px rgba(37,99,235,0.22)" : "none",
  });

  const socialButtonStyle: React.CSSProperties = {
    width: "100%",
    minHeight: 52,
    borderRadius: 14,
    border: "1px solid rgba(15,23,42,0.12)",
    background: "#fff",
    color: "#0f172a",
    fontWeight: 800,
    fontSize: 15,
    cursor: busy ? "not-allowed" : "pointer",
    boxShadow: "0 2px 8px rgba(15,23,42,0.04)",
  };

  const separatorRowStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    alignItems: "center",
    gap: 12,
    margin: "18px 0",
    color: "rgba(15,23,42,0.55)",
    fontSize: 13,
    fontWeight: 700,
  };

  const lineStyle: React.CSSProperties = {
    height: 1,
    background: "rgba(15,23,42,0.10)",
  };

  const fieldWrapStyle: React.CSSProperties = {
    display: "grid",
    gap: 12,
  };

  const labelStyle: React.CSSProperties = {
    display: "grid",
    gap: 6,
  };

  const labelTextStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 800,
    color: "#0f172a",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    minHeight: 50,
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid rgba(15,23,42,0.14)",
    outline: "none",
    fontSize: 15,
    background: "#fff",
  };

  const helperRowStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 2,
  };

  const checkboxLabelStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 14,
    color: "rgba(15,23,42,0.78)",
  };

  const linkButtonStyle: React.CSSProperties = {
    background: "transparent",
    border: "none",
    padding: 0,
    color: "#2563eb",
    fontWeight: 700,
    cursor: "pointer",
  };

  const primaryButtonStyle: React.CSSProperties = {
    width: "100%",
    minHeight: 52,
    borderRadius: 14,
    border: "1px solid rgba(37,99,235,0.35)",
    background: "linear-gradient(180deg, #2563eb, #1d4ed8)",
    color: "white",
    fontWeight: 900,
    fontSize: 15,
    cursor: busy ? "not-allowed" : "pointer",
    boxShadow: "0 12px 28px rgba(37,99,235,0.24)",
  };

  const infoBoxStyle: React.CSSProperties = {
    marginTop: 14,
    padding: 12,
    borderRadius: 14,
    border: "1px solid rgba(16,185,129,0.25)",
    background: "rgba(16,185,129,0.08)",
    color: "#065f46",
    fontSize: 14,
  };

  const errorBoxStyle: React.CSSProperties = {
    marginTop: 14,
    padding: 12,
    borderRadius: 14,
    border: "1px solid rgba(220,38,38,0.25)",
    background: "rgba(220,38,38,0.06)",
    color: "#991b1b",
    fontSize: 14,
  };

  const bottomSwitchStyle: React.CSSProperties = {
    marginTop: 18,
    paddingTop: 16,
    borderTop: "1px solid rgba(15,23,42,0.08)",
    textAlign: "center",
    color: "rgba(15,23,42,0.75)",
    fontSize: 14,
  };

  const forgotCardStyle: React.CSSProperties = {
    marginTop: 12,
    padding: 14,
    borderRadius: 16,
    border: "1px solid rgba(37,99,235,0.16)",
    background: "rgba(37,99,235,0.05)",
    display: "grid",
    gap: 10,
  };

  return (
    <main style={pageStyle}>
      <div style={wrapStyle}>
        <div style={cardStyle}>
          <div style={logoWrap}>
            <Image
              src="/logo 321_2.png"
              alt="321skole"
              width={220}
              height={72}
              priority
              style={{ width: "auto", height: "58px", objectFit: "contain" }}
            />
          </div>

          <div style={headerStyle}>
            <h1 style={titleStyle}>
              {mode === "signin"
                ? safeT("title.signin", "Log in")
                : safeT("title.signup", "Create account")}
            </h1>

            <p style={subtitleStyle}>
              {isAnon
                ? safeT(
                    "intro.anon",
                    "You are using a temporary account. Sign in or create an account to keep your work."
                  )
                : mode === "signin"
                  ? safeT("intro.normal", "Log in to continue.")
                  : safeT(
                      "intro.signup",
                      "Create an account to get started as a student, teacher or parent."
                    )}
            </p>
          </div>

          <div style={tabRowStyle}>
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError(null);
                setInfo(null);
                setShowForgotPassword(false);
              }}
              disabled={busy}
              style={tabButton(mode === "signin")}
            >
              {safeT("tabs.signin", "Log in")}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setError(null);
                setInfo(null);
                setShowForgotPassword(false);
              }}
              disabled={busy}
              style={tabButton(mode === "signup")}
            >
              {safeT("tabs.signup", "Create account")}
            </button>
          </div>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={busy}
            style={socialButtonStyle}
          >
            {loadingGoogle
              ? safeT("buttons.working", "Working…")
              : isAnon
                ? safeT("buttons.upgradeGoogle", "Upgrade with Google")
                : safeT("buttons.signinGoogle", "Continue with Google")}
          </button>

          <div style={separatorRowStyle}>
            <div style={lineStyle} />
            <span>{safeT("separator", "or")}</span>
            <div style={lineStyle} />
          </div>

          <div style={fieldWrapStyle}>
            {mode === "signup" && (
              <label style={labelStyle}>
                <span style={labelTextStyle}>
                  {safeT("fields.displayNameLabel", "Full name")}
                </span>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={safeT("fields.displayNamePlaceholder", "Full name")}
                  autoComplete="name"
                  style={inputStyle}
                />
              </label>
            )}

            <label style={labelStyle}>
              <span style={labelTextStyle}>
                {safeT("fields.emailLabel", "Email")}
              </span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={safeT("fields.emailPlaceholder", "Email")}
                type="email"
                inputMode="email"
                autoComplete="email"
                style={inputStyle}
              />
            </label>

            <label style={labelStyle}>
              <span style={labelTextStyle}>
                {safeT("fields.passwordLabel", "Password")}
              </span>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={safeT("fields.passwordPlaceholder", "Password")}
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                style={inputStyle}
              />
            </label>

            <div style={helperRowStyle}>
              <label style={checkboxLabelStyle}>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span>{safeT("fields.rememberMe", "Remember me on this device")}</span>
              </label>

              {mode === "signin" ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowForgotPassword((s) => !s);
                    setError(null);
                    setInfo(null);
                  }}
                  style={linkButtonStyle}
                >
                  {safeT("buttons.forgotPassword", "Forgot password?")}
                </button>
              ) : null}
            </div>

            {showForgotPassword && mode === "signin" ? (
              <div style={forgotCardStyle}>
                <div style={{ fontWeight: 800, color: "#0f172a" }}>
                  {safeT("forgot.title", "Reset password")}
                </div>
                <div style={{ fontSize: 14, color: "rgba(15,23,42,0.72)" }}>
                  {safeT(
                    "forgot.text",
                    "Enter your email and we will send you a link to create a new password."
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={sendingReset}
                  style={{
                    ...socialButtonStyle,
                    minHeight: 46,
                    fontWeight: 800,
                  }}
                >
                  {sendingReset
                    ? safeT("buttons.sending", "Sending…")
                    : safeT("buttons.sendReset", "Send reset email")}
                </button>
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleEmail}
              disabled={busy}
              style={primaryButtonStyle}
            >
              {loadingEmail
                ? safeT("buttons.working", "Working…")
                : mode === "signin"
                  ? safeT("buttons.signinEmail", "Log in with email")
                  : isAnon
                    ? safeT("buttons.upgradeAccount", "Save anonymous account")
                    : safeT("buttons.createAccount", "Create account")}
            </button>

            {mode === "signup" && isAnon ? (
              <p
                style={{ margin: 0, fontSize: 13, color: "rgba(15,23,42,0.68)", lineHeight: 1.5 }}
                dangerouslySetInnerHTML={{
                  __html: safeT(
                    "hints.anonSignup",
                    "Tip: If this email already exists, choose <b>Log in</b> instead."
                  ),
                }}
              />
            ) : null}
          </div>

          {info ? <div style={infoBoxStyle}>{info}</div> : null}
          {error ? <div style={errorBoxStyle}>{error}</div> : null}

          <div style={bottomSwitchStyle}>
            {mode === "signin" ? (
              <>
                {safeT("footer.noAccount", "Don’t have an account?")}{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("signup");
                    setError(null);
                    setInfo(null);
                    setShowForgotPassword(false);
                  }}
                  style={linkButtonStyle}
                >
                  {safeT("footer.signupLink", "Create one here")}
                </button>
              </>
            ) : (
              <>
                {safeT("footer.hasAccount", "Already registered?")}{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("signin");
                    setError(null);
                    setInfo(null);
                    setShowForgotPassword(false);
                  }}
                  style={linkButtonStyle}
                >
                  {safeT("footer.signinLink", "Log in here")}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 640px) {
          main :global(input),
          main :global(button) {
            min-height: 46px;
          }
        }
      `}</style>
    </main>
  );
}