// app/[locale]/pricing/page.tsx
import Link from "next/link";

type TierKey = "free" | "basic" | "plus" | "pro";

type Tier = {
  key: TierKey;
  name: string;
  price: string; // display only
  tagline: string;
  cta: { label: string; href: string };
  accent: "slate" | "blue" | "violet" | "rose";
};

type FeatureRow = {
  label: string;
  note?: string;
  values: Record<TierKey, string>;
};

type RoleSection = {
  id: "student" | "teacher" | "parent";
  title: string;
  subtitle: string;
  hint?: string;
  rows: FeatureRow[];
};

const TIERS: Tier[] = [
  {
    key: "free",
    name: "Free",
    price: "0 kr",
    tagline: "Du er i gang! Tilgang til tusenvis av leseoppgaver.",
    cta: { label: "Kom i gang", href: "/join" },
    accent: "slate",
  },
  {
    key: "basic",
    name: "Basic",
    price: "59 kr / mnd",
    tagline: "Mer funksjoner, undervise og studere mer effektivt!.",
    cta: { label: "Velg Basic", href: "/join" },
    accent: "blue",
  },
  {
    key: "plus",
    name: "Plus",
    price: "129 kr / mnd",
    tagline: "Generere egne bilder og få tilgang til digitale tavler og klasserom.",
    cta: { label: "Velg Plus", href: "/join" },
    accent: "violet",
  },
  {
    key: "pro",
    name: "Pro",
    price: "199 kr / mnd",
    tagline: "Høy aktivitet, mer innhold, mer kontroll. For den profesjonelle ",
    cta: { label: "Velg Pro", href: "/join" },
    accent: "rose",
  },
];

const ROLES: RoleSection[] = [
  {
    id: "student",
    title: "🧑‍🎓 Student",
    subtitle: "Perfekt for selvstudie, øving og samarbeid.",
    rows: [
      {
        label: "📚 Bibliotek (lese)",
        values: { free: "✔", basic: "✔", plus: "✔", pro: "✔" },
      },
      {
        label: "▶ Start oppgave (selvstudie)",
        note: "Antall oppgaver per måned",
        values: { free: "2 / mnd", basic: "10 / mnd", plus: "20 / mnd", pro: "100 / mnd" },
      },
      {
        label: "🏫 Delta i klasserom",
        values: { free: "✔", basic: "✔", plus: "✔", pro: "✔" },
      },
      {
        label: "👥 Kollokviegrupper",
        values: { free: "–", basic: "3 deltakere", plus: "10 deltakere", pro: "20 deltakere" },
      },
      {
        label: "🧠 Oppgavegenerator Light",
        note: "Uten språk/lyd/bilde",
        values: { free: "–", basic: "10", plus: "40", pro: "100" },
      },
      {
        label: "🧠 Oppgavegenerator Pro",
        note: "Språk + lyd",
        values: { free: "–", basic: "–", plus: "3", pro: "20" },
      },
      {
        label: "📖 Glosegenerator",
        values: { free: "–", basic: "5", plus: "20", pro: "100" },
      },
      {
        label: "🌍 Oversetter",
        values: { free: "✔", basic: "✔", plus: "✔", pro: "✔" },
      },
      {
        label: "🖼 AI-bildekreditter",
        values: { free: "–", basic: "–", plus: "3", pro: "10" },
      },
      {
        label: "🧑‍🤝‍🧑 Digital samarbeidstavle",
        values: { free: "–", basic: "–", plus: "10 deltakere", pro: "20 deltakere" },
      },
    ],
  },
  {
    id: "teacher",
    title: "👩‍🏫 Teacher",
    subtitle: "Bygget for lærere – med tydelige rammer per plan.",
    hint: "Light kan brukes fritt – det er billig og gir verdi. Pro brukes når du trenger språk/lyd/publisering.",
    rows: [
      {
        label: "📚 Bibliotek (lese)",
        values: { free: "✔", basic: "✔", plus: "✔", pro: "✔" },
      },
      {
        label: "🏫 Antall rom",
        values: { free: "1", basic: "1", plus: "3", pro: "10" },
      },
      {
        label: "👥 Maks elever totalt",
        values: { free: "15", basic: "30", plus: "100", pro: "300" },
      },
      {
        label: "🧠 Oppgavegenerator Light (intern bruk)",
        values: { free: "✔", basic: "✔", plus: "✔", pro: "✔" },
      },
      {
        label: "🧠 Oppgavegenerator Pro",
        note: "Språk + lyd + publiserbar",
        values: { free: "2", basic: "5", plus: "20", pro: "100" },
      },
      {
        label: "📄 PDF eksport",
        values: { free: "–", basic: "✔", plus: "✔", pro: "✔" },
      },
      {
        label: "🔗 Eksport (privat/unlisted)",
        values: { free: "–", basic: "✔", plus: "✔", pro: "✔" },
      },
      {
        label: "🌍 Publisering i bibliotek (søkbar)",
        values: { free: "–", basic: "–", plus: "✔", pro: "✔" },
      },
      {
        label: "🖼 AI-bildekreditter",
        values: { free: "1", basic: "3", plus: "10", pro: "25" },
      },
      {
        label: "🧑‍🤝‍🧑 Digital tavle",
        values: { free: "Basic", basic: "Full", plus: "Full", pro: "Full" },
      },
      {
        label: "📊 Analyse/oversikt",
        values: { free: "–", basic: "–", plus: "✔", pro: "✔ (avansert)" },
      },
    ],
  },
  {
    id: "parent",
    title: "👨‍👩‍👧 Parent",
    subtitle: "For hjemmetrening og progresjonskontroll.",
    hint: "Light gir mye øvingsverdi uten høy kostnad.",
    rows: [
      {
        label: "📚 Bibliotek (lese)",
        values: { free: "✔", basic: "✔", plus: "✔", pro: "✔" },
      },
      {
        label: "▶ Start oppgave",
        values: { free: "2", basic: "10", plus: "30", pro: "100" },
      },
      {
        label: "👶 Antall barn",
        values: { free: "1", basic: "2", plus: "5", pro: "10" },
      },
      {
        label: "🏠 Læringsrom",
        values: { free: "✔", basic: "✔", plus: "✔", pro: "✔" },
      },
      {
        label: "🧑‍🤝‍🧑 Foreldrerom",
        values: { free: "–", basic: "–", plus: "–", pro: "✔" },
      },
      {
        label: "🧠 Oppgavegenerator Light",
        values: { free: "2", basic: "20", plus: "40", pro: "100" },
      },
      {
        label: "🧠 Oppgavegenerator Pro",
        values: { free: "1", basic: "5", plus: "20", pro: "100" },
      },
      {
        label: "📖 Glosegenerator",
        values: { free: "–", basic: "✔", plus: "✔", pro: "✔" },
      },
      {
        label: "🌍 Oversetter",
        values: { free: "✔", basic: "✔", plus: "✔", pro: "✔" },
      },
      {
        label: "🖼 AI-bildekreditter",
        values: { free: "–", basic: "1", plus: "5", pro: "15" },
      },
      {
        label: "📊 Progresjonsoversikt",
        values: { free: "–", basic: "–", plus: "✔", pro: "✔ (avansert)" },
      },
    ],
  },
];

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function AccentPill({ accent }: { accent: Tier["accent"] }) {
  const cls =
    accent === "blue"
      ? "bg-blue-50 text-blue-700 border-blue-200"
      : accent === "violet"
      ? "bg-violet-50 text-violet-700 border-violet-200"
      : accent === "rose"
      ? "bg-rose-50 text-rose-700 border-rose-200"
      : "bg-slate-50 text-slate-700 border-slate-200";

  return <span className={cx("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium", cls)} />;
}

function TierCard({ tier }: { tier: Tier }) {
  const border =
    tier.accent === "blue"
      ? "border-blue-200"
      : tier.accent === "violet"
      ? "border-violet-200"
      : tier.accent === "rose"
      ? "border-rose-200"
      : "border-slate-200";

  const pillLabel = tier.key === "free" ? "Gratis" : tier.name;

  return (
    <div className={cx("rounded-2xl border bg-white p-5 shadow-sm", border)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <AccentPill accent={tier.accent} />
            <span className="text-xs text-slate-500">{pillLabel}</span>
          </div>
          <div className="mt-2 text-lg font-semibold text-slate-900">{tier.name}</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{tier.price}</div>
          <p className="mt-2 text-sm text-slate-600">{tier.tagline}</p>
        </div>
      </div>

      <div className="mt-4">
        <Link
          href={tier.cta.href}
          className="inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          {tier.cta.label}
        </Link>
      </div>

      <p className="mt-3 text-xs text-slate-500">* Priser og innhold kan endres før lansering.</p>
    </div>
  );
}

function ValueCell({ value }: { value: string }) {
  const isCheck = value.trim() === "✔";
  const isDash = value.trim() === "–" || value.trim() === "-";

  return (
    <div
      className={cx(
        "flex min-h-[40px] items-center justify-center rounded-lg px-2 text-sm",
        isCheck && "bg-emerald-50 text-emerald-700",
        isDash && "text-slate-400",
        !isCheck && !isDash && "text-slate-800"
      )}
      aria-label={value}
    >
      {value}
    </div>
  );
}

function CompareTable({ role }: { role: RoleSection }) {
  return (
    <section id={role.id} className="scroll-mt-24">
      <div className="mb-3">
        <h2 className="text-xl font-semibold text-slate-900">{role.title}</h2>
        <p className="mt-1 text-sm text-slate-600">{role.subtitle}</p>
        {role.hint ? <p className="mt-2 text-sm text-slate-700">{role.hint}</p> : null}
      </div>

      <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="grid grid-cols-5 gap-0 border-b bg-slate-50 px-4 py-3 text-xs font-medium text-slate-600">
          <div className="col-span-2">Funksjon</div>
          <div className="text-center">Free</div>
          <div className="text-center">Basic</div>
          <div className="text-center">Plus</div>
          <div className="hidden" />
        </div>

        {/* header row with tiers (mobile-friendly) */}
        <div className="grid grid-cols-2 gap-2 border-b px-4 py-3 md:hidden">
          <div className="rounded-lg border bg-white px-3 py-2 text-sm font-medium text-slate-900">Planer</div>
          <div className="grid grid-cols-4 gap-2">
            {TIERS.map((t) => (
              <div
                key={t.key}
                className="rounded-lg border bg-white px-2 py-2 text-center text-xs font-medium text-slate-700"
              >
                {t.name}
              </div>
            ))}
          </div>
        </div>

        <div className="hidden grid-cols-6 gap-0 border-b bg-slate-50 px-4 py-3 text-xs font-medium text-slate-600 md:grid">
          <div className="col-span-2">Funksjon</div>
          {TIERS.map((t) => (
            <div key={t.key} className="text-center">
              {t.name}
            </div>
          ))}
        </div>

        <div className="divide-y">
          {role.rows.map((row) => (
            <div key={row.label} className="grid grid-cols-2 gap-2 px-4 py-3 md:grid-cols-6 md:gap-0">
              <div className="md:col-span-2">
                <div className="text-sm font-medium text-slate-900">{row.label}</div>
                {row.note ? <div className="mt-0.5 text-xs text-slate-500">{row.note}</div> : null}
              </div>

              <div className="grid grid-cols-4 gap-2 md:col-span-4 md:grid-cols-4 md:gap-3">
                <ValueCell value={row.values.free} />
                <ValueCell value={row.values.basic} />
                <ValueCell value={row.values.plus} />
                <ValueCell value={row.values.pro} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 md:py-14">
        {/* Top */}
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Priser og planer</h1>
            <p className="mt-3 text-base text-slate-600">
              321 School er bygget slik at alle kan lære gratis – men de som ønsker mer kapasitet og avanserte verktøy kan
              oppgradere.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <a
                href="#student"
                className="rounded-full border px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                Student
              </a>
              <a
                href="#teacher"
                className="rounded-full border px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                Teacher
              </a>
              <a href="#parent" className="rounded-full border px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                Parent
              </a>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="rounded-xl border px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Tilbake til forsiden
            </Link>
            <Link
              href="/join"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Opprett konto
            </Link>
          </div>
        </div>

        {/* Tier cards */}
        <div className="mt-8 grid gap-4 md:mt-10 md:grid-cols-4">
          {TIERS.map((tier) => (
            <TierCard key={tier.key} tier={tier} />
          ))}
        </div>

        {/* Value notes */}
        <div className="mt-8 rounded-2xl border bg-slate-50 p-5">
          <h2 className="text-base font-semibold text-slate-900">Hvorfor fungerer denne modellen?</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">Alle kan bruke systemet gratis</div>
              <p className="mt-1 text-sm text-slate-600">
                Senker terskelen for å starte – og gjør det lett å prøve før man oppgraderer.
              </p>
            </div>
            <div className="rounded-xl bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">Light er generøst</div>
              <p className="mt-1 text-sm text-slate-600">
                Lav kost for deg, høy verdi for brukeren. Pro brukes når man trenger mer kraft og publisering.
              </p>
            </div>
            <div className="rounded-xl bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">Pro knyttes til publisering</div>
              <p className="mt-1 text-sm text-slate-600">Gir et sunt økosystem og bygger biblioteket over tid.</p>
            </div>
            <div className="rounded-xl bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">Student + Teacher henger sammen</div>
              <p className="mt-1 text-sm text-slate-600">
                Lærer kan være gratis mens elever betaler (eller motsatt) – fleksibelt for ulike behov.
              </p>
            </div>
          </div>
        </div>

        {/* Tables */}
        <div className="mt-10 space-y-10 md:mt-12">
          {ROLES.map((role) => (
            <CompareTable key={role.id} role={role} />
          ))}
        </div>

        {/* Footer */}
        <div className="mt-12 border-t pt-6 text-sm text-slate-500">
          <p>
            Dette er en plan-/prisside for videre produktarbeid. Tall og grenser kan justeres før lansering. (Tips: når du
            skal i18n’e senere, er dette laget data-drevet slik at du kan flytte tekster til messages-filer.)
          </p>
        </div>
      </div>
    </main>
  );
}