"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { sendEmailVerification } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useUserProfile } from "@/lib/useUserProfile";
import { useLocale } from "next-intl";

function isEmailPasswordUser(user: NonNullable<ReturnType<typeof useUserProfile>["user"]>) {
  return user.providerData.some((provider) => provider.providerId === "password");
}

function copyFor(locale: string) {
  if (locale === "en") {
    return {
      title: "Verify your email within {days} days",
      expiredTitle: "Verify your email to continue creating",
      text: "You can read, view and study while waiting. Creating family rooms and using AI tools require a verified email.",
      expiredText: "The verification period has ended. You can still read and view content, but creating family rooms and using AI tools require a verified email.",
      hint: "Check your inbox and spam/junk folder.",
      resend: "Send verification email",
      sent: "Verification email sent. Please check your inbox.",
      failed: "We could not send the email right now. Try again in a moment.",
      tooMany: "Too many attempts right now. Please wait a while before trying again.",
      reload: "I have verified. Check again",
      missingEmail: "I am not receiving the email",
      missingSent: "Thanks. We have received your message and can follow up.",
      missingFailed: "Could not send the message right now.",
    };
  }

  if (locale === "pt") {
    return {
      title: "Confirme seu e-mail em até {days} dias",
      expiredTitle: "Confirme seu e-mail para continuar criando",
      text: "Você pode ler, ver e estudar enquanto espera. Criar espaços familiares e usar ferramentas de IA exige e-mail confirmado.",
      expiredText: "O prazo de confirmação terminou. Você ainda pode ler e ver conteúdo, mas criar espaços familiares e usar ferramentas de IA exige e-mail confirmado.",
      hint: "Verifique a caixa de entrada e também spam/lixo eletrônico.",
      resend: "Enviar e-mail de confirmação",
      sent: "E-mail de confirmação enviado. Verifique sua caixa de entrada.",
      failed: "Não foi possível enviar o e-mail agora. Tente novamente em instantes.",
      tooMany: "Muitas tentativas agora. Aguarde um pouco antes de tentar novamente.",
      reload: "Já confirmei. Verificar novamente",
      missingEmail: "Não recebi o e-mail",
      missingSent: "Obrigado. Recebemos sua mensagem e podemos acompanhar.",
      missingFailed: "Não foi possível enviar a mensagem agora.",
    };
  }

  return {
    title: "Bekreft e-posten din innen {days} dager",
    expiredTitle: "Bekreft e-posten for å fortsette å lage",
    text: "Du kan lese, se og studere mens du venter. For å lage familierom og bruke KI-verktøy må e-posten være bekreftet.",
    expiredText: "Bekreftelsesfristen er ute. Du kan fortsatt lese og se innhold, men for å lage familierom og bruke KI-verktøy må e-posten være bekreftet.",
    hint: "Sjekk innboksen og eventuelt søppelpost/junk.",
    resend: "Send bekreftelsesmail",
    sent: "Bekreftelsesmail er sendt. Sjekk e-posten din.",
    failed: "Vi klarte ikke å sende e-post akkurat nå. Prøv igjen om litt.",
    tooMany: "Det er gjort for mange forsøk akkurat nå. Vent litt før du prøver igjen.",
    reload: "Jeg har bekreftet. Sjekk på nytt",
    missingEmail: "Jeg får ikke e-post",
    missingSent: "Takk. Vi har mottatt beskjed og kan følge opp.",
    missingFailed: "Kunne ikke sende beskjed akkurat nå.",
  };
}

function firebaseLanguageCode(locale: string) {
  if (locale === "nb") return "no";
  if (locale === "pt") return "pt-BR";
  return locale;
}

function daysLeft(user: NonNullable<ReturnType<typeof useUserProfile>["user"]>) {
  const createdAt = Date.parse(user.metadata.creationTime || "");
  if (!Number.isFinite(createdAt)) return 10;

  const deadline = createdAt + 10 * 24 * 60 * 60 * 1000;
  const remaining = Math.ceil((deadline - Date.now()) / (24 * 60 * 60 * 1000));
  return Math.max(0, remaining);
}

export default function ParentEmailVerificationGate({ children }: { children: ReactNode }) {
  const { user, loading } = useUserProfile();
  const locale = useLocale();
  const t = copyFor(locale);
  const [busy, setBusy] = useState(false);
  const [helpBusy, setHelpBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (loading || !user) return null;

  const shouldVerify = !user.emailVerified && isEmailPasswordUser(user);
  if (!shouldVerify) return <>{children}</>;
  const remainingDays = daysLeft(user);
  const expired = remainingDays <= 0;
  const title = expired
    ? t.expiredTitle
    : t.title.replace("{days}", String(remainingDays));

  async function resend() {
    if (!auth.currentUser) return;

    setBusy(true);
    setMessage(null);
    setError(null);

    try {
      auth.languageCode = firebaseLanguageCode(locale);
      await sendEmailVerification(auth.currentUser);
      setMessage(t.sent);
    } catch (err) {
      console.warn("parent resend verification failed", err);
      setError(err instanceof Error && err.message === "too_many_attempts" ? t.tooMany : t.failed);
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    setBusy(true);
    setMessage(null);
    setError(null);

    try {
      await auth.currentUser?.reload();
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  async function reportMissingEmail() {
    if (!auth.currentUser || helpBusy) return;

    setHelpBusy(true);
    setMessage(null);
    setError(null);

    try {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch("/api/support-tickets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          category: "login",
          locale,
          page: typeof window !== "undefined" ? window.location.pathname : "/parent",
          name: auth.currentUser.displayName || "",
          contact: auth.currentUser.email || "",
          message:
            locale === "en"
              ? "Parent email verification: I have requested a verification email, but I have not received it and I have checked spam/junk."
              : locale === "pt"
                ? "Confirmação de e-mail dos pais: solicitei o e-mail de confirmação, mas não recebi e já verifiquei spam/lixo eletrônico."
                : "Forelder e-postverifisering: Jeg har bedt om bekreftelsesmail, men har ikke mottatt den og har sjekket søppelpost/junk.",
        }),
      });

      if (!response.ok) throw new Error("support request failed");
      setMessage(t.missingSent);
    } catch (err) {
      console.warn("missing verification email report failed", err);
      setError(t.missingFailed);
    } finally {
      setHelpBusy(false);
    }
  }

  return (
    <>
      <section style={bannerStyle}>
        <div style={bannerInnerStyle}>
          <div style={copyStyle}>
            <div style={badgeStyle}>321school</div>
            <h2 style={titleStyle}>{title}</h2>
            <p style={textStyle}>{expired ? t.expiredText : t.text}</p>
            <p style={hintStyle}>{t.hint}</p>
            {message ? <p style={successStyle}>{message}</p> : null}
            {error ? <p style={errorStyle}>{error}</p> : null}
          </div>
          <div style={actionsStyle}>
            <button type="button" onClick={resend} disabled={busy} style={primaryButtonStyle}>
              {busy ? "..." : t.resend}
            </button>
            <button type="button" onClick={refresh} disabled={busy} style={secondaryButtonStyle}>
              {t.reload}
            </button>
            <button
              type="button"
              onClick={reportMissingEmail}
              disabled={helpBusy}
              style={tertiaryButtonStyle}
            >
              {helpBusy ? "..." : t.missingEmail}
            </button>
          </div>
        </div>
      </section>
      {children}
    </>
  );
}

const bannerStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px 0",
  background: "linear-gradient(180deg, rgba(124,199,255,0.16), rgba(255,255,255,0))",
};

const bannerInnerStyle: React.CSSProperties = {
  maxWidth: 1120,
  margin: "0 auto",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  flexWrap: "wrap",
  border: "1px solid #bae6fd",
  borderRadius: 16,
  background: "#f0f9ff",
  boxShadow: "0 10px 28px rgba(14,116,144,0.10)",
  padding: "14px 16px",
};

const copyStyle: React.CSSProperties = {
  flex: "1 1 420px",
};

const badgeStyle: React.CSSProperties = {
  display: "inline-flex",
  marginBottom: 8,
  padding: "7px 12px",
  borderRadius: 999,
  background: "#e0f2fe",
  color: "#0369a1",
  fontWeight: 900,
  fontSize: 13,
};

const titleStyle: React.CSSProperties = {
  margin: "0 0 6px",
  color: "#0f172a",
  fontSize: 20,
  lineHeight: 1.12,
  fontWeight: 950,
};

const textStyle: React.CSSProperties = {
  margin: 0,
  maxWidth: 720,
  color: "#334155",
  fontSize: 14,
  lineHeight: 1.45,
  fontWeight: 650,
};

const hintStyle: React.CSSProperties = {
  margin: "6px 0 0",
  color: "#64748b",
  fontSize: 13,
  fontWeight: 700,
};

const actionsStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "flex-end",
  gap: 10,
  flex: "0 1 auto",
};

const primaryButtonStyle: React.CSSProperties = {
  minHeight: 46,
  border: 0,
  borderRadius: 14,
  padding: "0 18px",
  background: "#169125",
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  minHeight: 46,
  border: "1px solid #cbd5e1",
  borderRadius: 14,
  padding: "0 18px",
  background: "#fff",
  color: "#0f172a",
  fontWeight: 900,
  cursor: "pointer",
};

const tertiaryButtonStyle: React.CSSProperties = {
  minHeight: 46,
  border: "1px solid #bae6fd",
  borderRadius: 14,
  padding: "0 18px",
  background: "#e0f2fe",
  color: "#075985",
  fontWeight: 900,
  cursor: "pointer",
};

const successStyle: React.CSSProperties = {
  margin: "8px 0 0",
  color: "#047857",
  fontWeight: 800,
};

const errorStyle: React.CSSProperties = {
  margin: "8px 0 0",
  color: "#b91c1c",
  fontWeight: 800,
};
