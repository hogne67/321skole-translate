// \app\[locale]\(auth)\login\LoginClient.tsx
"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { signInWithGoogle, signInWithEmail, signUpWithEmail } from "@/lib/auth";
import { linkAnonymousWithGoogle, linkAnonymousWithEmailPassword } from "@/lib/anonAuth";
import { useLocale, useTranslations } from "next-intl";

// ✅ Null-safe/unknown-safe error extraction
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
  if (m.includes("popup-closed-by-user")) return "popupClosed";

  return "generic";
}

export default function LoginClient() {
  const t = useTranslations("auth.login");
  const locale = useLocale();

  const sp = useSearchParams();
  const router = useRouter();

  // We forward raw `next` to post-login, and let that route decide teacher vs student.
  const postLoginUrl = useMemo(() => {
    const rawNext = sp.get("next");
    const q = rawNext ? `?next=${encodeURIComponent(rawNext)}` : "";
    return `/${locale}/post-login${q}`;
  }, [sp, locale]);

  const [mode, setMode] = useState<"signin" | "signup">("signin");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingEmail, setLoadingEmail] = useState(false);

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const isAnon = !!currentUser?.isAnonymous;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setCurrentUser(u));
    return () => unsub();
  }, []);

  async function handleGoogle() {
    setError(null);
    setLoadingGoogle(true);
    try {
      if (isAnon) {
        await linkAnonymousWithGoogle(); // keeps uid
      } else {
        await signInWithGoogle();
      }
      router.replace(postLoginUrl);
    } catch (err: unknown) {
      const key = friendlyAuthErrorKey(toErrorString(err));
      setError(t(`errors.${key}`));
    } finally {
      setLoadingGoogle(false);
    }
  }

  async function handleEmail() {
    setError(null);

    const e = email.trim();
    if (!e) return setError(t("errors.missingEmail"));
    if (!password) return setError(t("errors.missingPassword"));

    setLoadingEmail(true);
    try {
      if (mode === "signin") {
        await signInWithEmail(e, password);
      } else {
        if (isAnon) {
          await linkAnonymousWithEmailPassword(e, password);
        } else {
          await signUpWithEmail(e, password, displayName);
        }
      }
      router.replace(postLoginUrl);
    } catch (err: unknown) {
      const key = friendlyAuthErrorKey(toErrorString(err));
      setError(t(`errors.${key}`));
    } finally {
      setLoadingEmail(false);
    }
  }

  return (
    <main style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
      <h1>{mode === "signin" ? t("title.signin") : t("title.signup")}</h1>

      {isAnon ? (
        <p style={{ marginTop: 6, opacity: 0.75 }}>{t("intro.anon")}</p>
      ) : (
        <p style={{ marginTop: 6, opacity: 0.75 }}>{t("intro.normal")}</p>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button
          onClick={() => setMode("signin")}
          disabled={loadingEmail || loadingGoogle}
          style={{ padding: "8px 12px" }}
        >
          {t("tabs.signin")}
        </button>
        <button
          onClick={() => setMode("signup")}
          disabled={loadingEmail || loadingGoogle}
          style={{ padding: "8px 12px" }}
        >
          {t("tabs.signup")}
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        <button
          onClick={handleGoogle}
          disabled={loadingGoogle || loadingEmail}
          style={{ width: "100%", padding: "10px 12px" }}
        >
          {loadingGoogle
            ? t("buttons.working")
            : isAnon
              ? t("buttons.upgradeGoogle")
              : t("buttons.signinGoogle")}
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        {mode === "signup" && (
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t("fields.displayNamePlaceholder")}
            style={{ width: "100%", padding: "10px 12px", marginBottom: 8 }}
          />
        )}

        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("fields.emailPlaceholder")}
          style={{ width: "100%", padding: "10px 12px", marginBottom: 8 }}
        />

        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("fields.passwordPlaceholder")}
          type="password"
          style={{ width: "100%", padding: "10px 12px" }}
        />

        <button
          onClick={handleEmail}
          disabled={loadingEmail || loadingGoogle}
          style={{ width: "100%", padding: "10px 12px", marginTop: 10 }}
        >
          {loadingEmail
            ? t("buttons.working")
            : mode === "signin"
              ? t("buttons.signinEmail")
              : isAnon
                ? t("buttons.upgradeAccount")
                : t("buttons.createAccount")}
        </button>

        {mode === "signup" && isAnon ? (
          <p
            style={{ marginTop: 8, fontSize: 13, opacity: 0.75 }}
            dangerouslySetInnerHTML={{ __html: t("hints.anonSignup") }}
          />
        ) : null}
      </div>

      {error && <p style={{ marginTop: 12, color: "crimson" }}>{error}</p>}
    </main>
  );
}