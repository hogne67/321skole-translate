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

type GuardianRow = {
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
  title: string;
  subtitle: string;
  student: string;
  room: string;
  roomCode: string;
  studentCode: string;
  qrTitle: string;
  manualTitle: string;
  manualText: string;
  guardianTitle: string;
  guardianAccess: string;
  guardianNoPassword: string;
  guardianContact: string;
  privacyTitle: string;
  privacyText: string;
  noStudents: string;
  footer: string;
  qrAlt: string;
};

const copy: Record<string, Copy> = {
  no: {
    loading: "Laster foresattark...",
    notFound: "Fant ikke rommet eller romkoden.",
    back: "Tilbake til medlemmer",
    print: "Skriv ut / lagre PDF",
    title: "Informasjon til foresatte",
    subtitle: "Denne siden kan deles med foresatte når eleven skal bruke 321school på egen enhet.",
    student: "Elev",
    room: "Rom",
    roomCode: "Romkode",
    studentCode: "Elevkode",
    qrTitle: "Skann QR-koden",
    manualTitle: "Slik logger eleven inn manuelt",
    manualText: "Gå til 321school.com/join og skriv inn romkode og elevkode.",
    guardianTitle: "Hva betyr elevkoden?",
    guardianAccess: "Elevkoden gir tilgang til elevens arbeid og tilbakemeldinger i dette rommet. Koden bør ikke deles med andre.",
    guardianNoPassword: "Eleven trenger ikke e-post eller passord for å bruke denne tilgangen.",
    guardianContact: "Ta kontakt med lærer eller skole hvis koden mistes, deles ved en feil eller bør byttes.",
    privacyTitle: "Personvern",
    privacyText: "321school bruker romkode og elevkode for å koble arbeidet til riktig elev i riktig rom. Innleveringer og tilbakemeldinger styres av lærer/skole.",
    noStudents: "Ingen elever med elevkode ennå.",
    footer: "321school.com",
    qrAlt: "QR-kode for elevtilgang",
  },
  nb: {
    loading: "Laster foresattark...",
    notFound: "Fant ikke rommet eller romkoden.",
    back: "Tilbake til medlemmer",
    print: "Skriv ut / lagre PDF",
    title: "Informasjon til foresatte",
    subtitle: "Denne siden kan deles med foresatte når eleven skal bruke 321school på egen enhet.",
    student: "Elev",
    room: "Rom",
    roomCode: "Romkode",
    studentCode: "Elevkode",
    qrTitle: "Skann QR-koden",
    manualTitle: "Slik logger eleven inn manuelt",
    manualText: "Gå til 321school.com/join og skriv inn romkode og elevkode.",
    guardianTitle: "Hva betyr elevkoden?",
    guardianAccess: "Elevkoden gir tilgang til elevens arbeid og tilbakemeldinger i dette rommet. Koden bør ikke deles med andre.",
    guardianNoPassword: "Eleven trenger ikke e-post eller passord for å bruke denne tilgangen.",
    guardianContact: "Ta kontakt med lærer eller skole hvis koden mistes, deles ved en feil eller bør byttes.",
    privacyTitle: "Personvern",
    privacyText: "321school bruker romkode og elevkode for å koble arbeidet til riktig elev i riktig rom. Innleveringer og tilbakemeldinger styres av lærer/skole.",
    noStudents: "Ingen elever med elevkode ennå.",
    footer: "321school.com",
    qrAlt: "QR-kode for elevtilgang",
  },
  en: {
    loading: "Loading guardian sheets...",
    notFound: "Room or room code not found.",
    back: "Back to members",
    print: "Print / save PDF",
    title: "Information for parents/guardians",
    subtitle: "This page can be shared when the student will use 321school on their own device.",
    student: "Student",
    room: "Room",
    roomCode: "Room code",
    studentCode: "Student code",
    qrTitle: "Scan the QR code",
    manualTitle: "Manual login",
    manualText: "Go to 321school.com/join and enter the room code and student code.",
    guardianTitle: "What does the student code do?",
    guardianAccess: "The student code gives access to the student's work and feedback in this room. It should not be shared with others.",
    guardianNoPassword: "The student does not need email or a password to use this access.",
    guardianContact: "Contact the teacher or school if the code is lost, shared by mistake, or should be changed.",
    privacyTitle: "Privacy",
    privacyText: "321school uses the room code and student code to connect work to the correct student in the correct room. Submissions and feedback are managed by the teacher/school.",
    noStudents: "No students with student codes yet.",
    footer: "321school.com",
    qrAlt: "QR code for student access",
  },
  pt: {
    loading: "Carregando folhas para responsáveis...",
    notFound: "Sala ou código da sala não encontrado.",
    back: "Voltar aos membros",
    print: "Imprimir / salvar PDF",
    title: "Informação para pais/responsáveis",
    subtitle: "Esta página pode ser compartilhada quando o aluno usar o 321school em seu próprio dispositivo.",
    student: "Aluno",
    room: "Sala",
    roomCode: "Código da sala",
    studentCode: "Código do aluno",
    qrTitle: "Escaneie o QR code",
    manualTitle: "Entrada manual",
    manualText: "Acesse 321school.com/join e digite o código da sala e o código do aluno.",
    guardianTitle: "O que o código do aluno faz?",
    guardianAccess: "O código do aluno dá acesso ao trabalho e aos feedbacks do aluno nesta sala. Não deve ser compartilhado com outras pessoas.",
    guardianNoPassword: "O aluno não precisa de e-mail nem senha para usar este acesso.",
    guardianContact: "Entre em contato com o professor ou a escola se o código for perdido, compartilhado por engano ou precisar ser trocado.",
    privacyTitle: "Privacidade",
    privacyText: "O 321school usa o código da sala e o código do aluno para ligar o trabalho ao aluno correto na sala correta. Entregas e feedbacks são gerenciados pelo professor/escola.",
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

function GuardianPrintInner() {
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

  const rows = useMemo<GuardianRow[]>(() => {
    if (!code) return [];
    return mergeStudentRows(students)
      .map((student): GuardianRow | null => {
        const name = safeString(student.data.displayName, "Student");
        const studentCode = safeString(student.data.studentCode);
        if (!studentCode) return null;
        const params = new URLSearchParams({ code, studentCode });
        const joinUrl = `${getOrigin()}${withLocale(locale, `/join?${params.toString()}`)}`;
        return { id: student.id, name, studentCode, joinUrl, qrDataUrl: qrByUrl[joinUrl] ?? null };
      })
      .filter((row): row is GuardianRow => row !== null)
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
            scale: 9,
            color: { dark: "#0f172a", light: "#ffffff" },
          });
        })
      );
      if (alive) setQrByUrl((current) => ({ ...current, ...next }));
    })().catch(() => {
      // Codes remain printable even if QR generation fails.
    });
    return () => {
      alive = false;
    };
  }, [qrByUrl, rows]);

  useEffect(() => {
    if (!title) return;
    document.title = `321school-foresattinfo-${safeFilenamePart(title) || spaceId}.pdf`;
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
    <main className="guardian-print-root min-h-screen bg-slate-100 p-4 text-slate-950 print:bg-white print:p-0">
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-3">
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

      {rows.length === 0 ? (
        <section className="mx-auto max-w-[210mm] bg-white p-8 shadow-sm print:shadow-none">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">{text.noStudents}</div>
        </section>
      ) : (
        <div className="mx-auto grid max-w-[210mm] gap-4 print:block">
          {rows.map((row) => (
            <article key={row.id} className="guardian-page bg-white p-8 shadow-sm print:shadow-none">
              <header className="flex items-start justify-between gap-4 border-b-4 border-slate-900 pb-5">
                <div>
                  <div className="text-sm font-black uppercase tracking-[0.14em] text-emerald-700">321school</div>
                  <h1 className="mt-2 text-4xl font-black leading-tight text-slate-950">{text.title}</h1>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">{text.subtitle}</p>
                </div>
                <Image src="/logo321ny.png" alt="321school" width={92} height={92} className="h-16 w-16 object-contain" priority />
              </header>

              <section className="mt-6 grid gap-4 md:grid-cols-[1fr_210px] print:grid-cols-[1fr_58mm]">
                <div className="rounded-2xl border-2 border-slate-900 p-5">
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{text.student}</div>
                  <div className="mt-1 break-words text-3xl font-black text-slate-950">{row.name}</div>

                  <div className="mt-5 text-xs font-black uppercase tracking-[0.14em] text-slate-500">{text.room}</div>
                  <div className="mt-1 break-words text-2xl font-black text-slate-950">{title}</div>
                </div>

                <div className="rounded-2xl border-2 border-slate-900 p-4 text-center">
                  <div className="text-sm font-black text-slate-950">{text.qrTitle}</div>
                  <div className="mx-auto mt-3 flex h-[180px] w-[180px] items-center justify-center bg-white print:h-[48mm] print:w-[48mm]">
                    {row.qrDataUrl ? (
                      <Image src={row.qrDataUrl} alt={text.qrAlt} width={180} height={180} unoptimized className="h-full w-full" />
                    ) : (
                      <div className="text-sm font-semibold text-slate-500">QR</div>
                    )}
                  </div>
                </div>
              </section>

              <section className="mt-5 grid gap-4 md:grid-cols-2 print:grid-cols-2">
                <div className="rounded-2xl border-2 border-slate-300 bg-slate-50 p-5">
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{text.roomCode}</div>
                  <div className="mt-2 font-mono text-5xl font-black tracking-[0.1em] text-slate-950">{code}</div>
                </div>
                <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-5">
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-emerald-800">{text.studentCode}</div>
                  <div className="mt-2 font-mono text-5xl font-black tracking-[0.1em] text-emerald-950">{row.studentCode}</div>
                </div>
              </section>

              <section className="mt-5 grid gap-4 md:grid-cols-2 print:grid-cols-2">
                <div className="rounded-2xl border border-slate-300 p-5">
                  <h2 className="text-lg font-black text-slate-950">{text.manualTitle}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{text.manualText}</p>
                </div>
                <div className="rounded-2xl border border-slate-300 p-5">
                  <h2 className="text-lg font-black text-slate-950">{text.guardianTitle}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{text.guardianAccess}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{text.guardianNoPassword}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{text.guardianContact}</p>
                </div>
              </section>

              <section className="mt-5 rounded-2xl border-2 border-slate-900 bg-slate-50 p-5">
                <h2 className="text-lg font-black text-slate-950">{text.privacyTitle}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-700">{text.privacyText}</p>
              </section>

              <footer className="mt-5 border-t border-slate-200 pt-4 text-xs font-semibold text-slate-500">
                {text.footer}
              </footer>
            </article>
          ))}
        </div>
      )}

      <style jsx global>{`
        .guardian-print-root,
        .guardian-print-root * {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm;
          }

          html,
          body {
            background: #fff !important;
          }

          .no-print {
            display: none !important;
          }

          .guardian-page {
            min-height: calc(297mm - 24mm);
            page-break-after: always;
            page-break-inside: avoid;
          }

          .guardian-page:last-child {
            page-break-after: auto;
          }
        }
      `}</style>
    </main>
  );
}

export default function GuardianPrintPage() {
  return (
    <AuthGate>
      <GuardianPrintInner />
    </AuthGate>
  );
}
