"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CheckSquare,
  Database,
  FileCheck2,
  FileText,
  Globe2,
  KeyRound,
  Printer,
  RotateCcw,
  School,
  ShieldCheck,
  Square,
  UsersRound,
} from "lucide-react";

type DocumentSection = {
  id: string;
  title: string;
  request: string;
  summary: string;
  points: string[];
  links: Array<{ href: string; label: string }>;
  icon: "privacy" | "dpa" | "data" | "storage" | "purpose" | "feide";
};

const documents: DocumentSection[] = [
  {
    id: "privacy",
    title: "Personvernerklaering for tjenesten",
    request: "Personvernerklaering for tjenesten.",
    summary:
      "321school har en egen skolevendt personvernoversikt som beskriver trygg skolebruk, anonym elevtilgang, kontoer, KI-funksjoner, sletting og skolekontroll.",
    points: [
      "Elever kan delta anonymt i Spaces med kode eller QR der kontobruk ikke er avklart.",
      "321school selger ikke personopplysninger og bruker ikke elevdata til tredjepartsannonsering.",
      "Skolebruk bør vurderes av skole eller skoleeier før systematisk bruk med elever.",
      "Generell personvernerklaering finnes i tillegg til den skolevendte personvernoversikten.",
    ],
    links: [
      { href: "/school/privacy", label: "Personvern for skoler" },
      { href: "/privacy", label: "Generell personvernerklaering" },
    ],
    icon: "privacy",
  },
  {
    id: "dpa",
    title: "Databehandleravtale",
    request: "Databehandleravtale (DBA), dersom leverandøren behandler personopplysninger på vegne av kommunen.",
    summary:
      "Ved skolebruk vil skole eller skoleeier normalt være behandlingsansvarlig, mens 321school er databehandler når vi behandler personopplysninger på vegne av skolen.",
    points: [
      "Det finnes et DPA-utkast som kan brukes som grunnlag eller overføres til kommunens egen mal.",
      "Avtalen bør bekrefte kontaktpunkter, underleverandører, regioner og eventuell behandling utenfor EU/EØS før signering.",
      "Formålet er å levere digitale læringsaktiviteter, Spaces, oppgaver, tilbakemelding, administrasjon og support.",
      "Skoleeier gjør egen vurdering, risikovurdering og endelig godkjenning før bred skolebruk.",
    ],
    links: [{ href: "/school/dpa", label: "Databehandleravtale-mal" }],
    icon: "dpa",
  },
  {
    id: "data",
    title: "Personopplysninger som behandles",
    request: "Opplysninger om hvilke personopplysninger som behandles.",
    summary:
      "Hvilke personopplysninger som behandles avhenger av om eleven deltar anonymt i et Space, bruker konto, eller om brukeren er lærer/skoleadministrator.",
    points: [
      "Anonyme Spaces: teknisk bruker-ID, valgt visningsnavn, romtilknytning og innsendt arbeid.",
      "Elevkonto: navn, e-post der det finnes, rolle/profil, innloggingsleverandør, lagret arbeid, feedback og nødvendig aktivitet.",
      "Lærer/skole: rom, oppgaver, generert innhold, administrasjon, supportinformasjon og tekniske tidsstempler.",
      "321school ber ikke om fødselsnummer for ordinær bruk.",
    ],
    links: [
      { href: "/school/privacy", label: "Personvern for skoler" },
      { href: "/school/data-rights", label: "Sletting, innsyn og retting" },
    ],
    icon: "data",
  },
  {
    id: "storage",
    title: "Lagringssted, underleverandører og overføringer",
    request: "Informasjon om lagringssted, underleverandører og eventuelle overføringer av data til andre land.",
    summary:
      "Kjernedata i Firestore er oppgitt som lagret i europe-west1, Belgia. Underleverandøroversikten beskriver tjenester som Firebase, Feide, Vercel, OpenAI, Stripe og Resend.",
    points: [
      "Google Cloud Firestore: europe-west1, Belgia.",
      "Firebase Storage / Google Cloud Storage: aktiv skolebucket 321skole-storage i EU multi-region.",
      "Firebase Authentication behandler autentiseringsdata i USA ifølge Firebase-dokumentasjonen, med Googles databehandlingsvilkår og SCC-er der relevant.",
      "KI-, hosting-, e-post- og betalingsleverandører kan ha egne behandlingssteder som må bekreftes i endelig avtale.",
    ],
    links: [
      { href: "/school/subprocessors", label: "Underleverandører" },
      { href: "/school/dpa", label: "DPA og lagringssted" },
    ],
    icon: "storage",
  },
  {
    id: "purpose",
    title: "Formål og brukergrupper",
    request: "Beskrivelse av formålet med løsningen og hvilke brukergrupper som skal benytte den.",
    summary:
      "321school er en læringsplattform for lærerstyrte aktiviteter, oppgaver, tekstarbeid, quiz, Spaces, egenstudie og administrasjon knyttet til skolebruk.",
    points: [
      "Formål: gi tilgang til digitale læringsaktiviteter, la lærere følge opp arbeid og støtte trygg skoleadministrasjon.",
      "Brukergrupper: lærere, elever/studenter, skoleadministratorer og foresatte der foresattefunksjoner tas i bruk.",
      "Elever i Spaces svarer normalt på lærerstyrte aktiviteter, ikke direkte til KI.",
      "Innloggede elever kan bruke egenstudiefunksjoner der konto og slik bruk er avklart.",
    ],
    links: [
      { href: "/school/trust", label: "Trust Center" },
      { href: "/school/ai-guidelines", label: "KI-retningslinjer" },
    ],
    icon: "purpose",
  },
  {
    id: "feide",
    title: "Feide-integrasjon og delte brukeropplysninger",
    request: "Informasjon om Feide-integrasjonen og hvilke brukeropplysninger som deles via Feide.",
    summary:
      "321school støtter Feide-innlogging via OpenID Connect. Feide-godkjenning åpner for innlogging fra skoleeier, men oppretter ikke i seg selv en betalt skoleavtale.",
    points: [
      "Skoleeier kan godkjenne eller nekte Feide-innlogging for sine brukere.",
      "Når Feide brukes, autentiserer Feide og tilknyttet identitetsleverandør brukeren.",
      "321school mottar identitetsdata som trengs for innlogging og kontotilgang, for eksempel teknisk ID, navn, e-post der tilgjengelig og organisasjonstilknytning.",
      "Feide er ikke nødvendig for anonym klasseromsdeltakelse i Spaces.",
    ],
    links: [
      { href: "/school/privacy", label: "Feide i skolepersonvern" },
      { href: "/school/subprocessors", label: "Sikt / Feide i underleverandøroversikt" },
    ],
    icon: "feide",
  },
];

function localizedPath(locale: string, path: string) {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${clean}`;
}

function SectionIcon({ icon }: { icon: DocumentSection["icon"] }) {
  const className = "h-5 w-5";

  if (icon === "privacy") return <ShieldCheck className={className} />;
  if (icon === "dpa") return <FileCheck2 className={className} />;
  if (icon === "data") return <UsersRound className={className} />;
  if (icon === "storage") return <Database className={className} />;
  if (icon === "purpose") return <School className={className} />;
  return <KeyRound className={className} />;
}

export function FeideDocumentationClient({ locale }: { locale: string }) {
  const [recipient, setRecipient] = useState("");
  const [note, setNote] = useState("Dokumentasjon til vurdering av Feide-tilgang og skolebruk i 321school.");
  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(documents.map((document) => [document.id, true])),
  );

  const selectedCount = useMemo(() => documents.filter((document) => selected[document.id]).length, [selected]);

  function setAll(value: boolean) {
    setSelected(Object.fromEntries(documents.map((document) => [document.id, value])));
  }

  function toggle(id: string) {
    setSelected((current) => ({ ...current, [id]: !current[id] }));
  }

  return (
    <>
      <style>{`
        @media print {
          @page { margin: 16mm; }
          body { background: white !important; }
          .no-print { display: none !important; }
          .print-root { background: white !important; color: #0f172a !important; }
          .print-shell { max-width: none !important; padding: 0 !important; }
          .print-card { break-inside: avoid; box-shadow: none !important; border-color: #cbd5e1 !important; }
          [data-print-included="false"] { display: none !important; }
          a { color: #0f172a !important; text-decoration: none !important; }
        }
      `}</style>

      <section className="print-root bg-white">
        <div className="print-shell mx-auto max-w-6xl px-6 py-12 md:py-14">
          <div className="grid gap-8 lg:grid-cols-[1fr_320px] lg:items-start">
            <div>
              <p className="inline-flex rounded-full bg-sky-50 px-4 py-2 text-sm font-bold text-sky-800">Feide og skolevurdering</p>
              <h1 className="mt-5 max-w-4xl text-4xl font-black tracking-tight md:text-6xl">Dokumentpakke for kommunevurdering</h1>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-700">
                En samlet utskriftsvennlig oversikt for skoler og skoleeiere som vurderer Feide-innlogging og skolebruk av 321school.
              </p>
              <div className="mt-6 grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
                <label className="grid gap-2 font-bold">
                  Mottaker
                  <input
                    value={recipient}
                    onChange={(event) => setRecipient(event.target.value)}
                    placeholder="Kommune eller skoleeier"
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-950 outline-none focus:border-sky-500"
                  />
                </label>
                <label className="grid gap-2 font-bold">
                  Kort merknad
                  <input
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-950 outline-none focus:border-sky-500"
                  />
                </label>
              </div>
              <p className="mt-5 text-sm font-semibold text-slate-500">Arbeidsversjon. Sist oppdatert: 7. september 2026.</p>
            </div>

            <aside className="no-print rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
              <h2 className="text-lg font-black">Velg dokumenter</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{selectedCount} av {documents.length} deler tas med ved utskrift.</p>
              <div className="mt-4 grid gap-2">
                {documents.map((document) => (
                  <button
                    key={document.id}
                    type="button"
                    onClick={() => toggle(document.id)}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-left text-sm font-bold text-slate-800 hover:bg-slate-100"
                  >
                    {selected[document.id] ? <CheckSquare className="h-5 w-5 shrink-0 text-emerald-600" /> : <Square className="h-5 w-5 shrink-0 text-slate-400" />}
                    <span>{document.title}</span>
                  </button>
                ))}
              </div>
              <div className="mt-5 grid gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-slate-800"
                >
                  <Printer className="h-4 w-4" />
                  Skriv ut / lagre PDF
                </button>
                <button
                  type="button"
                  onClick={() => setAll(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 hover:bg-slate-100"
                >
                  <RotateCcw className="h-4 w-4" />
                  Velg alle
                </button>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className="print-root">
        <div className="print-shell mx-auto max-w-6xl px-6 py-8">
          <div className="print-card rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-2xl font-black">Vedleggsliste for {recipient || "kommune/skoleeier"}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-700">{note}</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  Denne siden samler dokumentasjon som svarer på vanlige krav ved kommunal vurdering av digitale læremidler og Feide-integrasjon.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="print-root">
        <div className="print-shell mx-auto grid max-w-6xl gap-4 px-6 py-8 md:grid-cols-2">
          {documents.map((document) => (
            <article
              key={document.id}
              data-print-included={selected[document.id] ? "true" : "false"}
              className={`print-card rounded-2xl border bg-white p-5 shadow-sm ${selected[document.id] ? "border-slate-200" : "border-slate-100 opacity-50"}`}
            >
              <div className="flex items-start gap-3">
                <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-sky-700">
                  <SectionIcon icon={document.icon} />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Kommunens punkt</p>
                  <h2 className="mt-1 text-xl font-black">{document.title}</h2>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{document.request}</p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-700">{document.summary}</p>
              <ul className="mt-4 grid gap-2">
                {document.points.map((point) => (
                  <li key={point} className="flex gap-2 text-sm leading-6 text-slate-700">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-5 grid gap-2">
                {document.links.map((link) => (
                  <Link
                    key={`${document.id}-${link.href}`}
                    href={localizedPath(locale, link.href)}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 hover:bg-slate-100"
                  >
                    <Globe2 className="h-4 w-4" />
                    {link.label}
                  </Link>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
