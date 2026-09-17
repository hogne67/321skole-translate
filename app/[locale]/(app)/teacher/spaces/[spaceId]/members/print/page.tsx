"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { collection, doc, getDoc, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import { db } from "@/lib/firebase";
import { useLocale } from "next-intl";

type SpacePrintData = {
  title?: unknown;
  code?: unknown;
  joinCode?: unknown;
  join?: unknown;
};

type MemberData = {
  displayName?: unknown;
  role?: unknown;
  uid?: unknown;
  userId?: unknown;
  participantId?: unknown;
  archived?: unknown;
  active?: unknown;
  status?: unknown;
  studentCode?: unknown;
  studentCodeKey?: unknown;
  createdAt?: unknown;
};

type StudentAccessRow = {
  id: string;
  name: string;
  studentCode: string;
  joinUrl: string;
  qrDataUrl: string | null;
};

type Copy = {
  loading: string;
  notFound: string;
  back: string;
  print: string;
  pageTitle: string;
  intro: string;
  roomName: string;
  roomCode: string;
  roomMeta: string;
  studentName: string;
  studentCode: string;
  manualTitle: string;
  tip: string;
  noStudents: string;
  footer: string;
  qrAlt: string;
};

const copy: Record<string, Copy> = {
  no: {
    loading: "Laster elevtilganger...",
    notFound: "Fant ikke rommet eller romkoden.",
    back: "Tilbake til medlemmer",
    print: "Skriv ut / lagre PDF",
    pageTitle: "Elevtilganger",
    intro: "Del én lapp per elev. Eleven kan bruke samme elevkode/lenke på mobil, PC eller ny nettleser.",
    roomName: "Rom",
    roomCode: "Romkode",
    roomMeta: "Romkode ved manuell innlogging",
    studentName: "Elev",
    studentCode: "Din elevkode",
    manualTitle: "Hvis QR-koden ikke brukes",
    tip: "Gå til 321school.com/join og skriv romkode + elevkode.",
    noStudents: "Ingen elever med elevkode ennå.",
    footer: "321school.com",
    qrAlt: "QR-kode for elevtilgang",
  },
  nb: {
    loading: "Laster elevtilganger...",
    notFound: "Fant ikke rommet eller romkoden.",
    back: "Tilbake til medlemmer",
    print: "Skriv ut / lagre PDF",
    pageTitle: "Elevtilganger",
    intro: "Del én lapp per elev. Eleven kan bruke samme elevkode/lenke på mobil, PC eller ny nettleser.",
    roomName: "Rom",
    roomCode: "Romkode",
    roomMeta: "Romkode ved manuell innlogging",
    studentName: "Elev",
    studentCode: "Din elevkode",
    manualTitle: "Hvis QR-koden ikke brukes",
    tip: "Gå til 321school.com/join og skriv romkode + elevkode.",
    noStudents: "Ingen elever med elevkode ennå.",
    footer: "321school.com",
    qrAlt: "QR-kode for elevtilgang",
  },
  en: {
    loading: "Loading student access...",
    notFound: "Room or room code not found.",
    back: "Back to members",
    print: "Print / save PDF",
    pageTitle: "Student access",
    intro: "Share one slip per student. The student can use the same code/link on mobile, computer, or a new browser.",
    roomName: "Room",
    roomCode: "Room code",
    roomMeta: "Room code for manual login",
    studentName: "Student",
    studentCode: "Your student code",
    manualTitle: "If QR is not used",
    tip: "Go to 321school.com/join and enter room code + student code.",
    noStudents: "No students with student codes yet.",
    footer: "321school.com",
    qrAlt: "QR code for student access",
  },
  pt: {
    loading: "Carregando acessos dos alunos...",
    notFound: "Sala ou código da sala não encontrado.",
    back: "Voltar aos membros",
    print: "Imprimir / salvar PDF",
    pageTitle: "Acesso dos alunos",
    intro: "Compartilhe um cartão por aluno. O aluno pode usar o mesmo código/link no celular, computador ou navegador novo.",
    roomName: "Sala",
    roomCode: "Código da sala",
    roomMeta: "Código da sala para entrada manual",
    studentName: "Aluno",
    studentCode: "Seu código de aluno",
    manualTitle: "Se não usar QR",
    tip: "Acesse 321school.com/join e digite código da sala + código do aluno.",
    noStudents: "Ainda não há alunos com código.",
    footer: "321school.com",
    qrAlt: "QR code para acesso do aluno",
  },
};

function withLocale(locale: string, href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  if (!href.startsWith("/")) return href;

  const seg = href.split("/")[1];
  if (seg === "en" || seg === "no" || seg === "nb" || seg === "pt") return href;

  if (href === "/") return `/${locale}`;
  return `/${locale}${href}`;
}

function getOrigin() {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readSpaceCode(data: SpacePrintData | null): string {
  const direct = safeString(data?.code, safeString(data?.joinCode));
  if (direct) return direct;
  const join = data?.join;
  return isRecord(join) ? safeString(join.code) : "";
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

function isActiveStudent(data: MemberData) {
  return (
    safeString(data.role) === "student" &&
    data.archived !== true &&
    data.active !== false &&
    safeString(data.status).toLowerCase() !== "removed"
  );
}

function asMillis(value: unknown): number {
  try {
    if (!value || typeof value !== "object" || !("toMillis" in value)) return 0;
    const millis = (value as { toMillis: () => number }).toMillis();
    return Number.isFinite(millis) ? millis : 0;
  } catch {
    return 0;
  }
}

function memberUid(member: { data: MemberData }) {
  return safeString(member.data.userId) || safeString(member.data.uid);
}

function memberGroupKey(member: { id: string; data: MemberData }) {
  const participantId = safeString(member.data.participantId);
  if (participantId) return `participant:${participantId}`;

  const studentCodeKey = safeString(member.data.studentCodeKey);
  if (studentCodeKey) return `student-code:${studentCodeKey}`;

  const studentCode = safeString(member.data.studentCode);
  if (studentCode) return `student-code:${studentCode}`;

  const uid = memberUid(member);
  return uid ? `uid:${uid}` : `doc:${member.id}`;
}

function preferStudentRow(
  current: { id: string; data: MemberData },
  candidate: { id: string; data: MemberData }
) {
  const currentHasCode = Boolean(safeString(current.data.studentCode));
  const candidateHasCode = Boolean(safeString(candidate.data.studentCode));
  if (!currentHasCode && candidateHasCode) return candidate;
  if (currentHasCode && !candidateHasCode) return current;

  const currentHasUid = Boolean(memberUid(current));
  const candidateHasUid = Boolean(memberUid(candidate));
  if (!currentHasUid && candidateHasUid) return candidate;
  if (currentHasUid && !candidateHasUid) return current;

  return asMillis(candidate.data.createdAt) >= asMillis(current.data.createdAt) ? candidate : current;
}

function mergeStudentRows(students: Array<{ id: string; data: MemberData }>) {
  const groups = new Map<string, Array<{ id: string; data: MemberData }>>();
  for (const student of students) {
    const key = memberGroupKey(student);
    groups.set(key, [...(groups.get(key) ?? []), student]);
  }

  return Array.from(groups.values()).map((group) => group.reduce(preferStudentRow));
}

function StudentAccessPrintInner() {
  const locale = useLocale();
  const params = useParams<{ spaceId: string }>();
  const spaceId = params.spaceId;
  const text = pickCopy(locale);

  const [loadingSpace, setLoadingSpace] = useState(true);
  const [space, setSpace] = useState<SpacePrintData | null>(null);
  const [students, setStudents] = useState<Array<{ id: string; data: MemberData }>>([]);
  const [qrByUrl, setQrByUrl] = useState<Record<string, string>>({});

  const title = safeString(space?.title, "Space");
  const code = readSpaceCode(space);

  const rows = useMemo<StudentAccessRow[]>(() => {
    if (!code) return [];
    return mergeStudentRows(students)
      .map((student): StudentAccessRow | null => {
        const name = safeString(student.data.displayName, "Student");
        const studentCode = safeString(student.data.studentCode);
        if (!studentCode) return null;
        const params = new URLSearchParams({ code, studentCode });
        const joinUrl = `${getOrigin()}${withLocale(locale, `/join?${params.toString()}`)}`;
        return {
          id: student.id,
          name,
          studentCode,
          joinUrl,
          qrDataUrl: qrByUrl[joinUrl] ?? null,
        };
      })
      .filter((row): row is StudentAccessRow => row !== null)
      .sort((a, b) => a.name.localeCompare(b.name, locale === "no" ? "nb" : locale));
  }, [code, locale, qrByUrl, students]);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoadingSpace(true);
      const snap = await getDoc(doc(db, "spaces", spaceId));
      if (!alive) return;
      setSpace(snap.exists() ? (snap.data() as SpacePrintData) : null);
      setLoadingSpace(false);
    })().catch(() => {
      if (!alive) return;
      setSpace(null);
      setLoadingSpace(false);
    });

    return () => {
      alive = false;
    };
  }, [spaceId]);

  useEffect(() => {
    if (!spaceId) return;

    const qy = query(
      collection(db, "spaceMembers"),
      where("spaceId", "==", spaceId),
      where("archived", "==", false),
      orderBy("createdAt", "desc")
    );

    return onSnapshot(qy, (snap) => {
      setStudents(
        snap.docs
          .map((item) => ({ id: item.id, data: (item.data() ?? {}) as MemberData }))
          .filter((item) => isActiveStudent(item.data))
      );
    });
  }, [spaceId]);

  useEffect(() => {
    const missing = rows.map((row) => row.joinUrl).filter((url) => !qrByUrl[url]);
    if (missing.length === 0) return;

    let alive = true;

    (async () => {
      const QRCode = (await import("qrcode")).default;
      const next: Record<string, string> = {};
      await Promise.all(
        missing.map(async (url) => {
          next[url] = await QRCode.toDataURL(url, {
            margin: 1,
            scale: 8,
            color: { dark: "#0f172a", light: "#ffffff" },
          });
        })
      );
      if (alive) setQrByUrl((current) => ({ ...current, ...next }));
    })().catch(() => {
      // Student codes and links remain printable even if QR generation fails.
    });

    return () => {
      alive = false;
    };
  }, [qrByUrl, rows]);

  useEffect(() => {
    if (!title) return;
    document.title = `321school-elevtilganger-${safeFilenamePart(title) || spaceId}.pdf`;
  }, [spaceId, title]);

  if (loadingSpace) {
    return <main className="p-6 text-sm text-slate-700">{text.loading}</main>;
  }

  if (!space || !code) {
    return (
      <main className="p-6 text-sm text-slate-700">
        <p>{text.notFound}</p>
        <Link href={withLocale(locale, `/teacher/spaces/${spaceId}/members`)} className="underline underline-offset-4">
          {text.back}
        </Link>
      </main>
    );
  }

  return (
    <main className="student-access-print-root min-h-screen bg-slate-100 p-4 text-slate-950 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-4 flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <Link href={withLocale(locale, `/teacher/spaces/${spaceId}/members`)} className="text-sm font-medium underline underline-offset-4">
          {text.back}
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          {text.print}
        </button>
      </div>

      <section className="mx-auto max-w-5xl bg-white p-6 shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="mb-5 border-b border-slate-200 pb-4 print:mb-3 print:pb-3">
          <div className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">321school</div>
          <h1 className="m-0 mt-1 text-3xl font-black text-slate-950">{text.pageTitle}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{text.intro}</p>
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            <span>
              {text.roomName}: <b>{title}</b>
            </span>
            <span>
              {text.roomCode}: <b className="font-mono">{code}</b>
            </span>
          </div>
        </header>

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">{text.noStudents}</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 print:grid-cols-2">
            {rows.map((row) => (
              <article key={row.id} className="student-slip break-inside-avoid border border-slate-300 p-4">
                <div className="flex gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{text.studentName}</div>
                    <div className="mt-1 break-words text-xl font-black text-slate-950">{row.name}</div>

                    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                      <div className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-800">{text.studentCode}</div>
                      <div className="mt-1 font-mono text-3xl font-black text-emerald-900">{row.studentCode}</div>
                    </div>

                    <div className="mt-3 text-xs leading-5 text-slate-600">
                      <span className="font-semibold text-slate-900">{text.roomName}:</span> {title}
                    </div>
                  </div>

                  <div className="w-28 shrink-0">
                    {row.qrDataUrl ? (
                      <Image
                        src={row.qrDataUrl}
                        alt={text.qrAlt}
                        width={112}
                        height={112}
                        className="h-28 w-28 border border-slate-200"
                        unoptimized
                      />
                    ) : (
                      <div className="h-28 w-28 border border-dashed border-slate-300" />
                    )}
                  </div>
                </div>

                <div className="mt-4 border-t border-slate-200 pt-3 text-xs leading-5 text-slate-600">
                  <div className="font-bold text-slate-900">{text.manualTitle}</div>
                  <div>{text.tip}</div>
                  <div className="mt-1">
                    {text.roomMeta}: <span className="font-mono font-black text-slate-950">{code}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        <footer className="mt-5 border-t border-slate-200 pt-3 text-xs font-semibold text-slate-500">{text.footer}</footer>
      </section>

      <style jsx global>{`
        .student-access-print-root,
        .student-access-print-root * {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        @media print {
          @page {
            size: A4;
            margin: 12mm;
          }

          html,
          body {
            background: #fff !important;
          }

          .no-print {
            display: none !important;
          }

          .student-slip {
            min-height: 78mm;
            page-break-inside: avoid;
          }
        }
      `}</style>
    </main>
  );
}

export default function StudentAccessPrintPage() {
  return (
    <AuthGate>
      <StudentAccessPrintInner />
    </AuthGate>
  );
}
