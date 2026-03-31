// app/page.tsx
import Link from "next/link";
import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";

const brand = {
  name: "321skole",
  tagline: "AI-støttet språklæring – bygget for lærere, elsket av studenter",
};

// Nå kun to språk. Legg bare til flere her senere (f.eks. en, es, fr ...).
// Dette er bevisst ikke i18n-styrt ennå.
const LOCALES: Array<{ code: string; label: string }> = [
  { code: "nb", label: "Norsk" },
  { code: "en", label: "English" },
  { code: "pt", label: "Português" },
];

export default async function HomePage() {
  const locale = (await getLocale()) as string;
  const t = await getTranslations("landing");
  const tr = await getTranslations(); // root (brand.*)

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <PublicHeader
        locale={locale}
        schoolLabel={tr("brandLogo.school")}
        loginLabel={t("common.login")}
      />

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-sky-200/40 blur-3xl" />
          <div className="absolute -bottom-40 -right-40 h-[520px] w-[520px] rounded-full bg-emerald-200/40 blur-3xl" />
        </div>

        <div className="mx-auto max-w-6xl px-6 py-14 md:py-18">
          <div className="flex justify-center">
            <p className="inline-flex w-fit items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {t("hero.badge")}
            </p>
          </div>

          <h1 className="mx-auto mt-5 max-w-3xl text-center text-4xl font-semibold tracking-tight md:text-5xl">
            {t("hero.title")}
          </h1>

          <p className="mx-auto mt-4 max-w-3xl text-center text-lg text-slate-700">
            {t("hero.lead")}
          </p>

          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
            >
              {t("hero.ctaPrimary")}
            </Link>

            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
            >
              {t("hero.ctaSecondary")}
            </Link>
          </div>

          <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="relative aspect-[21/9] w-full overflow-hidden rounded-xl bg-slate-100">
              <Image
                src="/landing/hero1_1.png"
                alt={t("hero.imageAlt")}
                fill
                className="object-cover"
                priority
              />
            </div>
          </div>
        </div>
      </section>

      {/* TRUST */}
      <section className="border-y border-slate-100 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <p className="text-center text-sm text-slate-600">{t("trustLine")}</p>
        </div>
      </section>

      {/* FOR LÆRERE */}
      <FeatureSection
        id="for-larere"
        eyebrow={t("teachers.eyebrow")}
        title={t("teachers.title")}
        description={t("teachers.description")}
        image={{ src: "/landing/teacher.png", alt: t("teachers.imageAlt") }}
        bullets={[
          t("teachers.bullets.0"),
          t("teachers.bullets.1"),
          t("teachers.bullets.2"),
          t("teachers.bullets.3"),
          t("teachers.bullets.4"),
          t("teachers.bullets.5"),
        ]}
        cta={{ href: "/login", label: t("teachers.cta") }}
        flip={false}
      />

      {/* FOR STUDENTER */}
      <FeatureSection
        id="for-studenter"
        eyebrow={t("students.eyebrow")}
        title={t("students.title")}
        description={t("students.description")}
        image={{ src: "/landing/studentstudy.jpg", alt: t("students.imageAlt") }}
        bullets={[
          t("students.bullets.0"),
          t("students.bullets.1"),
          t("students.bullets.2"),
          t("students.bullets.3"),
          t("students.bullets.4"),
          t("students.bullets.5"),
        ]}
        cta={{ href: "/login", label: t("students.cta") }}
        flip={true}
      />

      {/* FOR FORELDRE */}
      <FeatureSection
        id="for-parents"
        eyebrow={t("parents.eyebrow")}
        title={t("parents.title")}
        description={t("parents.description")}
        image={{ src: "/landing/parents_study.jpg", alt: t("parents.imageAlt") }}
        bullets={[
          t("parents.bullets.0"),
          t("parents.bullets.1"),
          t("parents.bullets.2"),
          t("parents.bullets.3"),
          t("parents.bullets.4"),
          t("parents.bullets.5"),
        ]}
        cta={{ href: "/login", label: t("parents.cta") }}
        flip={false}
      />

      {/* SPACES */}
      <section id="spaces" className="bg-slate-50">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold text-slate-600">{t("spaces.eyebrow")}</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              {t("spaces.title")}
            </h2>
            <p className="mt-4 text-lg text-slate-700">{t("spaces.description")}</p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
            <InfoCard title={t("spaces.cards.0.title")} text={t("spaces.cards.0.text")} />
            <InfoCard title={t("spaces.cards.1.title")} text={t("spaces.cards.1.text")} />
            <InfoCard title={t("spaces.cards.2.title")} text={t("spaces.cards.2.text")} />
          </div>

          <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="relative aspect-[16/6] overflow-hidden rounded-xl bg-slate-100">
              <Image
                src="/landing/spaces.png"
                alt={t("spaces.imageAlt")}
                fill
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* WHY AI */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
            <div>
              <p className="text-sm font-semibold text-slate-600">{t("whyAi.eyebrow")}</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
                {t("whyAi.title")}
              </h2>
              <p className="mt-4 text-lg text-slate-700">{t("whyAi.description")}</p>

              <div className="mt-6 grid grid-cols-1 gap-4">
                <CheckRow text={t("whyAi.checks.0")} />
                <CheckRow text={t("whyAi.checks.1")} />
                <CheckRow text={t("whyAi.checks.2")} />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <p className="text-sm font-semibold text-slate-700">{t("whyAi.flowTitle")}</p>
              <ol className="mt-4 space-y-3 text-sm text-slate-700">
                <li className="rounded-xl border border-slate-200 bg-white p-4">
                  <span className="font-semibold">1)</span> {t("whyAi.flow.1")}
                </li>
                <li className="rounded-xl border border-slate-200 bg-white p-4">
                  <span className="font-semibold">2)</span> {t("whyAi.flow.2")}
                </li>
                <li className="rounded-xl border border-slate-200 bg-white p-4">
                  <span className="font-semibold">3)</span> {t("whyAi.flow.3")}
                </li>
                <li className="rounded-xl border border-slate-200 bg-white p-4">
                  <span className="font-semibold">4)</span> {t("whyAi.flow.4")}
                </li>
                <li className="rounded-xl border border-slate-200 bg-white p-4">
                  <span className="font-semibold">5)</span> {t("whyAi.flow.5")}
                </li>
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* CTA (lite) */}
      <section className="bg-slate-900 text-white">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:items-center">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                {t("ctaLite.title")}
              </h2>
              <p className="mt-4 text-lg text-white/80">{t("ctaLite.lead")}</p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-white/90"
                >
                  {t("ctaLite.primary")}
                </Link>

                <Link
                  href="/pricing"
                  className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-transparent px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
                >
                  {t("ctaLite.secondary")}
                </Link>
              </div>

              <p className="mt-4 text-sm text-white/70">{t("ctaLite.note")}</p>
            </div>

            <div className="rounded-2xl bg-white/10 p-6">
              <p className="text-sm font-semibold">{t("ctaLite.boxTitle")}</p>
              <div className="mt-4 grid grid-cols-1 gap-3 text-sm text-white/85">
                <CheckRow dark text={t("ctaLite.checks.0")} />
                <CheckRow dark text={t("ctaLite.checks.1")} />
                <CheckRow dark text={t("ctaLite.checks.2")} />
                <CheckRow dark text={t("ctaLite.checks.3")} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-white">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold">{brand.name}</p>
              <p className="mt-1 text-sm text-slate-600">{brand.tagline}</p>
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              <Link className="text-slate-700 hover:text-slate-900" href="/about">
                {t("footer.about")}
              </Link>
              <Link className="text-slate-700 hover:text-slate-900" href="/privacy">
                {t("footer.privacy")}
              </Link>
              <Link className="text-slate-700 hover:text-slate-900" href="/contact">
                {t("footer.contact")}
              </Link>
            </div>
          </div>
          <p className="mt-6 text-xs text-slate-500">
            © {new Date().getFullYear()} {brand.name}. {t("footer.rights")}
          </p>
        </div>
      </footer>
    </main>
  );
}

function PublicHeader(props: { locale: string; schoolLabel: string; loginLabel: string }) {
  const localeNow = props.locale;
  const currentLabel = LOCALES.find((l) => l.code === localeNow)?.label ?? localeNow.toUpperCase();

  return (
    <header className="border-b border-slate-100 bg-white/80 backdrop-blur">
      <div className="mx-auto max-w-6xl px-6 py-2">
        {/* Top row: RIGHT aligned language + login */}
        <div className="flex items-center justify-end gap-2">
          <details className="relative">
            <summary className="list-none cursor-pointer select-none rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-50">
              {currentLabel}
            </summary>
            <div className="absolute right-0 mt-2 w-20 overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
              {LOCALES.map((l) => (
                <Link
                  key={l.code}
                  href={`/${l.code}`}
                  className={`block px-2.5 py-2 text-[11px] hover:bg-slate-50 ${
                    l.code === localeNow ? "font-semibold text-slate-900" : "text-slate-700"
                  }`}
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </details>

          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-900 hover:bg-slate-50"
          >
            {props.loginLabel}
          </Link>
        </div>

        {/* Brand block: centered. Logo on top, 321skole under (same sizes) */}
        <div className="mt-3 flex flex-col items-center justify-center pb-2 pt-4">
          <Image
            src="/logo321ny.png"
            alt="321"
            width={90}
            height={30}
            priority
            className="h-auto w-auto object-contain"
          />

          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-3xl font-extrabold text-slate-900">321</span>
            <span className="text-3xl font-semibold text-sky-400">{props.schoolLabel}</span>
          </div>
        </div>
      </div>
    </header>
  );
}

function FeatureSection(props: {
  id?: string;
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
  cta: { href: string; label: string };
  image: { src: string; alt: string };
  flip: boolean;
}) {
  return (
    <section id={props.id} className="bg-white">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div
          className={`grid grid-cols-1 items-center gap-10 md:grid-cols-2 ${
            props.flip ? "md:[&>*:first-child]:order-2" : ""
          }`}
        >
          <div>
            <p className="text-sm font-semibold text-slate-600">{props.eyebrow}</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              {props.title}
            </h2>
            <p className="mt-4 text-lg text-slate-700">{props.description}</p>

            <ul className="mt-6 space-y-3 text-sm text-slate-700">
              {props.bullets.map((b) => (
                <li key={b} className="flex gap-3">
                  <span className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    ✓
                  </span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>

            <div className="mt-7">
              <Link
                href={props.cta.href}
                className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
              >
                {props.cta.label}
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-slate-100">
              <Image src={props.image.src} alt={props.image.alt} fill className="object-cover" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function InfoCard(props: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-semibold">{props.title}</p>
      <p className="mt-2 text-sm text-slate-700">{props.text}</p>
    </div>
  );
}

function CheckRow(props: { text: string; dark?: boolean }) {
  return (
    <div className={`flex gap-3 ${props.dark ? "text-white/85" : "text-slate-700"}`}>
      <span
        className={`mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full ${
          props.dark ? "bg-white/15 text-white" : "bg-emerald-100 text-emerald-700"
        }`}
      >
        ✓
      </span>
      <span className="text-sm">{props.text}</span>
    </div>
  );
}