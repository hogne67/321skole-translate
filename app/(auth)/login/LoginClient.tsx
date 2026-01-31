// app/(auth)/login/LoginClient.tsx
"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { signInWithGoogle, signInWithEmail, signUpWithEmail } from "@/lib/auth";
import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { linkAnonymousWithGoogle, linkAnonymousWithEmailPassword } from "@/lib/anonAuth";

function friendlyAuthError(msg: string) {
  const m = (msg || "").toLowerCase();
  if (m.includes("auth/invalid-credential") || m.includes("auth/wrong-password"))
    return "Feil e-post eller passord.";
  if (m.includes("auth/user-not-found")) return "Fant ingen bruker med den e-posten.";
  if (m.includes("auth/email-already-in-use")) return "E-posten er allerede i bruk.";
  if (m.includes("auth/weak-password")) return "Passordet er for svakt (minst 6 tegn).";
  if (m.includes("auth/invalid-email")) return "Ugyldig e-postadresse.";
  if (m.includes("popup-closed-by-user")) return "Innlogging avbrutt.";
  if (m.includes("already in use")) return "E-posten er allerede i bruk. Logg inn i stedet.";
  return "Kunne ikke logge inn. Prøv igjen.";
}

export default function LoginClient() {
  const sp = useSearchParams();
  const router = useRouter();

  const safeNext = useMemo(() => {
    const rawNext = sp.get("next") || "/student";
    const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/student";
    return next === "/login" || next === "/onboarding" ? "/student" : next;
  }, [sp]);

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
        await linkAnonymousWithGoogle(); // beholder uid
      } else {
        await signInWithGoogle();
      }
      router.replace(safeNext);
    } catch (e: any) {
      setError(friendlyAuthError(String(e?.code || e?.message || e)));
    } finally {
      setLoadingGoogle(false);
    }
  }

  async function handleEmail() {
    setError(null);

    const e = email.trim();
    if (!e) return setError("Skriv inn e-post.");
    if (!password) return setError("Skriv inn passord.");

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
      router.replace(safeNext);
    } catch (e: any) {
      setError(friendlyAuthError(String(e?.code || e?.message || e)));
    } finally {
      setLoadingEmail(false);
    }
  }

  return (
    <main style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
      <h1>{mode === "signin" ? "Logg inn" : "Registrer"}</h1>

      {isAnon ? (
        <p style={{ marginTop: 6, opacity: 0.75 }}>
          Du bruker en midlertidig (anonym) bruker. Ved å logge inn oppgraderer du kontoen og beholder det du har gjort.
        </p>
      ) : (
        <p style={{ marginTop: 6, opacity: 0.75 }}>
          Logg inn for å lagre, sende inn, og søke om teacher-tilgang.
        </p>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button
          onClick={() => setMode("signin")}
          disabled={loadingEmail || loadingGoogle}
          style={{ padding: "8px 12px" }}
        >
          Logg inn
        </button>
        <button
          onClick={() => setMode("signup")}
          disabled={loadingEmail || loadingGoogle}
          style={{ padding: "8px 12px" }}
        >
          Registrer
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        <button
          onClick={handleGoogle}
          disabled={loadingGoogle || loadingEmail}
          style={{ width: "100%", padding: "10px 12px" }}
        >
          {loadingGoogle ? "Jobber…" : isAnon ? "Oppgrader med Google" : "Logg inn med Google"}
        </button>
      </div>

      <div style={{ marginTop: 16 }}>
        {mode === "signup" && (
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Navn (valgfritt)"
            style={{ width: "100%", padding: "10px 12px", marginBottom: 8 }}
          />
        )}

        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-post"
          style={{ width: "100%", padding: "10px 12px", marginBottom: 8 }}
        />

        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Passord"
          type="password"
          style={{ width: "100%", padding: "10px 12px" }}
        />

        <button
          onClick={handleEmail}
          disabled={loadingEmail || loadingGoogle}
          style={{ width: "100%", padding: "10px 12px", marginTop: 10 }}
        >
          {loadingEmail
            ? "Jobber…"
            : mode === "signin"
            ? "Logg inn"
            : isAnon
            ? "Oppgrader konto"
            : "Opprett bruker"}
        </button>

        {mode === "signup" && isAnon ? (
          <p style={{ marginTop: 8, fontSize: 13, opacity: 0.75 }}>
            Tips: Hvis e-posten allerede finnes, velg <b>Logg inn</b> i stedet.
          </p>
        ) : null}
      </div>

      {error && <p style={{ marginTop: 12, color: "crimson" }}>{error}</p>}
    </main>
  );
}
