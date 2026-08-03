import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  BookOpen,
  ClipboardCheck,
  GraduationCap,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Users,
  Vote,
} from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

const LOCALES: Array<{ code: string; label: string }> = [
  { code: "nb", label: "Norsk" },
  { code: "en", label: "English" },
  { code: "pt", label: "Português" },
];

function publicLabels(locale: string) {
  if (locale === "pt") return { login: "Entrar" };
  if (locale === "en") return { login: "Log in" };
  return { login: "Logg inn" };
}

function schoolLandingNotice(locale: string) {
  if (locale === "pt") {
    return {
      eyebrow: "Escolas no Brasil",
      title: "321escola ainda está sendo preparada para o Brasil.",
      text: "Estamos começando com escolas na Noruega e preparando a 321escola para outros países. Em breve, escolas brasileiras poderão solicitar acesso, convidar professores e usar atividades com alunos em uma estrutura adaptada ao Brasil.",
      primary: "Voltar para 321escola",
      secondary: "Entrar em contato",
    };
  }

  if (locale === "en") {
    return {
      eyebrow: "Schools",
      title: "321school is not ready in your country yet.",
      text: "We are starting with schools in Norway and preparing 321school for more countries. Soon, schools outside Norway will be able to request access, invite teachers, and use classroom activities in a setup adapted to their country.",
      primary: "Back to 321school",
      secondary: "Contact us",
    };
  }

  return null;
}

function localizedPath(locale: string, path: string) {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${clean}`;
}

export default async function SchoolsLandingPage() {
  const locale = (await getLocale()) as string;
  const t = await getTranslations();
  const notice = schoolLandingNotice(locale);
  const labels = publicLabels(locale);

  return (
    <main className="min-h-screen bg-white text-slate-950">
      <PublicHeader
        locale={locale}
        schoolLabel={t("brandLogo.school")}
        loginLabel={labels.login}
      />

      {notice ? (
        <SchoolComingSoonSection locale={locale} notice={notice} />
      ) : (
        <>
          <HeroSection locale={locale} />
          <SchoolValueSection locale={locale} />
          <YearPlansSection locale={locale} />
          <SpacesActivitiesSection locale={locale} />
          <OrderCtaSection locale={locale} />
        </>
      )}
    </main>
  );
}

function PublicHeader(props: {
  locale: string;
  schoolLabel: string;
  loginLabel: string;
}) {
  const currentLabel =
    LOCALES.find((l) => l.code === props.locale)?.label ?? props.locale.toUpperCase();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-2.5">
        <Link href={localizedPath(props.locale, "/")} className="flex items-center gap-3">
          <Image
            src="/logo321ny.png"
            alt="321"
            width={36}
            height={36}
            priority
            className="h-8 w-auto object-contain"
          />

          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-slate-900">321</span>
            <span className="text-xl font-semibold text-sky-500">
              {props.schoolLabel}
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          <details className="relative">
            <summary className="list-none cursor-pointer select-none rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50">
              {currentLabel}
            </summary>
            <div className="absolute right-0 mt-2 w-28 overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
              {LOCALES.map((l) => (
                <Link
                  key={l.code}
                  href={`/${l.code}/skoler`}
                  className={`block px-3 py-2 text-xs hover:bg-slate-50 ${l.code === props.locale ? "font-semibold text-slate-900" : "text-slate-700"
                    }`}
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </details>

          <Link
            href={localizedPath(props.locale, "/login")}
            className="inline-flex items-center justify-center rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            {props.loginLabel}
          </Link>
        </div>
      </div>
    </header>
  );
}

function SchoolComingSoonSection(props: {
  locale: string;
  notice: NonNullable<ReturnType<typeof schoolLandingNotice>>;
}) {
  return (
    <section className="bg-slate-50">
      <div className="mx-auto grid min-h-[calc(100vh-61px)] max-w-6xl grid-cols-1 gap-8 px-6 py-12 md:grid-cols-[1fr_0.9fr] md:items-center md:gap-12 md:py-20">
        <div>
          <p className="inline-flex rounded-full bg-sky-100 px-4 py-2 text-sm font-semibold text-sky-800">
            {props.notice.eyebrow}
          </p>

          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 md:mt-6 md:text-6xl">
            {props.notice.title}
          </h1>

          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-700 md:mt-5 md:text-lg">
            {props.notice.text}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href={localizedPath(props.locale, "/")}
              className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
            >
              {props.notice.primary}
            </Link>

            <Link
              href={localizedPath(props.locale, "/contact")}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
            >
              {props.notice.secondary}
            </Link>
          </div>
        </div>

        <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-2 shadow-sm">
          <div className="relative aspect-[4/5] overflow-hidden rounded-[1.5rem] bg-slate-100">
            <Image
              src="/landingschool/teacher_helping.jpg"
              alt=""
              fill
              priority
              className="object-cover object-center"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroSection(props: { locale: string }) {
  return (
    <section className="relative overflow-hidden bg-sky-600 text-white">
      <div className="mx-auto max-w-6xl px-6 py-10 md:py-20">
        <div className="mx-auto max-w-4xl text-center">
          <p className="inline-flex rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/20">
            For skoler, voksenopplæring og barnehager
          </p>

          <h1 className="mt-4 text-4xl font-semibold tracking-tight md:mt-6 md:text-6xl">
            Endelig et praktisk verktøy som alle kan bruke, vikarer også.
          </h1>

          <p className="mx-auto mt-4 max-w-3xl text-lg text-white/85 md:mt-5 md:text-xl">
            Lag, del og følg opp undervisning på få minutter. 321skole gir
            lærere, assistenter og vikarer enkel tilgang til ferdige opplegg,
            tydelige planer og full oversikt.
          </p>

          <div className="mt-6 block overflow-hidden rounded-2xl border border-white/20 bg-white/10 p-2 md:hidden">
            <div className="relative aspect-video w-full">
              <Image
                src="/landingschool/hero_school.jpg"
                alt="Lærere som bruker 321skole"
                fill
                priority
                className="object-cover object-center"
              />
            </div>
          </div>

          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row md:mt-8">
            <Link
              href={localizedPath(props.locale, "/login")}
              className="inline-flex items-center justify-center rounded-xl bg-white px-6 py-3 text-sm font-semibold text-slate-950 shadow-sm hover:bg-white/90"
            >
              Prøv gratis
            </Link>

            <Link
              href={localizedPath(props.locale, "/321lessons")}
              className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-6 py-3 text-sm font-semibold text-white hover:bg-white/15"
            >
              Se bibliotek
            </Link>
          </div>
        </div>

        <div className="mt-10 hidden rounded-3xl border border-white/20 bg-white/10 p-3 shadow-sm backdrop-blur md:block">
          <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-slate-100">
            <Image
              src="/landingschool/hero_school.jpg"
              alt="Lærere som bruker 321skole"
              fill
              priority
              className="object-cover object-center"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function SchoolValueSection(props: { locale: string }) {
  return (
    <section className="relative overflow-hidden bg-white">
      <div className="absolute inset-0 bg-gradient-to-br from-sky-600 via-sky-400 to-sky-600" />

      <div className="relative mx-auto max-w-6xl px-6 py-12 md:py-20">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-[0.95fr_1.05fr] md:items-center md:gap-10">
          <div className="order-1 md:order-2 md:col-start-2 md:row-start-1">
            <p className="inline-flex rounded-full bg-indigo-100 px-4 py-2 text-sm font-semibold text-indigo-800">
              Endelig noe alle kan bruke
            </p>

            <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight text-slate-100 md:mt-5 md:text-6xl">
              Et verktøy hele skolen faktisk kan ta i bruk.
            </h2>

            <p className="mt-4 max-w-xl text-base text-slate-100/85 md:mt-5 md:text-xl">
              Ferdige opplegg, årsplaner og oppfølging samlet på ett sted.
              Enkelt for lærere, assistenter og vikarer, med lave kostnader for
              skolen.
            </p>
          </div>

          <div className="order-2 rounded-[2rem] border border-white bg-white/80 p-2 shadow-xl shadow-sky-900/10 backdrop-blur md:order-1 md:col-start-1 md:row-span-2 md:row-start-1">
            <div className="relative aspect-[4/5] overflow-hidden rounded-[1.5rem] bg-slate-100">
              <Image
                src="/landingschool/teacher_thumbsup.png"
                alt="Lærer og elever bruker 321skole"
                fill
                className="object-cover object-center"
              />

              <FloatingLabel
                position="top-left"
                title="Tilgang"
                text="For lærere og vikarer"
              />

              <FloatingLabel
                position="bottom-right"
                title="Klasserom"
                text="Enkel elevbruk"
              />
            </div>
          </div>

          <div className="order-3 md:col-start-2 md:row-start-2">
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 md:mt-0 md:gap-3">
              <FeatureCard
                icon={<BookOpen size={18} />}
                title="Undervisningsopplegg"
                text="Lag selv med støtte fra KI eller hent fra bibliotek."
              />
              <FeatureCard
                icon={<GraduationCap size={18} />}
                title="Lave kostnader"
                text="Bygget for enkel bruk på hele skolen."
              />
              <FeatureCard
                icon={<Users size={18} />}
                title="Enkel administrasjon"
                text="Legg til eller ta bort ansatte eller vikarer på få klikk."
              />
              <FeatureCard
                icon={<ShieldCheck size={18} />}
                title="Full kontroll"
                text="Få statistikk hver måned over bruk."
              />
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href={localizedPath(props.locale, "/skoler/bestilling")}
                className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
              >
                Bestill for skolen
              </Link>

              <Link
                href={localizedPath(props.locale, "/321lessons")}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
              >
                Se bibliotek
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function YearPlansSection(props: { locale: string }) {
  return (
    <section className="bg-white">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 py-12 md:grid-cols-[1.05fr_0.95fr] md:items-center md:gap-12 md:py-20">
        <div>
          <p className="inline-flex rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-800">
            Årsplaner fra Udir-grunnlag
          </p>

          <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight text-slate-950 md:mt-5 md:text-5xl">
            Gå fra læreplan til årsplan på minutter.
          </h2>

          <p className="mt-4 max-w-xl text-base leading-7 text-slate-700 md:text-lg">
            321skole henter læreplangrunnlag fra Udir, fordeler mål over
            skoleåret og gjør planen klar til praktisk undervisning.
          </p>

          <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <YearPlanPoint
              icon={<ClipboardCheck size={18} />}
              title="Udir-grunnlag"
              text="Start med offisielle mål og riktig læreplangrunnlag."
            />
            <YearPlanPoint
              icon={<BookOpen size={18} />}
              title="Året fordeles"
              text="Få perioder, temaer og mål satt i en tydelig rekkefølge."
            />
            <YearPlanPoint
              icon={<ShieldCheck size={18} />}
              title="Klar til bruk"
              text="Koble planen til oppgaver, undervisning og lokale valg."
            />
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href={localizedPath(props.locale, "/skoler/bestilling")}
              className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
            >
              Bestill for skolen
            </Link>

            <Link
              href={localizedPath(props.locale, "/login")}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
            >
              Prøv gratis
            </Link>
          </div>
        </div>

        <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-100 p-2 shadow-sm">
          <div className="relative aspect-[4/5] overflow-hidden rounded-[1.5rem]">
            <Image
              src="/landingschool/teacher_satisfied.jpeg"
              alt="Fornøyd lærer med årsplaner i 321skole"
              fill
              className="object-cover object-center"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function SpacesActivitiesSection(props: { locale: string }) {
  return (
    <section className="bg-slate-50 text-slate-950">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 py-12 md:grid-cols-[0.95fr_1.05fr] md:items-center md:gap-12 md:py-20">
        <div className="order-2 md:order-1">
          <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-2 shadow-sm">
            <div className="relative aspect-[4/5] overflow-hidden rounded-[1.5rem] bg-slate-100">
              <Image
                src="/landing/quiz%20action.jpeg"
                alt="Elever svarer på quiz fra digital tavle i 321skole Spaces"
                fill
                className="object-cover object-center"
              />
            </div>
          </div>
        </div>

        <div className="order-1 md:order-2">
          <p className="inline-flex rounded-full bg-cyan-100 px-4 py-2 text-sm font-semibold text-cyan-900">
            Digital tavle i Spaces
          </p>

          <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight md:mt-5 md:text-5xl">
            Start en aktivitet på storskjerm på få sekunder.
          </h2>

          <p className="mt-4 max-w-xl text-base leading-7 text-slate-700 md:text-lg">
            Samle klassen rundt quiz, ordsky og avstemming. Elevene svarer fra
            egen skjerm, mens resultatene vises live på tavla.
          </p>

          <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <ActivityPoint
              icon={<Sparkles size={18} />}
              title="Quiz"
              text="Sjekk forståelse og skap energi i timen."
            />
            <ActivityPoint
              icon={<MessageCircle size={18} />}
              title="Ordsky"
              text="Få alle stemmer inn på tavla samtidig."
            />
            <ActivityPoint
              icon={<Vote size={18} />}
              title="Avstemming"
              text="La klassen velge, mene og svare direkte."
            />
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href={localizedPath(props.locale, "/login")}
              className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
            >
              Prøv gratis
            </Link>

            <Link
              href={localizedPath(props.locale, "/321quiz")}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
            >
              Se quiz
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function OrderCtaSection(props: { locale: string }) {
  return (
    <section className="bg-slate-950 text-white">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 py-14 md:grid-cols-[1fr_0.9fr] md:items-center">
        <div>
          <p className="inline-flex rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/15">
            For skoleeiere og ledelse
          </p>
          <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight md:text-5xl">
            Start med lærerne. Elevene er med uten ekstra kostnad.
          </h2>
          <p className="mt-4 max-w-xl text-base text-white/75 md:text-lg">
            Skolen gir tilgang til lærere, assistenter og vikarer som trenger
            verktøyet. Elevene kan bruke opplegg og aktiviteter i klasserommet
            uten at skolen betaler per elev.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/10 p-6">
          <div className="flex items-start gap-3">
            <span className="mt-1 inline-flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-white text-slate-950">
              <ClipboardCheck size={20} />
            </span>
            <div>
              <p className="text-sm font-semibold">Bestillingsskjema</p>
              <p className="mt-2 text-sm leading-6 text-white/75">
                Legg inn skole, kontaktperson og antall voksne som trenger
                tilgang. Dere får en enkel oversikt før bestilling sendes inn.
              </p>
            </div>
          </div>

          <Link
            href={localizedPath(props.locale, "/skoler/bestilling")}
            className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-white/90"
          >
            Gå til bestilling
          </Link>
        </div>
      </div>
    </section>
  );
}

function FeatureCard(props: {
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sky-700">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50">
          {props.icon}
        </span>
        <p className="text-sm font-semibold text-slate-950">{props.title}</p>
      </div>
      <p className="mt-2 text-sm leading-5 text-slate-700">{props.text}</p>
    </div>
  );
}

function YearPlanPoint(props: {
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white text-emerald-700 shadow-sm">
        {props.icon}
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-950">{props.title}</p>
      <p className="mt-1 text-sm leading-5 text-slate-600">{props.text}</p>
    </div>
  );
}

function ActivityPoint(props: {
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700">
        {props.icon}
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-950">{props.title}</p>
      <p className="mt-1 text-sm leading-5 text-slate-600">{props.text}</p>
    </div>
  );
}

function FloatingLabel(props: {
  position: "top-left" | "bottom-right";
  title: string;
  text: string;
}) {
  const positionClasses =
    props.position === "top-left"
      ? "left-2 top-2 md:left-4 md:top-4"
      : "bottom-2 right-2 md:bottom-4 md:right-4";

  return (
    <div
      className={`absolute ${positionClasses} rounded-xl bg-white/75 px-3 py-2 shadow-md backdrop-blur md:bg-white/90 md:px-4 md:py-3`}
    >
      <p className="text-[10px] font-semibold uppercase text-slate-500 md:text-xs">
        {props.title}
      </p>
      <p className="mt-0.5 text-xs font-semibold text-slate-900 md:text-sm">
        {props.text}
      </p>
    </div>
  );
}
