// app/page.tsx
import Link from "next/link";
import Image from "next/image";
import { getTranslations } from "next-intl/server";

const brand = {
  name: "321skole",
  tagline: "AI-støttet språklæring – bygget for lærere, elsket av studenter",
};

export default async function HomePage() {
  const t = await getTranslations("landing");

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <TopBar
        brandName={brand.name}
        navTeachers={t("topbar.nav.teachers")}
        navStudents={t("topbar.nav.students")}
        navSpaces={t("topbar.nav.spaces")}
        login={t("common.login")}
        register={t("common.register")}
      />

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-sky-200/40 blur-3xl" />
          <div className="absolute -bottom-40 -right-40 h-[520px] w-[520px] rounded-full bg-emerald-200/40 blur-3xl" />
        </div>

        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 py-16 md:grid-cols-2 md:py-20">
          <div className="flex flex-col justify-center">
            <p className="inline-flex w-fit items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {t("hero.badge")}
            </p>

            <h1 className="mt-5 text-4xl font-semibold tracking-tight md:text-5xl">
              {t("hero.title")}
            </h1>

            <p className="mt-4 text-lg text-slate-700">{t("hero.lead")}</p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
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

            <p className="mt-4 text-sm text-slate-600">{t("hero.guestNote")}</p>

            <div className="mt-7 grid grid-cols-2 gap-4 text-sm text-slate-700">
              <MiniStat
                title={t("hero.stats.languages.title")}
                value={t("hero.stats.languages.value")}
                hint={t("hero.stats.languages.hint")}
              />
              <MiniStat
                title={t("hero.stats.level.title")}
                value={t("hero.stats.level.value")}
                hint={t("hero.stats.level.hint")}
              />
              <MiniStat
                title={t("hero.stats.audio.title")}
                value={t("hero.stats.audio.value")}
                hint={t("hero.stats.audio.hint")}
              />
              <MiniStat
                title={t("hero.stats.pdf.title")}
                value={t("hero.stats.pdf.value")}
                hint={t("hero.stats.pdf.hint")}
              />
            </div>
          </div>

          <div className="relative">
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl bg-slate-100">
                <Image
                  src="/landing/hero1.png"
                  alt={t("hero.imageAlt")}
                  fill
                  className="object-cover"
                  priority
                />
              </div>

              <div className="mt-3 grid grid-cols-3 gap-3">
                <MockCard title={t("hero.cards.text.title")} subtitle={t("hero.cards.text.subtitle")} />
                <MockCard title={t("hero.cards.tasks.title")} subtitle={t("hero.cards.tasks.subtitle")} />
                <MockCard title={t("hero.cards.feedback.title")} subtitle={t("hero.cards.feedback.subtitle")} />
              </div>
            </div>

            <div className="pointer-events-none absolute -bottom-6 -left-6 hidden rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur md:block">
              <p className="text-sm font-semibold">{t("hero.floating.title")}</p>
              <p className="mt-1 text-sm text-slate-700">{t("hero.floating.subtitle")}</p>
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
        image={{ src: "/landing/student.png", alt: t("students.imageAlt") }}
        bullets={[
          t("students.bullets.0"),
          t("students.bullets.1"),
          t("students.bullets.2"),
          t("students.bullets.3"),
          t("students.bullets.4"),
        ]}
        cta={{ href: "/login", label: t("students.cta") }}
        flip={true}
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
              <Image src="/landing/spaces.png" alt={t("spaces.imageAlt")} fill className="object-cover" />
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

      {/* PRIS / ROLLER */}
      <section className="bg-slate-50">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              {t("roles.title")}
            </h2>
            <p className="mt-4 text-lg text-slate-700">{t("roles.description")}</p>
          </div>

          {/* ✅ 3 kolonner nå (student/teacher/parent) */}
          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
            <RoleCard
              title={t("roles.cards.student.title")}
              free={[
                t("roles.cards.student.free.0"),
                t("roles.cards.student.free.1"),
                t("roles.cards.student.free.2"),
              ]}
              paidTitle={t("roles.cards.student.paidTitle")}
              price={t("roles.cards.student.price")}
              paid={[
                t("roles.cards.student.paid.0"),
                t("roles.cards.student.paid.1"),
              ]}
              cta={t("roles.cards.student.cta")}
            />

            <RoleCard
              title={t("roles.cards.teacher.title")}
              highlight
              free={[
                t("roles.cards.teacher.free.0"),
                t("roles.cards.teacher.free.1"),
                t("roles.cards.teacher.free.2"),
              ]}
              paidTitle={t("roles.cards.teacher.paidTitle")}
              price={t("roles.cards.teacher.price")}
              paid={[
                t("roles.cards.teacher.paid.0"),
                t("roles.cards.teacher.paid.1"),
                t("roles.cards.teacher.paid.2"),
              ]}
              cta={t("roles.cards.teacher.cta")}
            />

            <RoleCard
              title={t("roles.cards.parent.title")}
              free={[
                t("roles.cards.parent.free.0"),
                t("roles.cards.parent.free.1"),
              ]}
              paidTitle={t("roles.cards.parent.paidTitle")}
              price={t("roles.cards.parent.price")}
              paid={[
                t("roles.cards.parent.paid.0"),
                t("roles.cards.parent.paid.1"),
                t("roles.cards.parent.paid.2"),
              ]}
              cta={t("roles.cards.parent.cta")}
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-slate-900 text-white">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:items-center">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                {t("cta.title")}
              </h2>
              <p className="mt-4 text-lg text-white/80">{t("cta.lead")}</p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-white/90"
                >
                  {t("cta.primary")}
                </Link>

                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-transparent px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
                >
                  {t("cta.secondary")}
                </Link>
              </div>

              <p className="mt-4 text-sm text-white/70">{t("cta.note")}</p>
            </div>

            <div className="rounded-2xl bg-white/10 p-6">
              <p className="text-sm font-semibold">{t("cta.boxTitle")}</p>
              <div className="mt-4 grid grid-cols-1 gap-3 text-sm text-white/85">
                <CheckRow dark text={t("cta.checks.0")} />
                <CheckRow dark text={t("cta.checks.1")} />
                <CheckRow dark text={t("cta.checks.2")} />
                <CheckRow dark text={t("cta.checks.3")} />
                <CheckRow dark text={t("cta.checks.4")} />
                <CheckRow dark text={t("cta.checks.5")} />
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

function TopBar(props: {
  brandName: string;
  navTeachers: string;
  navStudents: string;
  navSpaces: string;
  login: string;
  register: string;
}) {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-sm font-bold text-white">
            321
          </span>
          <span className="text-sm font-semibold">{props.brandName}</span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm text-slate-700 md:flex">
          <a className="hover:text-slate-900" href="#for-larere">
            {props.navTeachers}
          </a>
          <a className="hover:text-slate-900" href="#for-studenter">
            {props.navStudents}
          </a>
          <a className="hover:text-slate-900" href="#spaces">
            {props.navSpaces}
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          >
            {props.login}
          </Link>

          <Link
            href="/login"
            className="inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            {props.register}
          </Link>
        </div>
      </div>
    </header>
  );
}

function MiniStat(props: { title: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-xs font-semibold text-slate-600">{props.title}</div>
      <div className="mt-1 text-sm font-semibold">{props.value}</div>
      <div className="mt-1 text-xs text-slate-600">{props.hint}</div>
    </div>
  );
}

function MockCard(props: { title: string; subtitle: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-xs font-semibold text-slate-700">{props.title}</div>
      <div className="mt-1 text-xs text-slate-500">{props.subtitle}</div>
    </div>
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

function RoleCard(props: {
  title: string;
  free: string[];
  paidTitle: string;
  price: string;
  paid: string[];
  cta: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border bg-white p-6 shadow-sm ${
        props.highlight ? "border-slate-900" : "border-slate-200"
      }`}
    >
      <h3 className="text-lg font-semibold">{props.title}</h3>

      <p className="mt-4 text-sm font-semibold text-slate-600">Gratis</p>
      <ul className="mt-2 space-y-2 text-sm text-slate-700">
        {props.free.map((f) => (
          <li key={f}>• {f}</li>
        ))}
      </ul>

      <div className="mt-4 rounded-xl bg-slate-50 p-3">
        <p className="text-sm font-semibold">
          {props.paidTitle} · {props.price}
        </p>
        <ul className="mt-2 space-y-2 text-sm text-slate-700">
          {props.paid.map((p) => (
            <li key={p}>✓ {p}</li>
          ))}
        </ul>
      </div>

      <Link
        href="/login"
        className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
      >
        {props.cta}
      </Link>
    </div>
  );
}