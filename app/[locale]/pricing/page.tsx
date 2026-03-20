// app/[locale]/pricing/page.tsx
import Link from "next/link";

type TierKey = "free" | "basic" | "plus" | "pro";

type Tier = {
  key: TierKey;
  name: string;
  price: string;
  tagline: string;
  cta: { label: string; href: string };
  accent: "slate" | "blue" | "violet" | "rose";
  recommended?: boolean;
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
    tagline: "Kom i gang gratis med bibliotek, lesing og enkel bruk.",
    cta: { label: "Kom i gang", href: "/join" },
    accent: "slate",
  },
  {
    key: "basic",
    name: "Basic",
    price: "59 kr / mnd",
    tagline: "For deg som vil bruke plattformen oftere og få mer kapasitet.",
    cta: { label: "Velg Basic", href: "/join" },
    accent: "blue",
  },
  {
    key: "plus",
    name: "Plus",
    price: "129 kr / mnd",
    tagline: "Mer AI, mer samarbeid og tilgang til de viktigste premium-funksjonene.",
    cta: { label: "Velg Plus", href: "/join" },
    accent: "violet",
    recommended: true,
  },
  {
    key: "pro",
    name: "Pro",
    price: "199 kr / mnd",
    tagline: "For høy aktivitet, publisering og mer profesjonell bruk.",
    cta: { label: "Velg Pro", href: "/join" },
    accent: "rose",
  },
];

const ROLES: RoleSection[] = [
  {
    id: "student",
    title: "🧑‍🎓 Student",
    subtitle: "Perfekt for selvstudie, øving og samarbeid.",
    hint:
      "Student-planene bygger på en samlet premium-generator-pott per måned. Den samme potten brukes når du lager premium-oppgaver, tekster og lignende verktøy.",
    rows: [
      {
        label: "📚 Bibliotek (lese)",
        values: { free: "✔", basic: "✔", plus: "✔", pro: "✔" },
      },
      {
        label: "🏫 Delta i klasserom",
        values: { free: "✔", basic: "✔", plus: "✔", pro: "✔" },
      },
      {
        label: "🧠 Premium-generatorer / måned",
        note: "Samlet pott for premium-generatorer",
        values: { free: "2", basic: "10", plus: "25", pro: "100" },
      },
      {
        label: "🧠 AI-tilbakemeldinger / måned",
        values: { free: "5", basic: "30", plus: "100", pro: "300" },
      },
      {
        label: "🖼 AI-bilder / måned",
        values: { free: "–", basic: "10", plus: "50", pro: "150" },
      },
      {
        label: "📥 Nedlastinger / måned",
        values: { free: "3", basic: "20", plus: "75", pro: "200" },
      },
      {
        label: "🌍 Oversetter",
        values: { free: "✔", basic: "✔", plus: "✔", pro: "✔" },
      },
      {
        label: "👥 Samarbeid og grupper",
        note: "Kan utvides senere",
        values: { free: "Enkel", basic: "Mer", plus: "Mer", pro: "Mest" },
      },
    ],
  },
  {
    id: "teacher",
    title: "👩‍🏫 Teacher",
    subtitle: "Bygget for lærere med tydelige rammer per plan.",
    hint:
      "Teacher-planene bruker samme modell som dashboardet ditt: en samlet premium-generator-pott, egne grenser for AI-feedback, bilder, nedlastinger og medlemmer.",
    rows: [
      {
        label: "📚 Bibliotek (lese)",
        values: { free: "✔", basic: "✔", plus: "✔", pro: "✔" },
      },
      {
        label: "🧠 Premium-generatorer / måned",
        note: "Samlet pott for lesson, reading test, quiz, writing task m.m.",
        values: { free: "15", basic: "50", plus: "150", pro: "500" },
      },
      {
        label: "🧠 AI-tilbakemeldinger / måned",
        values: { free: "20", basic: "100", plus: "300", pro: "1000" },
      },
      {
        label: "🖼 AI-bilder / måned",
        values: { free: "5", basic: "50", plus: "200", pro: "1000" },
      },
      {
        label: "📥 Nedlastinger / måned",
        values: { free: "10", basic: "50", plus: "200", pro: "1000" },
      },
      {
        label: "👥 Maks medlemmer",
        note: "Samlet kapasitet",
        values: { free: "50", basic: "150", plus: "500", pro: "2000" },
      },
      {
        label: "🏫 Rom og tavler",
        values: { free: "Basic", basic: "Mer kapasitet", plus: "Stor kapasitet", pro: "Maks kapasitet" },
      },
      {
        label: "🌍 Premium app-tilgang",
        values: { free: "–", basic: "✔", plus: "✔", pro: "✔" },
      },
    ],
  },
  {
    id: "parent",
    title: "👨‍👩‍👧 Parent",
    subtitle: "For hjemmetrening, støtte og progresjonskontroll.",
    hint:
      "Parent-planene bruker også en samlet premium-generator-pott, sammen med egne grenser for AI-feedback, bilder og nedlastinger.",
    rows: [
      {
        label: "📚 Bibliotek (lese)",
        values: { free: "✔", basic: "✔", plus: "✔", pro: "✔" },
      },
      {
        label: "🏠 Læringsrom hjemme",
        values: { free: "✔", basic: "✔", plus: "✔", pro: "✔" },
      },
      {
        label: "🧠 Premium-generatorer / måned",
        note: "Samlet pott for premium-generatorer",
        values: { free: "1", basic: "5", plus: "20", pro: "100" },
      },
      {
        label: "🧠 AI-tilbakemeldinger / måned",
        values: { free: "3", basic: "20", plus: "75", pro: "200" },
      },
      {
        label: "🖼 AI-bilder / måned",
        values: { free: "–", basic: "10", plus: "50", pro: "150" },
      },
      {
        label: "📥 Nedlastinger / måned",
        values: { free: "3", basic: "15", plus: "50", pro: "150" },
      },
      {
        label: "👶 Kapasitet for familiebruk",
        values: { free: "Liten", basic: "Mer", plus: "Stor", pro: "Størst" },
      },
      {
        label: "🌍 Premium app-tilgang",
        values: { free: "–", basic: "✔", plus: "✔", pro: "✔" },
      },
    ],
  },
];

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function AccentPill({ accent, label }: { accent: Tier["accent"]; label: string }) {
  const cls =
    accent === "blue"
      ? "border-blue-200 bg-blue-50 text-blue-700"
      : accent === "violet"
      ? "border-violet-200 bg-violet-50 text-violet-700"
      : accent === "rose"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <span className={cx("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium", cls)}>
      {label}
    </span>
  );
}

function TierCard({ tier }: { tier: Tier }) {
  const border =
    tier.accent === "blue"
      ? "border-blue-200"
      : tier.accent === "violet"
      ? "border-violet-300 ring-2 ring-violet-100"
      : tier.accent === "rose"
      ? "border-rose-200"
      : "border-slate-200";

  const buttonClass =
    tier.accent === "violet"
      ? "bg-violet-700 hover:bg-violet-800"
      : "bg-slate-900 hover:bg-slate-800";

  return (
    <div className={cx("rounded-2xl border bg-white p-5 shadow-sm", border)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <AccentPill accent={tier.accent} label={tier.key === "free" ? "Gratis" : tier.name} />
            {tier.recommended ? (
              <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-700">
                Anbefalt
              </span>
            ) : null}
          </div>

          <div className="mt-3 text-lg font-semibold text-slate-900">{tier.name}</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{tier.price}</div>
          <p className="mt-2 text-sm text-slate-600">{tier.tagline}</p>
        </div>
      </div>

      <div className="mt-5">
        <Link
          href={tier.cta.href}
          className={cx(
            "inline-flex w-full items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium text-white",
            buttonClass
          )}
        >
          {tier.cta.label}
        </Link>
      </div>

      <p className="mt-3 text-xs text-slate-500">* Priser og innhold kan justeres før lansering.</p>
    </div>
  );
}

function ValueCell({ value }: { value: string }) {
  const isCheck = value.trim() === "✔";
  const isDash = value.trim() === "–" || value.trim() === "-";

  return (
    <div
      className={cx(
        "flex min-h-[40px] items-center justify-center rounded-lg px-2 text-sm text-center",
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
            <div key={row.label} className="grid grid-cols-1 gap-3 px-4 py-4 md:grid-cols-6 md:gap-3">
              <div className="md:col-span-2">
                <div className="text-sm font-medium text-slate-900">{row.label}</div>
                {row.note ? <div className="mt-0.5 text-xs text-slate-500">{row.note}</div> : null}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:col-span-4 md:grid-cols-4">
                <div className="md:hidden text-center text-xs font-medium text-slate-500">Free</div>
                <div className="md:hidden text-center text-xs font-medium text-slate-500">Basic</div>
                <div className="md:hidden text-center text-xs font-medium text-slate-500">Plus</div>
                <div className="md:hidden text-center text-xs font-medium text-slate-500">Pro</div>

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
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Priser og planer</h1>
            <p className="mt-3 text-base text-slate-600">
              321 School er bygget slik at alle kan lære gratis. Når du trenger mer kapasitet, flere AI-funksjoner og
              mer samarbeid, kan du oppgradere til planen som passer rollen din.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <a href="#student" className="rounded-full border px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                Student
              </a>
              <a href="#teacher" className="rounded-full border px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                Teacher
              </a>
              <a href="#parent" className="rounded-full border px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                Parent
              </a>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/" className="rounded-xl border px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
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

        <div className="mt-8 grid gap-4 md:mt-10 md:grid-cols-4">
          {TIERS.map((tier) => (
            <TierCard key={tier.key} tier={tier} />
          ))}
        </div>

        <div className="mt-8 rounded-2xl border bg-slate-50 p-5">
          <h2 className="text-base font-semibold text-slate-900">Hvordan fungerer dette i praksis?</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">Én samlet pott per kategori</div>
              <p className="mt-1 text-sm text-slate-600">
                Premium-generatorer, AI-feedback, bilder og nedlastinger teller i egne månedlige potter.
              </p>
            </div>
            <div className="rounded-xl bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">Dashboard og planer henger sammen</div>
              <p className="mt-1 text-sm text-slate-600">
                Tallene du ser i dashboardet ditt og i generatorene skal samsvare med grensene i planen din.
              </p>
            </div>
            <div className="rounded-xl bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">Rollene har ulik verdi</div>
              <p className="mt-1 text-sm text-slate-600">
                Student, teacher og parent får ulike grenser fordi de bruker plattformen forskjellig.
              </p>
            </div>
            <div className="rounded-xl bg-white p-4">
              <div className="text-sm font-semibold text-slate-900">Pluss er broen til premium</div>
              <p className="mt-1 text-sm text-slate-600">
                Plus er laget for brukere som trenger mer kapasitet, men ikke full profesjonell bruk.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-10 space-y-10 md:mt-12">
          {ROLES.map((role) => (
            <CompareTable key={role.id} role={role} />
          ))}
        </div>

        <div className="mt-12 border-t pt-6 text-sm text-slate-500">
          <p>
            Dette er en levende planside under utvikling. Tall, grenser og innhold kan justeres før lansering. Senere kan
            CTA-knappene kobles direkte til Stripe checkout eller en egen oppgraderingsflyt.
          </p>
        </div>
      </div>
    </main>
  );
}