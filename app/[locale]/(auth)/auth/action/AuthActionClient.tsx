"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { applyActionCode } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useLocale } from "next-intl";

type Status = "working" | "success" | "error" | "unsupported";

const COPY = {
  nb: {
    workingTitle: "Bekrefter e-posten din",
    workingText: "Vent et øyeblikk mens vi bekrefter kontoen.",
    successTitle: "E-posten er bekreftet",
    successText: "Du kan nå logge inn og bruke 321skole.",
    errorTitle: "Lenken virker ikke",
    errorText:
      "Bekreftelseslenken kan være brukt allerede eller ha utløpt. Prøv å logge inn på nytt, så sender vi en ny lenke.",
    unsupportedTitle: "Ukjent handling",
    unsupportedText: "Denne lenken kan ikke behandles her.",
    button: "Gå til innlogging",
    brand: "321skole",
  },
  en: {
    workingTitle: "Verifying your email",
    workingText: "Please wait while we verify your account.",
    successTitle: "Email verified",
    successText: "You can now log in and use 321school.",
    errorTitle: "The link did not work",
    errorText:
      "The verification link may already have been used or may have expired. Try logging in again and we will send a new link.",
    unsupportedTitle: "Unknown action",
    unsupportedText: "This link cannot be handled here.",
    button: "Go to login",
    brand: "321school",
  },
  pt: {
    workingTitle: "Confirmando seu e-mail",
    workingText: "Aguarde enquanto confirmamos sua conta.",
    successTitle: "E-mail confirmado",
    successText: "Agora você pode entrar e usar a 321escola.",
    errorTitle: "O link não funcionou",
    errorText:
      "O link de confirmação pode já ter sido usado ou expirado. Tente entrar novamente e enviaremos um novo link.",
    unsupportedTitle: "Ação desconhecida",
    unsupportedText: "Este link não pode ser processado aqui.",
    button: "Ir para login",
    brand: "321escola",
  },
} as const;

function textFor(locale: string) {
  if (locale === "en" || locale === "pt") return COPY[locale];
  return COPY.nb;
}

export default function AuthActionClient() {
  const locale = useLocale();
  const searchParams = useSearchParams();
  const t = textFor(locale);
  const [status, setStatus] = useState<Status>("working");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const mode = searchParams.get("mode");
      const oobCode = searchParams.get("oobCode");

      if (mode !== "verifyEmail" || !oobCode) {
        if (!cancelled) setStatus("unsupported");
        return;
      }

      try {
        await applyActionCode(auth, oobCode);
        await auth.currentUser?.reload().catch(() => undefined);
        if (!cancelled) setStatus("success");
      } catch (error) {
        console.error("email action failed", error);
        if (!cancelled) setStatus("error");
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  const title =
    status === "success"
      ? t.successTitle
      : status === "error"
        ? t.errorTitle
        : status === "unsupported"
          ? t.unsupportedTitle
          : t.workingTitle;

  const body =
    status === "success"
      ? t.successText
      : status === "error"
        ? t.errorText
        : status === "unsupported"
          ? t.unsupportedText
          : t.workingText;

  return (
    <main style={pageStyle}>
      <style>{`
        @keyframes authActionSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      <section style={cardStyle}>
        <Image
          src="/logo321ny.png"
          alt={t.brand}
          width={96}
          height={96}
          priority
          style={{ width: 62, height: 62, objectFit: "contain" }}
        />
        <p style={eyebrowStyle}>{t.brand}</p>
        <h1 style={titleStyle}>{title}</h1>
        <p style={bodyStyle}>{body}</p>
        {status === "working" ? <div style={loaderStyle} aria-hidden="true" /> : null}
        {status !== "working" ? (
          <Link href={`/${locale}/login?verified=${status === "success" ? "1" : "0"}`} style={buttonStyle}>
            {t.button}
          </Link>
        ) : null}
      </section>
    </main>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  padding: 18,
  background: "linear-gradient(180deg, rgba(124,199,255,0.16), #fff 360px)",
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 480,
  display: "grid",
  justifyItems: "center",
  gap: 14,
  padding: "34px 28px",
  borderRadius: 24,
  border: "1px solid rgba(15,23,42,0.10)",
  background: "#e4e9ee",
  boxShadow: "0 22px 60px rgba(15,23,42,0.12)",
  textAlign: "center",
};

const eyebrowStyle: React.CSSProperties = {
  margin: 0,
  color: "#2563eb",
  fontSize: 13,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: 0,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  color: "#0f172a",
  fontSize: 30,
  lineHeight: 1.1,
  fontWeight: 950,
};

const bodyStyle: React.CSSProperties = {
  margin: 0,
  maxWidth: 370,
  color: "#334155",
  fontSize: 16,
  lineHeight: 1.6,
  fontWeight: 650,
};

const buttonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 48,
  padding: "0 18px",
  borderRadius: 14,
  background: "#169125",
  color: "#fff",
  fontWeight: 900,
  textDecoration: "none",
  boxShadow: "0 12px 28px rgba(22,145,37,0.22)",
};

const loaderStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: "50%",
  border: "4px solid rgba(37,99,235,0.18)",
  borderTopColor: "#2563eb",
  animation: "authActionSpin 0.85s linear infinite",
};
