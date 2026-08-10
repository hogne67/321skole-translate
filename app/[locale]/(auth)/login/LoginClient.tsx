// app/[locale]/(auth)/login/LoginClient.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useCallback } from "react";
import {
  onAuthStateChanged,
  type User,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  logout,
  sendVerificationEmail,
  signInWithFeide,
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
} from "@/lib/auth";
import {
  linkAnonymousWithEmailPassword,
  linkAnonymousWithFeide,
  linkAnonymousWithGoogle,
} from "@/lib/anonAuth";
import { ensureUserProfile, recordUserLogin } from "@/lib/userProfile";
import { useLocale, useTranslations } from "next-intl";
import { trackSignUp } from "@/lib/analytics";
import { trackEvent } from "@/lib/trackEvent";

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

  if (m.includes("auth/invalid-credential") || m.includes("auth/wrong-password")) {
    return "invalidCredential";
  }
  if (m.includes("auth/user-not-found")) return "userNotFound";
  if (m.includes("auth/email-already-in-use")) return "emailAlreadyInUse";
  if (m.includes("already in use")) return "emailAlreadyInUseLoginInstead";
  if (m.includes("auth/weak-password")) return "weakPassword";
  if (m.includes("auth/invalid-email")) return "invalidEmail";
  if (m.includes("auth/too-many-requests")) return "tooManyRequests";
  if (m.includes("popup-closed-by-user")) return "popupClosed";

  return "generic";
}

type Mode = "signin" | "signup";
type LoginMethod = "choice" | "email";
type LegalModalType = "terms" | "privacy" | null;
const LEGAL_VERSION = "2026-08-09";
const EMAIL_VERIFICATION_REQUIRED_FROM = Date.parse("2026-08-10T00:00:00+02:00");

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

function FeideIcon() {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 22,
        height: 22,
        borderRadius: 6,
        background: "#1f4aa8",
        color: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13,
        fontWeight: 900,
        lineHeight: 1,
      }}
    >
      F
    </span>
  );
}

export default function LoginClient() {
  const t = useTranslations("login");
  const locale = useLocale();
  const sp = useSearchParams();
  const router = useRouter();

  const welcome = sp.get("welcome");
  const verified = sp.get("verified");
  const verify = sp.get("verify");

  const safeT = useCallback(
    (key: string, fallback: string): string => {
      try {
        return t(key);
      } catch {
        return fallback;
      }
    },
    [t]
  );

  const postLoginUrl = useMemo(() => {
    const rawNext = sp.get("next");
    const q = rawNext ? `?next=${encodeURIComponent(rawNext)}` : "";
    return `/${locale}/post-login${q}`;
  }, [sp, locale]);

  const [mode, setMode] = useState<Mode>("signin");
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("choice");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [legalModal, setLegalModal] = useState<LegalModalType>(null);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingFeide, setLoadingFeide] = useState(false);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const isAnon = !!currentUser?.isAnonymous;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setCurrentUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (
      currentUser &&
      !currentUser.isAnonymous &&
      welcome !== "1" &&
      verified !== "1" &&
      verify !== "required"
    ) {
      router.replace(postLoginUrl);
    }
  }, [currentUser, postLoginUrl, router, verified, verify, welcome]);

  useEffect(() => {
    if (welcome === "1") {
      setInfo(
        safeT(
          "messages.checkEmail",
          "Account created! Check your email to verify your account."
        )
      );
      setError(null);
      return;
    }

    if (verified === "1") {
      setInfo(
        safeT(
          "messages.verified",
          "Your email is verified. You can now log in."
        )
      );
      setError(null);
      return;
    }
  }, [welcome, verified, safeT]);

  useEffect(() => {
    if (sp.get("verify") === "required") {
      setInfo(
        safeT(
          "messages.verifyRequired",
          "Verify your email before continuing. We have sent you a new verification link if we could."
        )
      );
      setError(null);
    }
  }, [safeT, sp]);

  useEffect(() => {
    if (!legalModal) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setLegalModal(null);
    }

    window.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [legalModal]);

  async function applyPersistence() {
    await setPersistence(
      auth,
      rememberMe ? browserLocalPersistence : browserSessionPersistence
    );
  }

  function resetMessages() {
    setError(null);
    setInfo(null);
  }

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setShowForgotPassword(false);
    resetMessages();
  }

  async function recordExistingLogin(user: User) {
    try {
      await recordUserLogin(user);
    } catch (err) {
      console.warn("record login failed", err);
    }
  }

  function verificationSettings() {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return origin
      ? {
          url: `${origin}/${locale}/login?verified=1`,
          handleCodeInApp: false,
        }
      : undefined;
  }

  async function sendVerification(user: User) {
    auth.languageCode = locale;
    await sendVerificationEmail(user, verificationSettings());
  }

  async function sendBrandedVerificationEmail(input: {
    email: string;
    displayName?: string | null;
  }): Promise<boolean> {
    const emailAddress = input.email.trim();
    if (!emailAddress) return false;

    try {
      const response = await fetch("/api/email/welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: emailAddress,
          displayName: input.displayName?.trim() || displayName.trim(),
          locale,
        }),
      });

      const result = (await response.json().catch(() => null)) as { ok?: unknown } | null;
      return response.ok && result?.ok === true;
    } catch (mailErr) {
      console.error("verification email failed", mailErr);
      return false;
    }
  }

  async function sendBestVerificationEmail(user: User, fallbackEmail?: string) {
    await sendBrandedVerificationEmail({
      email: user.email || fallbackEmail || "",
      displayName: user.displayName,
    }).catch((err) => {
      console.warn("branded verification email failed", err);
    });

    await sendVerification(user);
  }

  function isEmailPasswordUser(user: User): boolean {
    return user.providerData.some((provider) => provider.providerId === "password");
  }

  function shouldRequireEmailVerification(user: User): boolean {
    const createdAt = Date.parse(user.metadata.creationTime || "");
    return Number.isFinite(createdAt) && createdAt >= EMAIL_VERIFICATION_REQUIRED_FROM;
  }

  async function stopIfEmailNotVerified(user: User): Promise<boolean> {
    if (!isEmailPasswordUser(user) || user.emailVerified) return false;
    if (!shouldRequireEmailVerification(user)) return false;

    await sendBestVerificationEmail(user).catch((err) => {
      console.warn("verification email failed", err);
    });
    await logout();
    setInfo(
      safeT(
        "messages.verifyRequired",
        "Check your email: You must verify your account before continuing. We have sent you a new verification link if we could."
      )
    );
    return true;
  }

  function needsSignupConfirmation() {
    return mode === "signup" || isAnon;
  }

  function requireSignupConfirmation(): boolean {
    if (!needsSignupConfirmation()) return true;
    if (ageConfirmed) return true;

    setError(
      safeT(
        "errors.ageConfirmationRequired",
        "Confirm that you are 13 or older, or that you use the service with a parent/guardian or school."
      )
    );
    return false;
  }

  async function saveLegalConfirmation(user: User, source: string) {
    if (!needsSignupConfirmation()) return;

    const now = new Date().toISOString();
    await ensureUserProfile(user, {
      displayName: user.displayName || displayName.trim() || "",
      email: user.email || email.trim() || "",
      locale,
      legal: {
        version: LEGAL_VERSION,
        termsAcceptedAt: now,
        privacyAcceptedAt: now,
        ageConfirmation: "over_13_or_parent_school",
        ageConfirmedAt: now,
        acceptedFrom: source,
      },
    });
  }

  async function handleGoogle() {
    resetMessages();
    if (!requireSignupConfirmation()) return;
    setLoadingGoogle(true);

    try {
      await applyPersistence();

      if (isAnon) {
        const user = await linkAnonymousWithGoogle();
        await saveLegalConfirmation(user, "google_anonymous_upgrade");
        await recordExistingLogin(user);
        trackSignUp("anonymous_upgrade");

        trackEvent("login", {
          method: "google",
          type: "anonymous_upgrade",
        });
      } else {
        const cred = await signInWithGoogle();
        if (mode === "signin") {
          await recordExistingLogin(cred.user);
        }

        trackEvent("login", {
          method: "google",
          type: mode,
        });

        if (mode === "signup") {
          await saveLegalConfirmation(cred.user, "google_signup");
          trackSignUp("google");
        }
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

  async function handleFeide(loginHint = "feide|all") {
    resetMessages();
    if (!requireSignupConfirmation()) return;
    setLoadingFeide(true);

    try {
      await applyPersistence();

      if (isAnon) {
        const user = await linkAnonymousWithFeide(loginHint);
        await saveLegalConfirmation(user, "feide_anonymous_upgrade");
        await recordExistingLogin(user);
        trackSignUp("anonymous_upgrade");

        trackEvent("login", {
          method: "feide",
          type: "anonymous_upgrade",
        });
      } else {
        const cred = await signInWithFeide(loginHint);
        if (mode === "signin") {
          await recordExistingLogin(cred.user);
        }

        trackEvent("login", {
          method: "feide",
          type: mode,
        });

        if (mode === "signup") {
          await saveLegalConfirmation(cred.user, "feide_signup");
          trackSignUp("feide");
        }
      }

      router.replace(postLoginUrl);
    } catch (err: unknown) {
      const key = friendlyAuthErrorKey(toErrorString(err));
      setError(
        safeT(
          `errors.${key}`,
          key === "popupClosed"
            ? "Sign-in was cancelled."
            : "Could not continue with Feide. Please try again."
        )
      );
    } finally {
      setLoadingFeide(false);
    }
  }

  async function handleEmail() {
    resetMessages();

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

    if (!requireSignupConfirmation()) return;

    setLoadingEmail(true);

    try {
      await applyPersistence();

      if (mode === "signin") {
        const cred = await signInWithEmail(e, password);
        if (await stopIfEmailNotVerified(cred.user)) return;
        await recordExistingLogin(cred.user);

        trackEvent("login", {
          method: "email",
          type: "signin",
        });

        router.replace(postLoginUrl);
        return;
      }

      if (isAnon) {
        const user = await linkAnonymousWithEmailPassword(e, password);
        await saveLegalConfirmation(user, "email_anonymous_upgrade");
        await sendBestVerificationEmail(user, e);
        trackSignUp("anonymous_upgrade");

        trackEvent("login", {
          method: "email",
          type: "anonymous_upgrade",
        });

        router.replace(`/${locale}/login?welcome=1`);
        return;
      }

      const cred = await signUpWithEmail(e, password, displayName.trim());
      await saveLegalConfirmation(cred.user, "email_signup");
      await sendBestVerificationEmail(cred.user, e);
      trackSignUp("email");

      trackEvent("login", {
        method: "email",
        type: "signup",
      });

      router.replace(`/${locale}/login?welcome=1`);
    } catch (err: unknown) {
      const key = friendlyAuthErrorKey(toErrorString(err));
      setError(safeT(`errors.${key}`, "Could not continue. Please try again."));
    } finally {
      setLoadingEmail(false);
    }
  }

  async function handleForgotPassword() {
    resetMessages();

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

  const busy = loadingGoogle || loadingFeide || loadingEmail || sendingReset;
  const showEmailForm = loginMethod === "email";

  const modalTitle =
    legalModal === "terms"
      ? safeT("legal.terms", "Terms")
      : safeT("legal.privacy", "Privacy Policy");

  const modalSrc =
    legalModal === "terms" ? `/${locale}/terms` : `/${locale}/privacy`;

  const pageStyle: React.CSSProperties = {
    minHeight: "100vh",
    padding: "12px 14px 24px",
    background:
      "linear-gradient(180deg, rgba(124,199,255,0.16), rgba(255,255,255,1) 320px)",
  };

  const wrapStyle: React.CSSProperties = {
    maxWidth: 560,
    margin: "12px auto",
  };

  const cardStyle: React.CSSProperties = {
    background: "#e4e9ee",
    border: "1px solid rgba(15,23,42,0.08)",
    borderRadius: 24,
    boxShadow: "0 18px 50px rgba(15,23,42,0.10)",
    padding: 18,
  };

  const logoWrap: React.CSSProperties = {
    display: "flex",
    justifyContent: "center",
    marginBottom: 10,
  };

  const headerStyle: React.CSSProperties = {
    textAlign: "center",
    display: "grid",
    gap: 8,
    marginBottom: 14,
  };

  const titleStyle: React.CSSProperties = {
    margin: 0,
    fontSize: 28,
    lineHeight: 1.08,
    fontWeight: 900,
    color: "#0f172a",
  };

  const subtitleStyle: React.CSSProperties = {
    margin: 0,
    color: "rgba(15,23,42,0.72)",
    fontSize: 14,
    lineHeight: 1.5,
  };

  const modeRowStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    marginTop: 8,
    marginBottom: 14,
    padding: 6,
    background: "rgba(148,163,184,0.12)",
    borderRadius: 16,
  };

  const modeButton = (active: boolean): React.CSSProperties => ({
    minHeight: 48,
    borderRadius: 12,
    border: active
      ? "1px solid rgba(59,130,246,0.36)"
      : "1px solid transparent",
    background: active
      ? "linear-gradient(180deg, #cbadc5, #b06799)"
      : "transparent",
    color: active ? "#fff" : "#0f172a",
    fontWeight: 800,
    fontSize: 14,
    cursor: busy ? "not-allowed" : "pointer",
    opacity: busy ? 0.7 : 1,
    boxShadow: active ? "0 8px 22px rgba(37,99,235,0.22)" : "none",
    textAlign: "center",
    padding: "8px 10px",
  });

  const choiceGrid: React.CSSProperties = {
    display: "grid",
    gap: 10,
    marginTop: 8,
  };

  const googleButtonStyle: React.CSSProperties = {
    width: "100%",
    minHeight: 54,
    borderRadius: 16,
    border: "1px solid rgba(15,23,42,0.10)",
    background: "#d0ddc6d3",
    color: "#0f172a",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    fontWeight: 900,
    fontSize: 15,
    cursor: busy ? "not-allowed" : "pointer",
    boxShadow: "0 4px 14px rgba(15,23,42,0.06)",
    padding: "0 16px",
  };

  const emailChoiceButtonStyle: React.CSSProperties = {
    width: "100%",
    minHeight: 54,
    borderRadius: 16,
    border: "1px solid rgba(37,99,235,0.18)",
    background: "rgba(37,99,235,0.05)",
    color: "#0f172a",
    fontWeight: 900,
    fontSize: 15,
    cursor: busy ? "not-allowed" : "pointer",
    padding: "0 16px",
  };

  const choiceHintStyle: React.CSSProperties = {
    margin: 0,
    textAlign: "center",
    fontSize: 13,
    color: "rgba(15,23,42,0.62)",
    lineHeight: 1.45,
  };

  const emailPanelStyle: React.CSSProperties = {
    marginTop: 14,
    paddingTop: 14,
    borderTop: "1px solid rgba(15,23,42,0.08)",
    display: "grid",
    gap: 12,
  };

  const smallBackButtonStyle: React.CSSProperties = {
    justifySelf: "start",
    background: "transparent",
    border: "none",
    padding: 0,
    color: "#2564eb61",
    fontWeight: 800,
    fontSize: 14,
    cursor: "pointer",
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
    width: "95%",
    minHeight: 40,
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid rgba(15,23,42,0.14)",
    outline: "none",
    fontSize: 14,
    background: "#dbe6ebed",
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
    color: "#71eb25",
    fontWeight: 700,
    cursor: "pointer",
  };

  const footerLinkButtonStyle: React.CSSProperties = {
    background: "transparent",
    border: "none",
    padding: 0,
    color: "#2563eb",
    textDecoration: "underline",
    textUnderlineOffset: 2,
    cursor: "pointer",
    fontSize: "inherit",
    fontFamily: "inherit",
  };

  const primaryButtonStyle: React.CSSProperties = {
    width: "100%",
    minHeight: 52,
    borderRadius: 14,
    border: "1px solid rgba(34,197,94,0.32)",
    background: "linear-gradient(180deg, #169125, #15803d)",
    color: "white",
    fontWeight: 900,
    fontSize: 15,
    cursor: busy ? "not-allowed" : "pointer",
    boxShadow: "0 12px 28px rgba(22,145,37,0.22)",
  };

  const infoBoxStyle: React.CSSProperties = {
    marginTop: 14,
    padding: "15px 16px",
    borderRadius: 16,
    border: "1px solid rgba(13,148,136,0.42)",
    background: "#ccfbf1",
    color: "#0f4f46",
    fontSize: 15,
    fontWeight: 800,
    lineHeight: 1.55,
    boxShadow: "0 10px 24px rgba(13,148,136,0.12)",
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
    padding: 14,
    borderRadius: 16,
    border: "1px solid rgba(37,99,235,0.16)",
    background: "rgba(37,99,235,0.05)",
    display: "grid",
    gap: 10,
  };

  const legalTextStyle: React.CSSProperties = {
    marginTop: 16,
    textAlign: "center",
    fontSize: 12,
    lineHeight: 1.6,
    color: "rgba(15,23,42,0.62)",
  };

  const feideButtonStyle: React.CSSProperties = {
    ...googleButtonStyle,
    background: "#ffffff",
    border: "1px solid rgba(31,74,168,0.26)",
  };

  const ageConfirmStyle: React.CSSProperties = {
    display: needsSignupConfirmation() ? "flex" : "none",
    alignItems: "flex-start",
    gap: 10,
    margin: "0 0 12px",
    padding: "11px 12px",
    borderRadius: 14,
    border: "1px solid rgba(15,23,42,0.10)",
    background: "rgba(255,255,255,0.62)",
    color: "#26374f",
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1.45,
  };

  const ageCheckboxStyle: React.CSSProperties = {
    width: 18,
    height: 18,
    marginTop: 1,
    flex: "0 0 auto",
    accentColor: "#2563eb",
  };

  const modalOverlayStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 1000,
  };

  const modalCardStyle: React.CSSProperties = {
    width: "min(960px, 100%)",
    height: "min(86vh, 820px)",
    background: "#ffffff",
    borderRadius: 24,
    boxShadow: "0 24px 80px rgba(15,23,42,0.28)",
    border: "1px solid rgba(15,23,42,0.08)",
    display: "grid",
    gridTemplateRows: "auto 1fr",
    overflow: "hidden",
  };

  const modalHeaderStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "14px 16px",
    borderBottom: "1px solid rgba(15,23,42,0.08)",
    background: "#f8fafc",
  };

  const modalTitleStyle: React.CSSProperties = {
    margin: 0,
    fontSize: 18,
    fontWeight: 800,
    color: "#0f172a",
  };

  const modalCloseStyle: React.CSSProperties = {
    border: "1px solid rgba(15,23,42,0.12)",
    background: "#fff",
    color: "#0f172a",
    borderRadius: 12,
    minWidth: 44,
    minHeight: 44,
    padding: "0 14px",
    fontWeight: 800,
    cursor: "pointer",
  };

  const modalFrameStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    border: "none",
    background: "#fff",
  };

  const googleLabel = isAnon
    ? safeT("buttons.upgradeGoogle", "Save with Google")
    : mode === "signin"
      ? safeT("buttons.signinGoogle", "Log in with Google")
      : safeT("buttons.signupGoogle", "Create account with Google");

  const feideLabel = isAnon
    ? safeT("buttons.upgradeFeide", "Save with Feide")
    : mode === "signin"
      ? safeT("buttons.signinFeide", "Log in with Feide")
      : safeT("buttons.signupFeide", "Create account with Feide");

  const emailChoiceLabel =
    isAnon
      ? safeT("buttons.upgradeEmail", "Save with email")
      : mode === "signin"
      ? safeT("buttons.useEmailSignin", "Log in with email")
      : safeT("buttons.useEmailSignup", "Create account with email");

  const emailSubmitLabel = loadingEmail
    ? safeT("buttons.working", "Working…")
    : mode === "signin"
      ? safeT("buttons.signinEmail", "Log in")
      : isAnon
        ? safeT("buttons.upgradeAccount", "Save anonymous account")
        : safeT("buttons.createAccount", "Create account");

  return (
    <>
      <main style={pageStyle}>
        <div style={wrapStyle}>
          <div style={cardStyle}>
            <div style={logoWrap}>
              <Image
                src="/logo321ny.png"
                alt="321skole"
                width={220}
                height={72}
                priority
                style={{ width: "auto", height: "56px", objectFit: "contain" }}
              />
            </div>

            <div style={headerStyle}>
              <h1 style={titleStyle}>
                {isAnon
                  ? safeT("title.anon", "Save your work")
                  : mode === "signin"
                  ? safeT("title.signin", "Welcome back")
                  : safeT("title.signup", "Create your account")}
              </h1>

              <p style={subtitleStyle}>
                {isAnon
                  ? safeT(
                    "intro.anon",
                    "Create an account or log in to keep everything you have made."
                  )
                  : mode === "signin"
                    ? safeT("intro.normal", "Log in with Feide, Google or email.")
                    : safeT(
                      "intro.signup",
                      "Create your account first. Then choose whether you are a student, teacher or parent."
                    )}
              </p>
            </div>

            <div style={modeRowStyle}>
              <button
                type="button"
                onClick={() => switchMode("signin")}
                disabled={busy}
                style={modeButton(mode === "signin")}
              >
                {safeT("tabs.signin", "I already have an account")}
              </button>

              <button
                type="button"
                onClick={() => switchMode("signup")}
                disabled={busy}
                style={modeButton(mode === "signup")}
              >
                {safeT("tabs.signup", "I’m new here")}
              </button>
            </div>

            {!showEmailForm ? (
              <label style={ageConfirmStyle}>
                <input
                  type="checkbox"
                  checked={ageConfirmed}
                  onChange={(event) => setAgeConfirmed(event.target.checked)}
                  disabled={busy}
                  style={ageCheckboxStyle}
                />
                <span>
                  {safeT(
                    "legal.ageConfirm",
                    "I am 13 or older, or I use the service with a parent/guardian or school."
                  )}
                </span>
              </label>
            ) : null}

            <div style={choiceGrid}>
              <button
                type="button"
                onClick={handleGoogle}
                disabled={busy}
                style={googleButtonStyle}
              >
                {!loadingGoogle ? <GoogleIcon /> : null}
                <span>{loadingGoogle ? safeT("buttons.working", "Working…") : googleLabel}</span>
              </button>

              <button
                type="button"
                onClick={() => handleFeide()}
                disabled={busy}
                style={feideButtonStyle}
              >
                {!loadingFeide ? <FeideIcon /> : null}
                <span>{loadingFeide ? safeT("buttons.working", "Working…") : feideLabel}</span>
              </button>

              {!showEmailForm ? (
                <button
                  type="button"
                  onClick={() => {
                    setLoginMethod("email");
                    setShowForgotPassword(false);
                    resetMessages();
                  }}
                  disabled={busy}
                  style={emailChoiceButtonStyle}
                >
                  {emailChoiceLabel}
                </button>
              ) : null}

              {!showEmailForm ? (
                <p style={choiceHintStyle}>
                  {mode === "signin"
                    ? safeT(
                      "hints.methodSignin",
                      "Use Feide or Google if that is how you signed up before. Otherwise choose email."
                    )
                    : safeT(
                      "hints.methodSignup",
                      "Choose Feide if you use a school account, Google for a fast start, or email if you prefer password login."
                    )}
                </p>
              ) : null}
            </div>

            {showEmailForm ? (
              <div style={emailPanelStyle}>
                <button
                  type="button"
                  onClick={() => {
                    setLoginMethod("choice");
                    setShowForgotPassword(false);
                    resetMessages();
                  }}
                  style={smallBackButtonStyle}
                >
                  ← {safeT("buttons.backToOptions", "Back to login options")}
                </button>

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
                          resetMessages();
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
                          ...googleButtonStyle,
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

                  <label style={{ ...ageConfirmStyle, margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={ageConfirmed}
                      onChange={(event) => setAgeConfirmed(event.target.checked)}
                      disabled={busy}
                      style={ageCheckboxStyle}
                    />
                    <span>
                      {safeT(
                        "legal.ageConfirm",
                        "I am 13 or older, or I use the service with a parent/guardian or school."
                      )}
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={handleEmail}
                    disabled={busy}
                    style={primaryButtonStyle}
                  >
                    {emailSubmitLabel}
                  </button>

                  {mode === "signup" && isAnon ? (
                    <p
                      style={{
                        margin: 0,
                        fontSize: 13,
                        color: "rgba(15,23,42,0.68)",
                        lineHeight: 1.5,
                      }}
                      dangerouslySetInnerHTML={{
                        __html: safeT(
                          "hints.anonSignup",
                          "Tip: If this email already exists, choose <b>I already have an account</b> instead."
                        ),
                      }}
                    />
                  ) : null}
                </div>
              </div>
            ) : null}

            {info ? <div style={infoBoxStyle}>{info}</div> : null}
            {error ? <div style={errorBoxStyle}>{error}</div> : null}

            <div style={bottomSwitchStyle}>
              {mode === "signin" ? (
                <>
                  {safeT("footer.noAccount", "Don’t have an account?")}{" "}
                  <button
                    type="button"
                    onClick={() => switchMode("signup")}
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
                    onClick={() => switchMode("signin")}
                    style={linkButtonStyle}
                  >
                    {safeT("footer.signinLink", "Log in here")}
                  </button>
                </>
              )}
            </div>

            <div style={legalTextStyle}>
              {safeT("legal.prefix", "By continuing, you accept our")}{" "}
              <button
                type="button"
                onClick={() => setLegalModal("terms")}
                style={footerLinkButtonStyle}
              >
                {safeT("legal.terms", "Terms")}
              </button>{" "}
              {safeT("legal.and", "and")}{" "}
              <button
                type="button"
                onClick={() => setLegalModal("privacy")}
                style={footerLinkButtonStyle}
              >
                {safeT("legal.privacy", "Privacy Policy")}
              </button>
              .
            </div>
            <div style={{ ...legalTextStyle, marginTop: 8 }}>
              <Link href={`/${locale}/privacy`} style={footerLinkButtonStyle}>
                {safeT("legal.privacy", "Privacy Policy")}
              </Link>
              <span aria-hidden="true"> · </span>
              <Link href={`/${locale}/terms`} style={footerLinkButtonStyle}>
                {safeT("legal.terms", "Terms")}
              </Link>
              <span aria-hidden="true"> · </span>
              <Link href={`/${locale}/sales-terms`} style={footerLinkButtonStyle}>
                {safeT("legal.salesTerms", "Sales terms")}
              </Link>
              <span aria-hidden="true"> · </span>
              <Link href={`/${locale}/contact`} style={footerLinkButtonStyle}>
                {safeT("legal.contact", "Contact")}
              </Link>
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

      {legalModal ? (
        <div
          style={modalOverlayStyle}
          onClick={() => setLegalModal(null)}
        >
          <div
            style={modalCardStyle}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={modalHeaderStyle}>
              <h2 style={modalTitleStyle}>{modalTitle}</h2>
              <button
                type="button"
                onClick={() => setLegalModal(null)}
                style={modalCloseStyle}
              >
                {safeT("legal.close", "Close")}
              </button>
            </div>

            <iframe
              src={modalSrc}
              title={modalTitle}
              style={modalFrameStyle}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
