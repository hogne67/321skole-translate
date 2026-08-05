"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { useLocale } from "next-intl";
import AuthGate from "@/components/AuthGate";
import { db } from "@/lib/firebase";

type SpacePrintData = {
  title?: unknown;
  code?: unknown;
  joinCode?: unknown;
};

type Copy = {
  loading: string;
  notFound: string;
  back: string;
  print: string;
  title: string;
  roomName: string;
  roomCode: string;
  scan: string;
  joinTitle: string;
  joinText: string;
  anonymousTitle: string;
  anonymousText: string;
  accountTitle: string;
  accountText: string;
  freeTitle: string;
  freeText: string;
  passwordTitle: string;
  passwordText: string;
  under13Title: string;
  under13Text: string;
  parentTitle: string;
  parentText: string;
  qrAlt: string;
  footer: string;
};

const copy: Record<string, Copy> = {
  no: {
    loading: "Laster rom...",
    notFound: "Fant ikke rommet.",
    back: "Tilbake til rommet",
    print: "Skriv ut / lagre PDF",
    title: "Velkommen til 321school",
    roomName: "Rom/space",
    roomCode: "Romkode",
    scan: "Skann QR-koden eller bruk romkoden.",
    joinTitle: "Slik kommer eleven inn",
    joinText: 'Gå til 321school og trykk på "Spaces". Velg "Bli med i space" og skriv inn koden.',
    anonymousTitle: "Anonym tilgang",
    anonymousText:
      "Eleven kan bli med med romkode eller QR uten konto og uten e-post. Lærer kan se navnet eleven skriver inn og arbeidet som gjøres i rommet. Anonym tilgang huskes vanligvis bare på samme enhet og nettleser.",
    accountTitle: "Innlogget bruker",
    accountText:
      "Konto kan brukes når skolen eller foresatte har åpnet for det. Med konto kan arbeid lagres og brukes på tvers av enheter.",
    freeTitle: "Gratis for elever",
    freeText: "All bruk i spaces er gratis for elever og studenter med gyldig romkode delt av lærer eller skole.",
    passwordTitle: "Brukernavn og passord",
    passwordText:
      "Hvis eleven bruker konto: bruk riktig e-postadresse, lag et godt passord og ikke del passordet med andre. Mister du tilgang, spør læreren eller en voksen hjemme.",
    under13Title: "For barn under 13 år",
    under13Text:
      "Barn under 13 år bør bruke anonym tilgang med romkode, med mindre skolen eller foresatte har avklart bruk av konto.",
    parentTitle: "Til foreldre/foresatte",
    parentText:
      "Dette rommet brukes til skolearbeid i 321school. Elever trenger ikke privat e-post for å bli med anonymt. Ta kontakt med lærer/skole ved spørsmål om bruk eller sletting av elevens arbeid.",
    qrAlt: "QR-kode for å bli med i rommet",
    footer: "321school.com",
  },
  en: {
    loading: "Loading room...",
    notFound: "Room not found.",
    back: "Back to room",
    print: "Print / save PDF",
    title: "Welcome to 321school",
    roomName: "Room/space",
    roomCode: "Room code",
    scan: "Scan the QR code or use the room code.",
    joinTitle: "How students join",
    joinText: 'Go to 321school and open "Spaces". Choose "Join space" and enter the code.',
    anonymousTitle: "Anonymous access",
    anonymousText:
      "Students can join with a room code or QR code without an account and without email. The teacher can see the name the student enters and the work done in the room. Anonymous access is usually remembered only on the same device and browser.",
    accountTitle: "Signed-in user",
    accountText:
      "An account can be used when the school or guardians have approved it. With an account, work can be saved and used across devices.",
    freeTitle: "Free for students",
    freeText: "Using spaces is free for students with a valid room code shared by a teacher or school.",
    passwordTitle: "Username and password",
    passwordText:
      "If the student uses an account: use the correct email address, make a strong password, and do not share it. If access is lost, ask the teacher or an adult at home.",
    under13Title: "For children under 13",
    under13Text:
      "Children under 13 should use anonymous access with the room code unless the school or guardians have approved account use.",
    parentTitle: "For parents/guardians",
    parentText:
      "This room is used for schoolwork in 321school. Students do not need a private email address to join anonymously. Contact the teacher/school with questions about use or deletion of student work.",
    qrAlt: "QR code to join the room",
    footer: "321school.com",
  },
  pt: {
    loading: "Carregando sala...",
    notFound: "Sala não encontrada.",
    back: "Voltar para a sala",
    print: "Imprimir / salvar PDF",
    title: "Bem-vindo ao 321school",
    roomName: "Sala/space",
    roomCode: "Código da sala",
    scan: "Escaneie o QR code ou use o código da sala.",
    joinTitle: "Como o aluno entra",
    joinText: 'Acesse o 321school e abra "Spaces". Escolha "Entrar no space" e digite o código.',
    anonymousTitle: "Acesso anônimo",
    anonymousText:
      "O aluno pode entrar com código da sala ou QR code sem conta e sem e-mail. O professor pode ver o nome informado pelo aluno e o trabalho feito na sala. O acesso anônimo normalmente é lembrado apenas no mesmo dispositivo e navegador.",
    accountTitle: "Usuário conectado",
    accountText:
      "Uma conta pode ser usada quando a escola ou os responsáveis tiverem autorizado. Com conta, o trabalho pode ser salvo e usado em diferentes dispositivos.",
    freeTitle: "Grátis para alunos",
    freeText: "O uso de spaces é grátis para alunos com código válido compartilhado por professor ou escola.",
    passwordTitle: "Usuário e senha",
    passwordText:
      "Se o aluno usar conta: use o e-mail correto, crie uma boa senha e não compartilhe com outras pessoas. Se perder acesso, peça ajuda ao professor ou a um adulto em casa.",
    under13Title: "Para crianças menores de 13 anos",
    under13Text:
      "Crianças menores de 13 anos devem usar acesso anônimo com o código da sala, a menos que a escola ou os responsáveis tenham autorizado o uso de conta.",
    parentTitle: "Para pais/responsáveis",
    parentText:
      "Esta sala é usada para atividades escolares no 321school. Alunos não precisam de e-mail particular para entrar anonimamente. Entre em contato com o professor/escola em caso de dúvidas sobre uso ou exclusão do trabalho do aluno.",
    qrAlt: "QR code para entrar na sala",
    footer: "321school.com",
  },
};

function withLocale(locale: string, href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  if (!href.startsWith("/")) return href;

  const seg = href.split("/")[1];
  if (seg === "en" || seg === "no" || seg === "pt") return href;

  if (href === "/") return `/${locale}`;
  return `/${locale}${href}`;
}

function getOrigin() {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

function safeString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function safeFilenamePart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function pickCopy(locale: string) {
  return copy[locale] ?? copy.no;
}

function SpacePrintInner() {
  const locale = useLocale();
  const params = useParams<{ spaceId: string }>();
  const spaceId = params.spaceId;
  const text = pickCopy(locale);

  const [loading, setLoading] = useState(true);
  const [space, setSpace] = useState<SpacePrintData | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const title = safeString(space?.title, "Space");
  const code = safeString(space?.code, safeString(space?.joinCode));

  const joinUrl = useMemo(() => {
    if (!code) return "";
    return `${getOrigin()}${withLocale(locale, `/join?code=${encodeURIComponent(code)}`)}`;
  }, [code, locale]);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      const snap = await getDoc(doc(db, "spaces", spaceId));
      if (!alive) return;
      setSpace(snap.exists() ? (snap.data() as SpacePrintData) : null);
      setLoading(false);
    })().catch(() => {
      if (!alive) return;
      setSpace(null);
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [spaceId]);

  useEffect(() => {
    if (!joinUrl) return;
    let alive = true;

    (async () => {
      const QRCode = (await import("qrcode")).default;
      const dataUrl = await QRCode.toDataURL(joinUrl, {
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
  }, [joinUrl]);

  useEffect(() => {
    if (!title || !code) return;
    document.title = `321school-romkode-${safeFilenamePart(title) || code}.pdf`;
  }, [code, title]);

  if (loading) {
    return <main className="p-6 text-sm text-slate-700">{text.loading}</main>;
  }

  if (!space || !code) {
    return (
      <main className="p-6 text-sm text-slate-700">
        <p>{text.notFound}</p>
        <Link href={withLocale(locale, `/teacher/spaces/${spaceId}`)} className="underline underline-offset-4">
          {text.back}
        </Link>
      </main>
    );
  }

  return (
    <main className="space-print-root min-h-screen bg-slate-100 p-4 text-slate-950 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-4 flex max-w-4xl flex-wrap items-center justify-between gap-3">
        <Link href={withLocale(locale, `/teacher/spaces/${spaceId}`)} className="text-sm font-medium underline underline-offset-4">
          {text.back}
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          {text.print}
        </button>
      </div>

      <section className="print-page mx-auto box-border w-full max-w-[210mm] bg-white p-8 shadow-lg print:m-0 print:h-[297mm] print:max-w-none print:p-[12mm] print:shadow-none">
        <header className="flex items-start justify-between gap-4 border-b-4 border-slate-900 pb-4">
          <div>
            <div className="text-sm font-bold uppercase tracking-[0.12em] text-slate-600">{text.footer}</div>
            <h1 className="mt-1 text-4xl font-black leading-tight text-slate-950">{text.title}</h1>
          </div>
          <Image src="/logo321ny.png" alt="321school" width={92} height={92} className="h-16 w-16 object-contain" priority />
        </header>

        <section className="mt-5 grid gap-4 md:grid-cols-[1fr_210px] print:grid-cols-[1fr_62mm]">
          <div className="rounded-2xl border-2 border-slate-900 p-5">
            <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-600">{text.roomName}</div>
            <div className="mt-1 break-words text-3xl font-black leading-tight">{title}</div>

            <div className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-slate-600">{text.roomCode}</div>
            <div className="mt-1 break-all rounded-xl border-2 border-slate-900 bg-slate-50 px-4 py-3 text-center text-6xl font-black tracking-[0.12em] print:text-5xl">
              {code}
            </div>
          </div>

          <div className="rounded-2xl border-2 border-slate-900 p-4 text-center">
            <div className="mx-auto flex h-[180px] w-[180px] items-center justify-center bg-white print:h-[52mm] print:w-[52mm]">
              {qrDataUrl ? (
                <Image src={qrDataUrl} alt={text.qrAlt} width={180} height={180} unoptimized className="h-full w-full" />
              ) : (
                <div className="text-sm font-semibold text-slate-500">QR</div>
              )}
            </div>
            <div className="mt-3 text-sm font-bold text-slate-800">{text.scan}</div>
          </div>
        </section>

        <section className="mt-5 grid gap-3 md:grid-cols-2 print:grid-cols-2">
          <InfoBox title={text.joinTitle}>{text.joinText}</InfoBox>
          <InfoBox title={text.freeTitle}>{text.freeText}</InfoBox>
          <InfoBox title={text.anonymousTitle}>{text.anonymousText}</InfoBox>
          <InfoBox title={text.accountTitle}>{text.accountText}</InfoBox>
          <InfoBox title={text.under13Title}>{text.under13Text}</InfoBox>
          <InfoBox title={text.passwordTitle}>{text.passwordText}</InfoBox>
          <InfoBox title={text.parentTitle}>{text.parentText}</InfoBox>
        </section>

        <footer className="mt-5 rounded-2xl border-2 border-slate-900 bg-slate-50 p-4 text-center text-sm font-semibold text-slate-900">
          {joinUrl}
        </footer>
      </section>

      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 0;
        }

        .space-print-root,
        .space-print-root * {
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

          .space-print-root,
          .space-print-root * {
            visibility: visible !important;
          }

          .space-print-root {
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
        }
      `}</style>
    </main>
  );
}

function InfoBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="rounded-2xl border-2 border-slate-300 p-4">
      <h2 className="text-base font-black text-slate-950">{title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-800">{children}</p>
    </article>
  );
}

export default function SpacePrintPage() {
  return (
    <AuthGate>
      <SpacePrintInner />
    </AuthGate>
  );
}
