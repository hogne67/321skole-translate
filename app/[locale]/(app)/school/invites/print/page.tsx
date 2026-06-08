"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { useEffect, useMemo, useState } from "react";

type Copy = {
  back: string;
  print: string;
  title: string;
  schoolLine: (schoolName: string) => string;
  loginWith: string;
  linkAndQr: string;
  greeting: string;
  schoolFallback: string;
  adminFallback: string;
  qrAlt: string;
  missing: string;
};

const copy: Record<string, Copy> = {
  nb: {
    back: "Tilbake til invitasjoner",
    print: "Skriv ut / lagre PDF",
    title: "Velkommen til 321school",
    schoolLine: (schoolName) => `Velkommen til ${schoolName} på 321school`,
    loginWith: "Du må logge deg inn med denne e-postadressen:",
    linkAndQr: "Her er lenke og QR-kode",
    greeting: "Hilsen",
    schoolFallback: "Skolen",
    adminFallback: "Administrator",
    qrAlt: "QR-kode for invitasjonslenke",
    missing: "Invitasjonslenken mangler. Gå tilbake og åpne PDF-en fra en nyopprettet invitasjon.",
  },
  en: {
    back: "Back to invitations",
    print: "Print / save PDF",
    title: "Welcome to 321school",
    schoolLine: (schoolName) => `Welcome to ${schoolName} on 321school`,
    loginWith: "You must sign in with this email address:",
    linkAndQr: "Here is the link and QR code",
    greeting: "Regards",
    schoolFallback: "The school",
    adminFallback: "Administrator",
    qrAlt: "QR code for invitation link",
    missing: "The invitation link is missing. Go back and open the PDF from a newly created invitation.",
  },
  pt: {
    back: "Voltar aos convites",
    print: "Imprimir / salvar PDF",
    title: "Bem-vindo ao 321school",
    schoolLine: (schoolName) => `Bem-vindo a ${schoolName} no 321school`,
    loginWith: "Voce deve entrar com este email:",
    linkAndQr: "Aqui estao o link e o QR code",
    greeting: "Cumprimentos",
    schoolFallback: "A escola",
    adminFallback: "Administrador",
    qrAlt: "QR code do convite",
    missing: "O link do convite esta em falta. Volte e abra o PDF a partir de um convite recem-criado.",
  },
};

function pickCopy(locale: string) {
  return copy[locale] ?? copy.nb;
}

function safeText(value: string | null, fallback: string) {
  const trimmed = String(value ?? "").trim();
  return trimmed || fallback;
}

function safeFilenamePart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export default function SchoolInvitePrintPage() {
  const locale = useLocale();
  const text = pickCopy(locale);
  const params = useSearchParams();

  const link = safeText(params.get("link"), "");
  const email = safeText(params.get("email"), "");
  const schoolName = safeText(params.get("schoolName"), text.schoolFallback);
  const adminName = safeText(params.get("adminName"), text.adminFallback);

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const title = useMemo(() => text.schoolLine(schoolName), [schoolName, text]);

  useEffect(() => {
    document.title = `321school-invitasjon-${safeFilenamePart(schoolName)}.pdf`;
  }, [schoolName]);

  useEffect(() => {
    if (!link) return;
    let alive = true;

    (async () => {
      const QRCode = (await import("qrcode")).default;
      const dataUrl = await QRCode.toDataURL(link, {
        margin: 1,
        scale: 10,
        color: { dark: "#0f172a", light: "#ffffff" },
      });
      if (alive) setQrDataUrl(dataUrl);
    })().catch(() => {
      if (alive) setQrDataUrl(null);
    });

    return () => {
      alive = false;
    };
  }, [link]);

  if (!link) {
    return (
      <main style={styles.missingPage}>
        <p>{text.missing}</p>
        <Link href={`/${locale}/school/invites`} style={styles.backLink}>
          {text.back}
        </Link>
      </main>
    );
  }

  return (
    <main className="school-invite-print-root" style={styles.root}>
      <div className="no-print" style={styles.toolbar}>
        <Link href={`/${locale}/school/invites`} style={styles.backLink}>
          {text.back}
        </Link>
        <button type="button" onClick={() => window.print()} style={styles.printButton}>
          {text.print}
        </button>
      </div>

      <section className="print-page" style={styles.page}>
        <div style={styles.topline} />

        <header style={styles.header}>
          <div>
            <div style={styles.kicker}>321school</div>
            <h1 style={styles.title}>{text.title}</h1>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo321ny.png" alt="321school" style={styles.logo} />
        </header>

        <section style={styles.hero}>
          <h2 style={styles.heroTitle}>{title}</h2>
          <p style={styles.loginText}>{text.loginWith}</p>
          <div style={styles.emailBox}>{email || "-"}</div>
        </section>

        <section style={styles.qrSection}>
          <div style={styles.linkBlock}>
            <h3 style={styles.sectionTitle}>{text.linkAndQr}</h3>
            <p style={styles.linkText}>{link}</p>
          </div>

          <div style={styles.qrBox}>
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDataUrl} alt={text.qrAlt} style={styles.qrImage} />
            ) : (
              <div style={styles.qrFallback}>QR</div>
            )}
          </div>
        </section>

        <footer style={styles.footer}>
          <div>{text.greeting}</div>
          <strong>{schoolName}</strong>
          <span>{adminName}</span>
        </footer>
      </section>

      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 0;
        }

        .school-invite-print-root,
        .school-invite-print-root * {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        @media print {
          html,
          body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }

          body * {
            visibility: hidden !important;
          }

          .school-invite-print-root,
          .school-invite-print-root * {
            visibility: visible !important;
          }

          .school-invite-print-root {
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }

          .no-print {
            display: none !important;
          }

          .print-page {
            width: 210mm !important;
            min-height: 297mm !important;
            margin: 0 !important;
            box-shadow: none !important;
          }
        }
      `}</style>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: "100vh",
    padding: 16,
    background: "#e2e8f0",
    color: "#0f172a",
  },
  toolbar: {
    width: "100%",
    maxWidth: 820,
    margin: "0 auto 14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  backLink: {
    color: "#0f172a",
    fontSize: 14,
    fontWeight: 800,
    textDecoration: "underline",
    textUnderlineOffset: 4,
  },
  printButton: {
    border: "none",
    borderRadius: 12,
    padding: "10px 14px",
    background: "#0f172a",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
  },
  missingPage: {
    maxWidth: 560,
    margin: "48px auto",
    padding: 20,
    display: "grid",
    gap: 12,
  },
  page: {
    boxSizing: "border-box",
    width: "100%",
    maxWidth: 820,
    minHeight: 1060,
    margin: "0 auto",
    padding: 44,
    background: "white",
    boxShadow: "0 18px 50px rgba(15,23,42,0.18)",
  },
  topline: {
    height: 8,
    borderRadius: 999,
    background: "linear-gradient(90deg, #2563eb, #16a34a)",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 20,
    paddingTop: 26,
  },
  kicker: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: 0,
  },
  title: {
    margin: "4px 0 0",
    fontSize: 44,
    lineHeight: 1.05,
    fontWeight: 950,
    letterSpacing: 0,
  },
  logo: {
    width: 78,
    height: 78,
    objectFit: "contain",
  },
  hero: {
    marginTop: 42,
    padding: 28,
    border: "2px solid #0f172a",
    borderRadius: 20,
    background: "#f8fafc",
  },
  heroTitle: {
    margin: 0,
    fontSize: 30,
    lineHeight: 1.15,
    fontWeight: 950,
    letterSpacing: 0,
  },
  loginText: {
    margin: "26px 0 10px",
    color: "#334155",
    fontSize: 18,
    fontWeight: 800,
  },
  emailBox: {
    padding: "16px 18px",
    borderRadius: 16,
    border: "2px solid #2563eb",
    background: "white",
    color: "#0f172a",
    fontSize: 24,
    fontWeight: 950,
    wordBreak: "break-word",
  },
  qrSection: {
    marginTop: 28,
    display: "grid",
    gridTemplateColumns: "minmax(0,1fr) 230px",
    gap: 22,
    alignItems: "stretch",
  },
  linkBlock: {
    padding: 24,
    borderRadius: 20,
    border: "2px solid #cbd5e1",
  },
  sectionTitle: {
    margin: 0,
    fontSize: 22,
    fontWeight: 950,
    letterSpacing: 0,
  },
  linkText: {
    margin: "18px 0 0",
    color: "#334155",
    fontSize: 15,
    lineHeight: 1.5,
    wordBreak: "break-all",
  },
  qrBox: {
    padding: 14,
    borderRadius: 20,
    border: "2px solid #0f172a",
    display: "grid",
    placeItems: "center",
    background: "white",
  },
  qrImage: {
    width: 198,
    height: 198,
  },
  qrFallback: {
    display: "grid",
    placeItems: "center",
    width: 198,
    height: 198,
    color: "#64748b",
    fontWeight: 900,
  },
  footer: {
    marginTop: 56,
    display: "grid",
    gap: 8,
    color: "#0f172a",
    fontSize: 20,
    lineHeight: 1.35,
  },
};
