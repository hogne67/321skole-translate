"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import AuthGate from "@/components/AuthGate";
import { db } from "@/lib/firebase";
import { getSpaceJoinCode } from "@/lib/spaceCode";

type SpacePrintData = {
  title?: unknown;
  code?: unknown;
  joinCode?: unknown;
  join?: unknown;
};

type Copy = {
  loading: string;
  notFound: string;
  back: string;
  print: string;
  roomCode: string;
  joinHint: string;
  qrAlt: string;
};

const copy: Record<string, Copy> = {
  no: {
    loading: "Laster rom...",
    notFound: "Fant ikke rommet.",
    back: "Tilbake til rommet",
    print: "Skriv ut / lagre PDF",
    roomCode: "Romkode",
    joinHint: "Åpne romlenken eller skann QR-koden. Ha elevkoden fra læreren klar.",
    qrAlt: "QR-kode for å bli med i rommet",
  },
  en: {
    loading: "Loading room...",
    notFound: "Room not found.",
    back: "Back to room",
    print: "Print / save PDF",
    roomCode: "Room code",
    joinHint: "Open the room link or scan the QR code. Have the student code from your teacher ready.",
    qrAlt: "QR code to join the room",
  },
  pt: {
    loading: "Carregando sala...",
    notFound: "Sala não encontrada.",
    back: "Voltar para a sala",
    print: "Imprimir / salvar PDF",
    roomCode: "Código da sala",
    joinHint: "Abra o link da sala ou escaneie o QR code. Tenha em mãos o código de aluno fornecido pelo professor.",
    qrAlt: "QR code para entrar na sala",
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
  const code = getSpaceJoinCode(space);

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
    <main className="space-print-root min-h-screen bg-slate-100 p-4 text-slate-950 print:min-h-0 print:bg-white print:p-0">
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

      <section className="print-page mx-auto box-border w-full max-w-[210mm] bg-white p-4 shadow-lg sm:p-8 print:m-0 print:max-w-none print:p-[12mm] print:shadow-none">
        <header className="flex items-start justify-between gap-4 border-0 border-b-4 border-solid border-slate-900 pb-4">
          <div className="min-w-0">
            <div className="text-sm font-bold uppercase tracking-[0.12em] text-slate-600">321school.com</div>
            <h1 className="mb-0 mt-1 break-words text-3xl font-black leading-tight text-slate-950 sm:text-4xl">{title}</h1>
          </div>
          <Image src="/logo321ny.png" alt="321school" width={92} height={92} className="h-16 w-16 shrink-0 object-contain" priority />
        </header>

        <section className="mt-5 grid gap-4 md:grid-cols-[1fr_210px] print:grid-cols-[1fr_62mm]">
          <div className="min-w-0 rounded-2xl border-2 border-solid border-slate-900 p-4 sm:p-5">
            <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-600">{text.roomCode}</div>
            <div className="mt-1 break-all font-mono text-4xl font-black tracking-wider sm:text-5xl">
              {code}
            </div>
            <p className="mb-1 mt-4 text-sm leading-relaxed text-slate-800">{text.joinHint}</p>
            <a href={joinUrl} className="break-all text-sm font-semibold text-slate-950 underline underline-offset-2">{joinUrl}</a>
          </div>

          <div className="rounded-2xl border-2 border-solid border-slate-900 p-4 text-center">
            <div className="mx-auto flex aspect-square w-full max-w-[180px] items-center justify-center bg-white print:max-w-[52mm]">
              {qrDataUrl ? (
                <Image src={qrDataUrl} alt={text.qrAlt} width={180} height={180} unoptimized className="h-full w-full" />
              ) : (
                <div className="text-sm font-semibold text-slate-500">QR</div>
            )}
            </div>
          </div>
        </section>
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
