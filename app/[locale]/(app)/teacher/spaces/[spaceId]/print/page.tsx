"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import AuthGate from "@/components/AuthGate";
import { db } from "@/lib/firebase";

type SpacePrintData = {
  title?: unknown;
  code?: unknown;
  joinCode?: unknown;
  allowRoomCodeOnly?: unknown;
  join?: unknown;
};

type Copy = {
  loading: string;
  notFound: string;
  back: string;
  print: string;
  title: string;
  roomName: string;
  roomCode: string;
  scanOpen: string;
  scanStudentCode: string;
  accessMode: string;
  accessOpen: string;
  accessStudentCode: string;
  joinTitle: string;
  joinTextOpen: string;
  joinTextStudentCode: string;
  studentCodeTitle: string;
  studentCodeTextOpen: string;
  studentCodeTextRequired: string;
  teacherTitle: string;
  teacherText: string;
  qrAlt: string;
  footer: string;
};

const copy: Record<string, Copy> = {
  no: {
    loading: "Laster rom...",
    notFound: "Fant ikke rommet.",
    back: "Tilbake til rommet",
    print: "Skriv ut / lagre PDF",
    title: "Romkode",
    roomName: "Rom/space",
    roomCode: "Romkode",
    scanOpen: "Skann QR-koden eller bruk romkoden.",
    scanStudentCode: "Skann QR-koden og skriv elevkoden din.",
    accessMode: "Tilgang",
    accessOpen: "Romkode alene er tillatt",
    accessStudentCode: "Krever personlig elevkode",
    joinTitle: "Slik kommer eleven inn",
    joinTextOpen: "Gå til 321school.com/join, eller skann QR-koden, og skriv romkoden. Eleven kan skrive navn hvis lærer har åpnet for romkode alene.",
    joinTextStudentCode: "Gå til 321school.com/join, eller skann QR-koden. Skriv romkoden og den personlige elevkoden fra læreren.",
    studentCodeTitle: "Personlig elevkode",
    studentCodeTextOpen: "Hvis eleven har elevkode, bør den brukes. Da åpnes riktig elev, og arbeid kan fortsette på ny enhet.",
    studentCodeTextRequired: "Elevkode er nødvendig for nye elever i dette rommet. Bruk elevlenken eller elevkoden som læreren har delt.",
    teacherTitle: "Til lærer",
    teacherText: 'Personlige elevkoder skrives ut fra "Administrer medlemmer" > "Skriv ut elevkoder". Romkode alene kan åpnes fra lærerens space-liste ved behov.',
    qrAlt: "QR-kode for å bli med i rommet",
    footer: "321school.com",
  },
  en: {
    loading: "Loading room...",
    notFound: "Room not found.",
    back: "Back to room",
    print: "Print / save PDF",
    title: "Room code",
    roomName: "Room/space",
    roomCode: "Room code",
    scanOpen: "Scan the QR code or use the room code.",
    scanStudentCode: "Scan the QR code and enter your student code.",
    accessMode: "Access",
    accessOpen: "Room code only is allowed",
    accessStudentCode: "Requires personal student code",
    joinTitle: "How students join",
    joinTextOpen: "Go to 321school.com/join, or scan the QR code, and enter the room code. Students can enter a name if the teacher has opened room-code-only access.",
    joinTextStudentCode: "Go to 321school.com/join, or scan the QR code. Enter the room code and the personal student code from your teacher.",
    studentCodeTitle: "Personal student code",
    studentCodeTextOpen: "If the student has a student code, they should use it. It opens the right student and lets work continue on a new device.",
    studentCodeTextRequired: "Student code is required for new students in this room. Use the student link or student code shared by the teacher.",
    teacherTitle: "For teachers",
    teacherText: 'Personal student codes are printed from "Manage members" > "Print student codes". Room-code-only access can be opened from the teacher space list when needed.',
    qrAlt: "QR code to join the room",
    footer: "321school.com",
  },
  pt: {
    loading: "Carregando sala...",
    notFound: "Sala não encontrada.",
    back: "Voltar para a sala",
    print: "Imprimir / salvar PDF",
    title: "Código da sala",
    roomName: "Sala/space",
    roomCode: "Código da sala",
    scanOpen: "Escaneie o QR code ou use o código da sala.",
    scanStudentCode: "Escaneie o QR code e digite seu código de aluno.",
    accessMode: "Acesso",
    accessOpen: "Apenas código da sala está permitido",
    accessStudentCode: "Exige código pessoal de aluno",
    joinTitle: "Como o aluno entra",
    joinTextOpen: "Acesse 321school.com/join, ou escaneie o QR code, e digite o código da sala. O aluno pode digitar o nome se o professor abriu acesso apenas com código da sala.",
    joinTextStudentCode: "Acesse 321school.com/join, ou escaneie o QR code. Digite o código da sala e o código pessoal de aluno do professor.",
    studentCodeTitle: "Código pessoal de aluno",
    studentCodeTextOpen: "Se o aluno tiver código de aluno, ele deve usá-lo. Assim abre o aluno correto e continua em outro dispositivo.",
    studentCodeTextRequired: "Código de aluno é obrigatório para novos alunos nesta sala. Use o link ou código compartilhado pelo professor.",
    teacherTitle: "Para professores",
    teacherText: 'Códigos pessoais de aluno são impressos em "Gerenciar membros" > "Imprimir códigos de aluno". Acesso apenas com código da sala pode ser aberto na lista de spaces do professor quando necessário.',
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function allowRoomCodeOnlyJoin(space: SpacePrintData | null): boolean {
  if (!space) return false;
  if (space.allowRoomCodeOnly === true) return true;
  if (isRecord(space.join) && space.join.allowRoomCodeOnly === true) return true;
  return false;
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
  const allowRoomCodeOnly = allowRoomCodeOnlyJoin(space);

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

            <div className="mt-4 rounded-xl border-2 border-slate-300 bg-white px-4 py-3">
              <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-600">{text.accessMode}</div>
              <div className="mt-1 text-lg font-black text-slate-950">
                {allowRoomCodeOnly ? text.accessOpen : text.accessStudentCode}
              </div>
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
            <div className="mt-3 text-sm font-bold text-slate-800">
              {allowRoomCodeOnly ? text.scanOpen : text.scanStudentCode}
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-3 md:grid-cols-2 print:grid-cols-2">
          <article className="rounded-2xl border-2 border-slate-300 p-4">
            <h2 className="text-base font-black text-slate-950">{text.joinTitle}</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-800">
              {allowRoomCodeOnly ? text.joinTextOpen : text.joinTextStudentCode}
            </p>
          </article>
          <article className="rounded-2xl border-2 border-slate-300 p-4">
            <h2 className="text-base font-black text-slate-950">{text.studentCodeTitle}</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-800">
              {allowRoomCodeOnly ? text.studentCodeTextOpen : text.studentCodeTextRequired}
            </p>
          </article>
        </section>

        <footer className="mt-5 rounded-2xl border-2 border-slate-900 bg-slate-50 p-4 text-sm text-slate-900">
          <div className="font-black">{text.teacherTitle}</div>
          <div className="mt-1 leading-relaxed">{text.teacherText}</div>
          <div className="mt-3 break-all font-mono text-xs font-semibold text-slate-600">{joinUrl}</div>
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

export default function SpacePrintPage() {
  return (
    <AuthGate>
      <SpacePrintInner />
    </AuthGate>
  );
}
