// app/[locale]/page.tsx
import Link from "next/link";
import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import NorwayLegacyNotice from "@/components/domain/NorwayLegacyNotice";
import LaunchCampaignBanner from "@/components/LaunchCampaignBanner";
import LandingAuthRedirect from "./LandingAuthRedirect";

const brand = {
  name: "321skole",
};

const LOCALES: Array<{ code: string; label: string }> = [
  { code: "nb", label: "Norsk" },
  { code: "en", label: "English" },
  { code: "pt", label: "Português" },
];

type FeaturedLesson = {
  id: string;
  title: string;
  level?: string;
  language?: string;
  textType?: string;
  image?: string;
};

type TFn = (key: string, values?: Record<string, string | number>) => string;

function localizedPath(locale: string, path: string) {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${clean}`;
}

function pickLocalizedText(value: unknown, locale: string): string {
  if (!value) return "";

  if (typeof value === "string") return value.trim();

  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    const direct = obj[locale] ?? obj.nb ?? obj.en ?? obj.pt ?? obj.no ?? obj.title;

    if (typeof direct === "string") return direct.trim();
  }

  return "";
}

function pickImageValue(value: unknown, locale: string): string {
  if (!value) return "";

  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;

    const candidates = [
      obj.url,
      obj.src,
      obj.imageUrl,
      obj.thumbnailUrl,
      obj.downloadURL,
      obj.downloadUrl,
      obj.publicUrl,
      obj.secure_url,
      obj[locale],
      obj.nb,
      obj.en,
      obj.pt,
      obj.default,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }
  }

  return "";
}

function pickLessonImage(data: Record<string, unknown>, locale: string): string {
  const direct = [
    data.coverImageUrl,
    data.imageUrl,
    data.image,
    data.coverImage,
    data.thumbnailUrl,
    data.coverUrl,
    data.previewImage,
    data.heroImage,
    data.photoUrl,
    data.poster,
  ];

  for (const value of direct) {
    const picked = pickImageValue(value, locale);
    if (picked) return picked;
  }

  const nested = [data.images, data.media, data.cover, data.thumbnail, data.hero];

  for (const value of nested) {
    const picked = pickImageValue(value, locale);
    if (picked) return picked;
  }

  return "";
}

async function getPublishedLessonCount(): Promise<number> {
  try {
    const { db } = getAdmin();
    const snap = await db.collection("published_lessons").get();

    let count = 0;

    for (const doc of snap.docs) {
      const data = doc.data() as Record<string, unknown>;
      const visibility = String(data.visibility ?? "");
      const type = String(data.type ?? data.textType ?? "");
      const archived = Boolean(data.archived);
      const isActive = data.isActive !== false;

      if (visibility === "private") continue;
      if (type === "reading_test") continue;
      if (archived) continue;
      if (!isActive) continue;

      count += 1;
    }

    return count;
  } catch {
    return 0;
  }
}

function languageRank(language: string | undefined, locale: string) {
  const lang = (language ?? "").toLowerCase();
  const current = locale.toLowerCase();

  if (lang === current) return 0;

  if (current === "nb" && (lang === "nb" || lang === "no")) return 0;
  if (current === "pt" && (lang === "pt" || lang === "pt-br" || lang === "br")) return 0;

  const fallbackOrder =
    current === "en"
      ? ["en", "nb", "pt", "pt-br"]
      : current === "pt"
        ? ["pt", "pt-br", "nb", "en"]
        : ["nb", "no", "en", "pt", "pt-br"];

  const index = fallbackOrder.indexOf(lang);

  return index === -1 ? 99 : index + 1;
}

function isPreferredLanguage(language: string | undefined, locale: string) {
  return languageRank(language, locale) === 0;
}

async function getFeaturedLessons(locale: string): Promise<FeaturedLesson[]> {
  try {
    const { db } = getAdmin();

    const snap = await db
      .collection("published_lessons")
      .orderBy("createdAt", "desc")
      .limit(80)
      .get();

    const items: FeaturedLesson[] = [];

    for (const doc of snap.docs) {
      const data = doc.data() as Record<string, unknown>;

      const visibility = String(data.visibility ?? "");
      const type = String(data.type ?? data.textType ?? "");
      const archived = Boolean(data.archived);
      const isActive = data.isActive !== false;

      if (visibility === "private" || type === "reading_test" || archived || !isActive) {
        continue;
      }

      const title =
        pickLocalizedText(data.title, locale) ||
        pickLocalizedText(data.name, locale) ||
        String(data.topic ?? "").trim() ||
        "";

      if (!title) continue;

      const image = pickLessonImage(data, locale);

      items.push({
        id: doc.id,
        title,
        level: String(data.level ?? ""),
        language: String(data.language ?? ""),
        textType: String(data.textType ?? data.type ?? ""),
        image,
      });
    }

    const seen = new Set<string>();
    const unique = items.filter((item) => {
      const normalizedTitle = item.title.trim().toLowerCase();
      const normalizedLanguage = (item.language ?? "").trim().toLowerCase();
      const normalizedType = (item.textType ?? "").trim().toLowerCase();
      const key = `${normalizedTitle}__${normalizedLanguage}__${normalizedType}`;

      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const preferred = unique.filter((item) => isPreferredLanguage(item.language, locale));
    const displayItems = preferred.length > 0 ? preferred : unique;

    const sorted = displayItems.sort((a, b) => {
      const langDiff =
        languageRank(a.language, locale) - languageRank(b.language, locale);

      if (langDiff !== 0) return langDiff;

      return a.title.localeCompare(b.title, locale);
    });

    if (sorted.length > 0) return sorted;

    return getFallbackLessons(locale);
  } catch {
    return getFallbackLessons();
  }
}

function getFallbackLessons(locale = "nb"): FeaturedLesson[] {
  return [
    {
      id: "1",
      title: "Lag en fortelling om Edvard Munch",
      level: "A2",
      language: "nb",
      textType: "fortelling",
      image: "/landing/teacher-power.png",
    },
    {
      id: "2",
      title: "Read and write about jobs",
      level: "A1",
      language: "en",
      textType: "lesson",
      image: "/landing/student-flow.png",
    },
    {
      id: "3",
      title: "Diskriminering forklart enkelt",
      level: "B1",
      language: "nb",
      textType: "article",
      image: "/landing/language-learning.png",
    },
    {
      id: "4",
      title: "Cinema vocabulary and linking words",
      level: "A2",
      language: "en",
      textType: "lesson",
      image: "/landing/student-flow.png",
    },
    {
      id: "5",
      title: "Carta formal de reclamação",
      level: "A2",
      language: "pt",
      textType: "writing",
      image: "/landing/language-learning.png",
    },
    {
      id: "6",
      title: "Norsk grammatikk med enkle oppgaver",
      level: "A1",
      language: "nb",
      textType: "grammar",
      image: "/landing/wow-learning.png",
    },
    {
      id: "7",
      title: "English reading practice",
      level: "A1",
      language: "en",
      textType: "reading",
      image: "/landing/student-flow.png",
    },
    {
      id: "8",
      title: "Beskriv et bilde på norsk",
      level: "A1",
      language: "nb",
      textType: "writing",
      image: "/landing/teacher-power.png",
    },
    {
      id: "9",
      title: "Vocabulário sobre escola",
      level: "A1",
      language: "pt",
      textType: "vocabulary",
      image: "/landing/language-learning.png",
    },
    {
      id: "10",
      title: "Historie: korte fakta og spørsmål",
      level: "B1",
      language: "nb",
      textType: "history",
      image: "/landing/wow-learning.png",
    },
    {
      id: "11",
      title: "Write about a film you like",
      level: "A2",
      language: "en",
      textType: "writing",
      image: "/landing/student-flow.png",
    },
    {
      id: "12",
      title: "Les og svar på spørsmål",
      level: "A2",
      language: "nb",
      textType: "reading",
      image: "/landing/language-learning.png",
    },
  ].sort((a, b) => {
    const langDiff =
      languageRank(a.language, locale) - languageRank(b.language, locale);

    if (langDiff !== 0) return langDiff;

    return a.title.localeCompare(b.title, locale);
  });
}

export default async function HomePage() {
  const locale = (await getLocale()) as string;
  const t = await getTranslations("landing");
  const tr = await getTranslations();
  const currentYear = new Date().getUTCFullYear();

  const [featured, totalLessonCount] = await Promise.all([
    getFeaturedLessons(locale),
    getPublishedLessonCount(),
  ]);

  const lessonCountLabel = new Intl.NumberFormat(locale).format(totalLessonCount);

  const midpoint = Math.ceil(featured.length / 2);
  const firstRow = featured.slice(0, midpoint);
  const secondRow = featured.slice(midpoint);

  return (
    <div className="min-h-screen text-slate-900">
      <LandingAuthRedirect locale={locale} />
      <PublicHeader
        locale={locale}
        schoolLabel={tr("brandLogo.school")}
        loginLabel={t("common.login")}
      />

      <LaunchCampaignBanner
        locale={locale}
        href={localizedPath(locale, "/pricing")}
        variant="landing"
      />

      <HeroSection t={t} locale={locale} />

      <RoleGatewaySection t={t} locale={locale} />

      <TopLibrarySection
        locale={locale}
        t={t}
        featured={featured}
        firstRow={firstRow}
        secondRow={secondRow}
        lessonCountLabel={lessonCountLabel}
      />

      <QuizLiveSection t={t} locale={locale} />

      <AiSupportSection t={t} locale={locale} />

      <PrintOrDigitalSection t={t} locale={locale} />

      <SpacesSection t={t} locale={locale} />

      <WowSection t={t} locale={locale} />

      <TeacherPowerSection t={t} locale={locale} />

      <NorwayLegacyNotice />



      <ParentHomeSection t={t} locale={locale} />

      <StudentFlowSection t={t} locale={locale} />

      <LanguageLearningSection t={t} locale={locale} />

      <FinalCtaSection t={t} locale={locale} />

      <FooterSection t={t} locale={locale} currentYear={currentYear} />
    </div>
  );
}

function PublicHeader(props: {
  locale: string;
  schoolLabel: string;
  loginLabel: string;
}) {
  const localeNow = props.locale;
  const currentLabel =
    LOCALES.find((l) => l.code === localeNow)?.label ?? localeNow.toUpperCase();

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
                  href={`/${l.code}`}
                  className={`block px-3 py-2 text-xs hover:bg-slate-50 ${l.code === localeNow ? "font-semibold text-slate-900" : "text-slate-700"
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

function HeroSection(props: { t: TFn; locale: string }) {
  return (
    <section className="relative overflow-hidden bg-sky-600 text-white">
      <div className="mx-auto max-w-6xl px-6 py-10 md:py-20">
        <div className="mx-auto max-w-4xl text-center">
          <p className="inline-flex rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/20">
            {props.t("hero.badge")}
          </p>

          <h1 className="mt-4 text-4xl font-semibold tracking-tight md:mt-6 md:text-6xl">
            {props.t("hero.title")}
          </h1>

          <p className="mx-auto mt-4 max-w-3xl text-lg text-white/85 md:mt-5 md:text-xl">
            {props.t("hero.lead")}
          </p>

          {/* 📱 IMAGE (MOBILE ONLY) */}
          <div className="mt-6 block md:hidden rounded-2xl overflow-hidden border border-white/20 bg-white/10 p-2">
            <div className="relative aspect-[4/5] w-full">
              <Image
                src="/landing/hero_ny.jpg"
                alt={props.t("hero.imageAlt")}
                fill
                className="object-cover object-center"
                priority
              />
            </div>
          </div>

        </div>

        {/* 💻 IMAGE (DESKTOP ONLY) */}
        <div className="mt-10 hidden md:block rounded-3xl border border-white/20 bg-white/10 p-3 shadow-sm backdrop-blur">
          <div className="relative aspect-[21/9] w-full overflow-hidden rounded-2xl bg-slate-100">
            <Image
              src="/landing/hero_ny.jpg"
              alt={props.t("hero.imageAlt")}
              fill
              className="object-cover object-center"
              priority
            />
          </div>
        </div>

        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row md:mt-8">
          <Link
            href={localizedPath(props.locale, "/login")}
            className="inline-flex items-center justify-center rounded-xl bg-white px-6 py-3 text-sm font-semibold text-slate-950 shadow-sm hover:bg-white/90"
          >
            {props.t("hero.ctaPrimary")}
          </Link>

          <Link
            href={localizedPath(props.locale, "/321lessons")}
            className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/10 px-6 py-3 text-sm font-semibold text-white hover:bg-white/15"
          >
            {props.t("hero.ctaSecondary")}
          </Link>
        </div>
      </div>
    </section>
  );
}

function RoleGatewaySection(props: { t: TFn; locale: string }) {
  const roles = [
    {
      key: "teacher",
      image: "/landing/symbol_teacher_ny.png",
      learnHref: "#ai-support",
      startHref: "/login",
    },
    {
      key: "student",
      image: "/landing/symbol_student_ny.png",
      learnHref: "#for-students",
      startHref: "/login",
    },
    {
      key: "parent",
      image: "/landing/symbol_parent_ny.png",
      learnHref: "#for-parents",
      startHref: "/login",
    },
    {
      key: "school",
      image: "/landing/symbol_school_ny.png",
      learnHref: "/skoler",
      startHref: "/skoler/bestilling",
    },
  ];

  return (
    <section className="bg-white">
      <div className="mx-auto max-w-6xl px-6 py-10 md:py-14">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase text-sky-700">
            {props.t("roleGateway.eyebrow")}
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
            {props.t("roleGateway.title")}
          </h2>
          <p className="mt-3 text-base leading-7 text-slate-700 md:text-lg">
            {props.t("roleGateway.description")}
          </p>
        </div>

        <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {roles.map((role) => (
            <RoleGatewayCard
              key={role.key}
              title={props.t(`roleGateway.cards.${role.key}.title`)}
              text={props.t(`roleGateway.cards.${role.key}.text`)}
              points={[
                props.t(`roleGateway.cards.${role.key}.points.0`),
                props.t(`roleGateway.cards.${role.key}.points.1`),
                props.t(`roleGateway.cards.${role.key}.points.2`),
                props.t(`roleGateway.cards.${role.key}.points.3`),
                props.t(`roleGateway.cards.${role.key}.points.4`),
              ]}
              image={role.image}
              imageAlt={props.t(`roleGateway.cards.${role.key}.imageAlt`)}
              learnHref={role.learnHref}
              startHref={role.startHref}
              learnLabel={props.t("roleGateway.learnMore")}
              startLabel={props.t("roleGateway.startNow")}
              locale={props.locale}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function RoleGatewayCard(props: {
  title: string;
  text: string;
  points: string[];
  image: string;
  imageAlt: string;
  learnHref: string;
  startHref: string;
  learnLabel: string;
  startLabel: string;
  locale: string;
}) {
  const learnHref = props.learnHref.startsWith("#")
    ? props.learnHref
    : localizedPath(props.locale, props.learnHref);
  const startHref = localizedPath(props.locale, props.startHref);

  return (
    <details className="group rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-sm transition hover:border-sky-200 hover:bg-white hover:shadow-md">
      <summary className="block cursor-pointer list-none">
        <div className="relative aspect-[14/17] overflow-hidden rounded-xl bg-white">
          <Image
            src={props.image}
            alt={props.imageAlt}
            fill
            sizes="(min-width: 1024px) 260px, (min-width: 640px) 45vw, 90vw"
            className="object-cover object-center"
          />
        </div>

        <div className="px-1 pb-1 pt-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-slate-950">{props.title}</h3>
            <span className="text-sm font-semibold text-sky-700 group-open:hidden">+</span>
            <span className="hidden text-sm font-semibold text-sky-700 group-open:inline">−</span>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-700">{props.text}</p>
        </div>
      </summary>

      <div className="grid gap-2 px-1 pb-1 pt-3">
        <ul className="grid gap-2 pb-2">
          {props.points.map((point) => (
            <li key={point} className="flex gap-2 text-sm leading-5 text-slate-700">
              <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-sky-500" />
              <span>{point}</span>
            </li>
          ))}
        </ul>

        <Link
          href={learnHref}
          className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-50"
        >
          {props.learnLabel}
        </Link>
        <Link
          href={startHref}
          className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
        >
          {props.startLabel}
        </Link>
      </div>
    </details>
  );
}

function AiSupportSection(props: { t: TFn; locale: string }) {
  return (
    <section id="ai-support" className="relative overflow-hidden bg-white scroll-mt-24">
      <div className="absolute inset-0 bg-gradient-to-br from-sky-600 via-sky-400 to-sky-600" />

      <div className="relative mx-auto max-w-6xl px-6 py-12 md:py-20">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-[0.95fr_1.05fr] md:items-center md:gap-10">

          {/* TEXT TOP */}
          <div className="order-1 md:order-2 md:col-start-2 md:row-start-1">
            <p className="inline-flex rounded-full bg-indigo-100 px-4 py-2 text-sm font-semibold text-indigo-800">
              {props.t("aiSupport.eyebrow")}
            </p>

            <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight text-slate-100 md:mt-5 md:text-6xl">
              {props.t("aiSupport.title")}
            </h2>

            <p className="mt-4 max-w-xl text-base text-slate-200 md:mt-5 md:text-xl">
              {props.t("aiSupport.description")}
            </p>
          </div>

          {/* IMAGE */}
          <div className="order-2 md:order-1 rounded-[2rem] border border-white bg-white/80 p-2 shadow-xl shadow-sky-900/10 backdrop-blur md:col-start-1 md:row-span-2 md:row-start-1">
            <div className="relative aspect-[4/5] overflow-hidden rounded-[1.5rem] bg-slate-100">
              <Image
                src="/landing/Teacher laptop.png"
                alt={props.t("aiSupport.imageAlt")}
                fill
                className="object-cover object-center"
              />

              <FloatingLabel
                position="top-left"
                title={props.t("aiSupport.floatingTopTitle")}
                text={props.t("aiSupport.floatingTopText")}
              />

              <FloatingLabel
                position="bottom-right"
                title={props.t("aiSupport.floatingBottomTitle")}
                text={props.t("aiSupport.floatingBottomText")}
              />
            </div>
          </div>

          {/* TEXT BOTTOM */}
          <div className="order-3 md:col-start-2 md:row-start-2">
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 md:mt-0 md:gap-3">
              <LightCard small title={props.t("aiSupport.cards.develop.title")} text={props.t("aiSupport.cards.develop.text")} />
              <LightCard small title={props.t("aiSupport.cards.support.title")} text={props.t("aiSupport.cards.support.text")} />
              <LightCard small title={props.t("aiSupport.cards.feedback.title")} text={props.t("aiSupport.cards.feedback.text")} />
              <LightCard small title={props.t("aiSupport.cards.control.title")} text={props.t("aiSupport.cards.control.text")} />
            </div>

            <SectionButtons
              locale={props.locale}
              primaryHref="/login"
              primaryLabel={props.t("aiSupport.ctaPrimary")}
              secondaryHref="/321lessons"
              secondaryLabel={props.t("aiSupport.ctaSecondary")}
              variant="light"
            />
          </div>

        </div>
      </div>
    </section>
  );
}

function PrintOrDigitalSection(props: { t: TFn; locale: string }) {
  return (
    <section className="relative overflow-hidden bg-slate-950 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.35),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.28),_transparent_35%)]" />

      <div className="relative mx-auto max-w-6xl px-6 py-12 md:py-20">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-[0.95fr_1.05fr] md:items-center md:gap-10">
          {/* TEXT TOP */}
          <div className="order-1 md:col-start-2 md:row-start-1">
            <p className="inline-flex rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/15">
              {props.t("printDigital.eyebrow")}
            </p>

            <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight md:mt-5 md:text-6xl">
              {props.t("printDigital.title")}
            </h2>

            <p className="mt-4 max-w-xl text-base text-white/75 md:mt-5 md:text-xl">
              {props.t("printDigital.description")}
            </p>
          </div>

          {/* IMAGE */}
          <div className="order-2 rounded-[2rem] border border-white/10 bg-white/10 p-2 shadow-2xl shadow-black/20 backdrop-blur md:col-start-1 md:row-span-2 md:row-start-1 md:p-3">
            <div className="relative aspect-[4/5] overflow-hidden rounded-[1.5rem] bg-slate-900">
              <Image
                src="/landing/digital-print.png"
                alt={props.t("printDigital.imageAlt")}
                fill
                className="object-cover object-center"
              />

              <FloatingLabel
                position="top-left"
                title={props.t("printDigital.floatingDigitalTitle")}
                text={props.t("printDigital.floatingDigitalText")}
              />

              <FloatingLabel
                position="bottom-right"
                title={props.t("printDigital.floatingPdfTitle")}
                text={props.t("printDigital.floatingPdfText")}
              />
            </div>
          </div>

          {/* TEXT BOTTOM */}
          <div className="order-3 md:col-start-2 md:row-start-2">
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 md:mt-0 md:gap-3">
              <DarkCard
                title={props.t("printDigital.cards.digital.title")}
                text={props.t("printDigital.cards.digital.text")}
              />
              <DarkCard
                title={props.t("printDigital.cards.pdf.title")}
                text={props.t("printDigital.cards.pdf.text")}
              />
            </div>

            <SectionButtons
              locale={props.locale}
              primaryHref="/login"
              primaryLabel={props.t("printDigital.ctaPrimary")}
              secondaryHref="/321lessons"
              secondaryLabel={props.t("printDigital.ctaSecondary")}
              variant="dark"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function QuizLiveSection(props: { t: TFn; locale: string }) {
  const points = [0, 1, 2, 3].map((index) => props.t(`quizLive.points.${index}`));

  return (
    <section className="relative overflow-hidden bg-white text-slate-950">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.16),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.18),_transparent_38%)]" />

      <div className="relative mx-auto max-w-6xl px-6 py-12 md:py-20">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-[0.94fr_1.06fr] md:items-center md:gap-10">
          <div>
            <p className="inline-flex rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-900">
              {props.t("quizLive.eyebrow")}
            </p>

            <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight md:mt-5 md:text-6xl">
              {props.t("quizLive.title")}
            </h2>

            <p className="mt-4 max-w-xl text-base leading-7 text-slate-700 md:mt-5 md:text-xl md:leading-8">
              {props.t("quizLive.description")}
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {points.map((point) => (
                <div key={point} className="rounded-2xl border border-emerald-100 bg-white/85 p-4 text-sm font-semibold leading-6 text-slate-800 shadow-sm shadow-emerald-950/5">
                  {point}
                </div>
              ))}
            </div>

            <SectionButtons
              locale={props.locale}
              primaryHref="/tools/quiz"
              primaryLabel={props.t("quizLive.ctaPrimary")}
              secondaryHref="/321quiz"
              secondaryLabel={props.t("quizLive.ctaSecondary")}
              variant="light"
            />
          </div>

          <div className="rounded-[2rem] border border-white bg-white/80 p-2 shadow-xl shadow-sky-900/10 backdrop-blur md:p-3">
            <div className="relative aspect-[2/3] overflow-hidden rounded-[1.5rem] bg-slate-100">
              <Image
                src="/landing/quiz action.jpeg"
                alt={props.t("quizLive.imageAlt")}
                fill
                className="object-cover object-center"
              />

              <FloatingLabel
                position="top-left"
                title={props.t("quizLive.badges.live")}
                text={props.t("quizLive.badges.board")}
              />

              <FloatingLabel
                position="bottom-right"
                title={props.t("quizLive.badges.students")}
                text={props.t("quizLive.badges.devices")}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function WowSection(props: { t: TFn; locale: string }) {
  const points = [0, 1, 2, 3].map((index) => props.t(`wow.points.${index}`));

  return (
    <section className="relative overflow-hidden bg-sky-50">
      <div className="absolute inset-0 bg-gradient-to-b from-sky-50 via-white to-emerald-50" />

      <div className="relative mx-auto max-w-6xl px-6 py-12 md:py-20">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-[1.05fr_0.95fr] md:items-center md:gap-10">
          {/* TEXT TOP */}
          <div className="order-1 md:col-start-1 md:row-start-1">
            <p className="inline-flex rounded-full bg-sky-100 px-4 py-2 text-sm font-semibold text-sky-800">
              {props.t("wow.eyebrow")}
            </p>

            <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight text-slate-950 md:mt-5 md:text-6xl">
              {props.t("wow.title")}
            </h2>

            <p className="mt-4 max-w-xl text-base text-slate-700 md:mt-5 md:text-xl">
              {props.t("wow.description")}
            </p>
          </div>

          {/* IMAGE */}
          <div className="order-2 rounded-[2rem] border border-white bg-white/80 p-2 shadow-xl shadow-sky-900/10 backdrop-blur md:col-start-2 md:row-span-2 md:row-start-1 md:p-3">
            <div className="relative aspect-[4/5] overflow-hidden rounded-[1.5rem] bg-slate-100">
              <Image
                src="/landing/teacher and students.png"
                alt={props.t("wow.imageAlt")}
                fill
                className="object-cover object-center"
              />

              <div className="absolute inset-x-3 bottom-3 rounded-xl bg-white/90 p-3 shadow-lg backdrop-blur md:inset-x-4 md:bottom-4 md:rounded-2xl md:p-4">
                <p className="text-xs font-semibold text-slate-950 md:text-sm">
                  {props.t("wow.floatingTitle")}
                </p>
                <p className="mt-0.5 text-xs text-slate-700 md:mt-1 md:text-sm">
                  {props.t("wow.floatingText")}
                </p>
              </div>
            </div>
          </div>

          {/* TEXT BOTTOM */}
          <div className="order-3 md:col-start-1 md:row-start-2">
            <div className="grid gap-3 sm:grid-cols-2">
              {points.map((point) => (
                <div key={point} className="rounded-2xl border border-sky-100 bg-white/85 p-4 text-sm font-semibold leading-6 text-slate-800 shadow-sm shadow-sky-950/5">
                  {point}
                </div>
              ))}
            </div>

            <SectionButtons
              locale={props.locale}
              primaryHref="/login"
              primaryLabel={props.t("wow.ctaPrimary")}
              secondaryHref="/tools"
              secondaryLabel={props.t("wow.ctaSecondary")}
              variant="light"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function TeacherPowerSection(props: { t: TFn; locale: string }) {
  return (
    <section id="for-teachers" className="relative overflow-hidden bg-sky-50 text-slate-950 scroll-mt-24">
      <div className="absolute inset-0 bg-gradient-to-br from-sky-600 via-sky-400 to-sky-600" />

      <div className="relative mx-auto max-w-6xl px-6 py-12 md:py-20">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-[1.05fr_0.95fr] md:items-center md:gap-10">
          {/* TEXT TOP */}
          <div className="order-1 md:col-start-1 md:row-start-1">
            <p className="inline-flex rounded-full bg-sky-200 px-4 py-2 text-sm font-semibold text-slate-950 ring-1 ring-white/50">
              {props.t("teacherPower.eyebrow")}
            </p>

            <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight md:mt-5 md:text-6xl">
              {props.t("teacherPower.title")}
            </h2>

            <p className="mt-4 max-w-xl text-base text-slate-700 md:mt-5 md:text-xl">
              {props.t("teacherPower.description")}
            </p>
          </div>

          {/* IMAGE */}
          <div className="order-2 rounded-[2rem] border border-white/10 bg-white/10 p-2 shadow-2xl shadow-black/20 backdrop-blur md:col-start-2 md:row-span-2 md:row-start-1 md:p-3">
            <div className="relative aspect-[4/5] overflow-hidden rounded-[1.5rem] bg-slate-900">
              <Image
                src="/landing/teacher_planning_smiling.png"
                alt={props.t("teacherPower.imageAlt")}
                fill
                className="object-cover object-center"
              />

              <FloatingLabel
                position="top-left"
                title={props.t("teacherPower.floatingTopTitle")}
                text={props.t("teacherPower.floatingTopText")}
              />

              <FloatingLabel
                position="bottom-right"
                title={props.t("teacherPower.floatingBottomTitle")}
                text={props.t("teacherPower.floatingBottomText")}
              />
            </div>
          </div>

          {/* TEXT BOTTOM */}
          <div className="order-3 md:col-start-1 md:row-start-2">
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 md:mt-0 md:gap-3">
              <LightCard
                small
                transparent
                title={props.t("teacherPower.cards.create.title")}
                text={props.t("teacherPower.cards.create.text")}
              />
              <LightCard
                small
                transparent
                title={props.t("teacherPower.cards.share.title")}
                text={props.t("teacherPower.cards.share.text")}
              />
              <LightCard
                small
                transparent
                title={props.t("teacherPower.cards.overview.title")}
                text={props.t("teacherPower.cards.overview.text")}
              />
              <LightCard
                small
                transparent
                title={props.t("teacherPower.cards.ai.title")}
                text={props.t("teacherPower.cards.ai.text")}
              />
            </div>

            <SectionButtons
              locale={props.locale}
              primaryHref="/login"
              primaryLabel={props.t("teacherPower.ctaPrimary")}
              secondaryHref="/321lessons"
              secondaryLabel={props.t("teacherPower.ctaSecondary")}
              variant="dark"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function LanguageLearningSection(props: { t: TFn; locale: string }) {
  return (
    <section className="relative overflow-hidden bg-white">
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-white to-sky-50" />

      <div className="relative mx-auto max-w-6xl px-6 py-12 md:py-20">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-[1.05fr_0.95fr] md:items-center md:gap-10">

          {/* TEXT TOP */}
          <div className="order-1 md:col-start-1 md:row-start-1">
            <p className="inline-flex rounded-full bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-800">
              {props.t("languageLearning.eyebrow")}
            </p>

            <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight text-slate-950 md:mt-5 md:text-6xl">
              {props.t("languageLearning.title")}
            </h2>

            <p className="mt-4 max-w-xl text-base text-slate-700 md:mt-5 md:text-xl">
              {props.t("languageLearning.description")}
            </p>
          </div>

          {/* IMAGE (kommer opp på mobil) */}
          <div className="order-2 rounded-[2rem] border border-white bg-white/80 p-2 shadow-xl shadow-emerald-900/10 backdrop-blur md:col-start-2 md:row-span-2 md:row-start-1 md:p-3">
            <div className="relative aspect-[4/5] overflow-hidden rounded-[1.5rem] bg-slate-100">
              <Image
                src="/landing/language-learning.png"
                alt={props.t("languageLearning.imageAlt")}
                fill
                className="object-cover object-center"
              />

              <FloatingLabel
                position="top-left"
                title={props.t("languageLearning.floatingLevelTitle")}
                text={props.t("languageLearning.floatingLevelText")}
              />

              <FloatingLabel
                position="bottom-right"
                title={props.t("languageLearning.floatingFeedbackTitle")}
                text={props.t("languageLearning.floatingFeedbackText")}
              />
            </div>
          </div>

          {/* TEXT BOTTOM */}
          <div className="order-3 md:col-start-1 md:row-start-2">
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 md:mt-0 md:gap-3">
              <LightCard
                small
                title={props.t("languageLearning.cards.level.title")}
                text={props.t("languageLearning.cards.level.text")}
              />
              <LightCard
                small
                title={props.t("languageLearning.cards.motherTongue.title")}
                text={props.t("languageLearning.cards.motherTongue.text")}
              />
              <LightCard
                small
                title={props.t("languageLearning.cards.audio.title")}
                text={props.t("languageLearning.cards.audio.text")}
              />
              <LightCard
                small
                title={props.t("languageLearning.cards.feedback.title")}
                text={props.t("languageLearning.cards.feedback.text")}
              />
            </div>

            <SectionButtons
              locale={props.locale}
              primaryHref="/321lessons"
              primaryLabel={props.t("languageLearning.ctaPrimary")}
              secondaryHref="/login"
              secondaryLabel={props.t("languageLearning.ctaSecondary")}
              variant="light"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function SpacesSection(props: { t: TFn; locale: string }) {
  return (
    <section className="relative overflow-hidden bg-slate-950 text-white">
      <div className="absolute inset-0 bg-gradient-to-br from-sky-600 via-sky-400 to-sky-600" />

      <div className="relative mx-auto max-w-6xl px-6 py-12 md:py-20">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-[1.05fr_0.95fr] md:items-center md:gap-10">
          {/* TEXT TOP */}
          <div className="order-1 md:col-start-1 md:row-start-1">
            <p className="inline-flex rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/15">
              {props.t("spacesNew.eyebrow")}
            </p>

            <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight md:mt-5 md:text-6xl">
              {props.t("spacesNew.title")}
            </h2>

            <p className="mt-4 max-w-xl text-base text-white/75 md:mt-5 md:text-xl">
              {props.t("spacesNew.description")}
            </p>
          </div>

          {/* IMAGE */}
          <div className="order-2 rounded-[2rem] border border-white/10 bg-white/10 p-2 shadow-2xl shadow-black/20 backdrop-blur md:col-start-2 md:row-span-2 md:row-start-1 md:p-3">
            <div className="relative aspect-[4/5] overflow-hidden rounded-[1.5rem] bg-slate-900">
              <Image
                src="/landing/spaces-new.png"
                alt={props.t("spacesNew.imageAlt")}
                fill
                className="object-cover object-center"
              />

              <FloatingLabel
                position="top-left"
                title={props.t("spacesNew.floatingTopTitle")}
                text={props.t("spacesNew.floatingTopText")}
              />

              <FloatingLabel
                position="bottom-right"
                title={props.t("spacesNew.floatingBottomTitle")}
                text={props.t("spacesNew.floatingBottomText")}
              />
            </div>
          </div>

          {/* TEXT BOTTOM */}
          <div className="order-3 md:col-start-1 md:row-start-2">
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 md:mt-0">
              <SpacesFeature index="01" text={props.t("spacesNew.checks.0")} />
              <SpacesFeature index="02" text={props.t("spacesNew.checks.1")} />
              <SpacesFeature index="03" text={props.t("spacesNew.checks.2")} />
              <SpacesFeature index="04" text={props.t("spacesNew.checks.3")} />
            </div>

            <SectionButtons
              locale={props.locale}
              primaryHref="/login"
              primaryLabel={props.t("spacesNew.ctaPrimary")}
              secondaryHref="/321lessons"
              secondaryLabel={props.t("spacesNew.ctaSecondary")}
              variant="dark"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function TopLibrarySection(props: {
  locale: string;
  t: TFn;
  featured: FeaturedLesson[];
  firstRow: FeaturedLesson[];
  secondRow: FeaturedLesson[];
  lessonCountLabel: string;
}) {
  return (
    <section className="w-full overflow-hidden bg-gradient-to-b from-sky-950 via-sky-800 to-sky-700 text-white">
      <div className="w-full py-8 md:py-10">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <h2 className="mt-2 text-3xl font-semibold tracking-tight md:text-5xl">
            {props.t("topStrip.title")}
          </h2>

          <p className="mt-3 text-lg text-white/75 md:text-xl">
            {props.t("topStrip.description")}
          </p>
        </div>

        <div className="mx-auto mt-8 w-[90vw] max-w-[1800px] space-y-5 overflow-hidden py-2">
          <MarqueeRow
            items={props.firstRow.length ? props.firstRow : props.featured}
            locale={props.locale}
            reverse={false}
          />
          <MarqueeRow
            items={props.secondRow.length ? props.secondRow : props.featured}
            locale={props.locale}
            reverse
          />
        </div>

        <div className="mt-6 px-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            {props.t("topStrip.badge", { count: props.lessonCountLabel })}
          </div>
        </div>
      </div>
    </section>
  );
}

function ParentHomeSection(props: { t: TFn; locale: string }) {
  return (
    <section id="for-parents" className="relative overflow-hidden bg-white scroll-mt-24">
      <div className="absolute inset-0 bg-gradient-to-br from-amber-50 via-white to-sky-50" />

      <div className="relative mx-auto max-w-6xl px-6 py-12 md:py-20">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-[0.95fr_1.05fr] md:items-center md:gap-10">
          {/* TEXT TOP */}
          <div className="order-1 md:col-start-2 md:row-start-1">
            <p className="inline-flex rounded-full bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-800">
              {props.t("parentHome.eyebrow")}
            </p>

            <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight text-slate-950 md:mt-5 md:text-6xl">
              {props.t("parentHome.title")}
            </h2>

            <p className="mt-4 max-w-xl text-base text-slate-700 md:mt-5 md:text-xl">
              {props.t("parentHome.description")}
            </p>
          </div>

          {/* IMAGE */}
          <div className="order-2 rounded-[2rem] border border-white bg-white/80 p-2 shadow-xl shadow-amber-900/10 backdrop-blur md:col-start-1 md:row-span-2 md:row-start-1 md:p-3">
            <div className="relative aspect-[4/5] overflow-hidden rounded-[1.5rem] bg-slate-100">
              <Image
                src="/landing/family_helping.png"
                alt={props.t("parentHome.imageAlt")}
                fill
                className="object-cover object-center"
              />

              <FloatingLabel
                position="top-left"
                title={props.t("parentHome.floatingTopTitle")}
                text={props.t("parentHome.floatingTopText")}
              />

              <FloatingLabel
                position="bottom-right"
                title={props.t("parentHome.floatingBottomTitle")}
                text={props.t("parentHome.floatingBottomText")}
              />
            </div>
          </div>

          {/* TEXT BOTTOM */}
          <div className="order-3 md:col-start-2 md:row-start-2">
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 md:mt-0 md:gap-3">
              <LightCard
                small
                title={props.t("parentHome.cards.platform.title")}
                text={props.t("parentHome.cards.platform.text")}
              />
              <LightCard
                small
                title={props.t("parentHome.cards.share.title")}
                text={props.t("parentHome.cards.share.text")}
              />
              <LightCard
                small
                title={props.t("parentHome.cards.ai.title")}
                text={props.t("parentHome.cards.ai.text")}
              />
              <LightCard
                small
                title={props.t("parentHome.cards.warm.title")}
                text={props.t("parentHome.cards.warm.text")}
              />
            </div>

            <SectionButtons
              locale={props.locale}
              primaryHref="/login"
              primaryLabel={props.t("parentHome.ctaPrimary")}
              secondaryHref="/321lessons"
              secondaryLabel={props.t("parentHome.ctaSecondary")}
              variant="light"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function StudentFlowSection(props: { t: TFn; locale: string }) {
  return (
    <section id="for-students" className="relative overflow-hidden bg-slate-950 text-white scroll-mt-24">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.35),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.28),_transparent_35%)]" />

      <div className="relative mx-auto max-w-6xl px-6 py-12 md:py-20">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-[1.05fr_0.95fr] md:items-center md:gap-10">

          {/* TEXT TOP */}
          <div className="order-1 md:col-start-1 md:row-start-1">
            <p className="inline-flex rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/15">
              {props.t("studentFlow.eyebrow")}
            </p>

            <h2 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight md:mt-5 md:text-6xl">
              {props.t("studentFlow.title")}
            </h2>

            <p className="mt-4 max-w-xl text-base text-white/75 md:mt-5 md:text-xl">
              {props.t("studentFlow.description")}
            </p>
          </div>

          {/* IMAGE (opp på mobil) */}
          <div className="order-2 rounded-[2rem] border border-white/10 bg-white/10 p-2 shadow-2xl shadow-black/20 backdrop-blur md:col-start-2 md:row-span-2 md:row-start-1 md:p-3">
            <div className="relative aspect-[4/5] overflow-hidden rounded-[1.5rem] bg-slate-900">
              <Image
                src="/landing/student_study.png"
                alt={props.t("studentFlow.imageAlt")}
                fill
                className="object-cover object-center"
              />

              <FloatingLabel
                position="top-left"
                title={props.t("studentFlow.floatingTopTitle")}
                text={props.t("studentFlow.floatingTopText")}
              />

              <FloatingLabel
                position="bottom-right"
                title={props.t("studentFlow.floatingBottomTitle")}
                text={props.t("studentFlow.floatingBottomText")}
              />
            </div>
          </div>

          {/* TEXT BOTTOM */}
          <div className="order-3 md:col-start-1 md:row-start-2">
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 md:mt-0 md:gap-3">
              <DarkCard
                title={props.t("studentFlow.cards.create.title")}
                text={props.t("studentFlow.cards.create.text")}
              />
              <DarkCard
                title={props.t("studentFlow.cards.language.title")}
                text={props.t("studentFlow.cards.language.text")}
              />
              <DarkCard
                title={props.t("studentFlow.cards.correction.title")}
                text={props.t("studentFlow.cards.correction.text")}
              />
              <DarkCard
                title={props.t("studentFlow.cards.feedback.title")}
                text={props.t("studentFlow.cards.feedback.text")}
              />
            </div>

            <SectionButtons
              locale={props.locale}
              primaryHref="/321lessons"
              primaryLabel={props.t("studentFlow.ctaPrimary")}
              secondaryHref="/login"
              secondaryLabel={props.t("studentFlow.ctaSecondary")}
              variant="dark"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function FinalCtaSection(props: { t: TFn; locale: string }) {
  return (
    <section className="bg-slate-900 text-white">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:items-center">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              {props.t("ctaLite.title")}
            </h2>
            <p className="mt-4 text-lg text-white/80">{props.t("ctaLite.lead")}</p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href={localizedPath(props.locale, "/login")}
                className="inline-flex items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-white/90"
              >
                {props.t("ctaLite.primary")}
              </Link>

              <Link
                href={localizedPath(props.locale, "/pricing")}
                className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-transparent px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
              >
                {props.t("ctaLite.secondary")}
              </Link>
            </div>

            <p className="mt-4 text-sm text-white/70">{props.t("ctaLite.note")}</p>
          </div>

          <div className="rounded-2xl bg-white/10 p-6">
            <p className="text-sm font-semibold">{props.t("ctaLite.boxTitle")}</p>
            <div className="mt-4 grid grid-cols-1 gap-3 text-sm text-white/85">
              <CheckRow dark text={props.t("ctaLite.checks.0")} />
              <CheckRow dark text={props.t("ctaLite.checks.1")} />
              <CheckRow dark text={props.t("ctaLite.checks.2")} />
              <CheckRow dark text={props.t("ctaLite.checks.3")} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FooterSection(props: { t: TFn; locale: string; currentYear: number }) {
  return (
    <footer className="bg-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold">{brand.name}</p>
            <p className="mt-1 text-sm text-slate-600">{props.t("footer.tagline")}</p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link
              className="text-slate-700 hover:text-slate-900"
              href={localizedPath(props.locale, "/about")}
            >
              {props.t("footer.about")}
            </Link>
            <Link
              className="text-slate-700 hover:text-slate-900"
              href={localizedPath(props.locale, "/privacy")}
            >
              {props.t("footer.privacy")}
            </Link>
            <Link
              className="text-slate-700 hover:text-slate-900"
              href={localizedPath(props.locale, "/terms")}
            >
              {props.t("footer.terms")}
            </Link>
            <Link
              className="text-slate-700 hover:text-slate-900"
              href={localizedPath(props.locale, "/sales-terms")}
            >
              {props.t("footer.salesTerms")}
            </Link>
            <Link
              className="text-slate-700 hover:text-slate-900"
              href={localizedPath(props.locale, "/contact")}
            >
              {props.t("footer.contact")}
            </Link>
          </div>
        </div>
        <p className="mt-6 text-xs text-slate-500">
          © {props.currentYear} {brand.name}. {props.t("footer.rights")}
        </p>
      </div>
    </footer>
  );
}

function MarqueeRow(props: {
  items: FeaturedLesson[];
  locale: string;
  reverse?: boolean;
}) {
  const duplicated = [...props.items, ...props.items];

  return (
    <div className="marquee-wrap overflow-hidden">
      <div className={`marquee-track ${props.reverse ? "marquee-right" : "marquee-left"}`}>
        {duplicated.map((item, index) => (
          <LibraryCard key={`${item.id}-${index}`} item={item} locale={props.locale} />
        ))}
      </div>
    </div>
  );
}

function LibraryCard(props: { item: FeaturedLesson; locale: string }) {
  const { item, locale } = props;
  const lessonLocale =
    item.language === "nb" || item.language === "en" || item.language === "pt"
      ? item.language
      : locale;

  return (
    <Link
      href={`/${lessonLocale}/student/lesson/${item.id}`}
      className="library-card"
    >
      <div className="library-card-inner">
        {item.image ? (
          <Image
            src={item.image}
            alt={item.title}
            fill
            sizes="(min-width: 768px) 154px, 96px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-sky-200 to-emerald-200 text-xs font-semibold text-slate-700">
            321
          </div>
        )}

        <div className="library-card-overlay" />

        <div className="library-card-content">
          <p className="library-card-title">{item.title}</p>
          <p className="library-card-type">
            {item.textType?.replaceAll("_", " ") || "lesson"}
          </p>
        </div>
      </div>
    </Link>
  );
}

function SectionButtons(props: {
  locale: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref: string;
  secondaryLabel: string;
  variant: "light" | "dark";
}) {
  const primaryClass =
    props.variant === "dark"
      ? "bg-white text-slate-950 hover:bg-white/90"
      : "bg-slate-950 text-white hover:bg-slate-800";

  const secondaryClass =
    props.variant === "dark"
      ? "border-white/15 bg-white/10 text-white hover:bg-white/15"
      : "border-slate-200 bg-white text-slate-900 hover:bg-slate-50";

  return (
    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
      <Link
        href={localizedPath(props.locale, props.primaryHref)}
        className={`inline-flex items-center justify-center rounded-xl px-6 py-3 text-sm font-semibold shadow-sm ${primaryClass}`}
      >
        {props.primaryLabel}
      </Link>

      <Link
        href={localizedPath(props.locale, props.secondaryHref)}
        className={`inline-flex items-center justify-center rounded-xl border px-6 py-3 text-sm font-semibold shadow-sm ${secondaryClass}`}
      >
        {props.secondaryLabel}
      </Link>
    </div>
  );
}

function LightCard(props: {
  title: string;
  text: string;
  small?: boolean;
  transparent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl shadow-sm ${props.transparent
        ? "border border-white/10 bg-white/10 md:border-slate-200 md:bg-white"
        : "border border-slate-200 bg-white"
        } ${props.small ? "p-4" : "p-5"}`}
    >
      <p
        className={`text-sm font-semibold ${props.transparent
          ? "text-white md:text-slate-950"
          : "text-slate-950"
          }`}
      >
        {props.title}
      </p>

      <p
        className={`mt-1 ${props.small ? "text-sm leading-5" : "text-sm leading-6"
          } ${props.transparent
            ? "text-white/80 md:text-slate-700"
            : "text-slate-700"
          }`}
      >
        {props.text}
      </p>
    </div>
  );
}

function DarkCard(props: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-5">
      <p className="text-sm font-semibold text-white">{props.title}</p>
      <p className="mt-2 text-sm leading-6 text-white/70">{props.text}</p>
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
      className={`absolute ${positionClasses} rounded-xl bg-white/70 md:bg-white/90 backdrop-blur px-2 py-1.5 md:px-4 md:py-3 shadow-md`}
    >
      <p className="text-[10px] md:text-xs font-semibold uppercase tracking-wide text-slate-500">
        {props.title}
      </p>
      <p className="mt-0.5 text-xs md:text-sm font-semibold text-slate-900">
        {props.text}
      </p>
    </div>
  );
}

function SpacesFeature(props: { index: string; text: string }) {
  return (
    <div className="group flex min-h-[76px] items-start gap-3 rounded-2xl border border-white/15 bg-white/10 p-4 text-white shadow-sm shadow-sky-950/10 backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/15">
      <span className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-white text-sm font-semibold text-sky-700 shadow-sm">
        {props.index}
      </span>
      <span className="pt-1 text-sm font-semibold leading-snug text-white/90">
        {props.text}
      </span>
    </div>
  );
}

function CheckRow(props: { text: string; dark?: boolean }) {
  return (
    <div className={`flex gap-3 ${props.dark ? "text-white/85" : "text-slate-700"}`}>
      <span
        className={`mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full ${props.dark ? "bg-white/15 text-white" : "bg-emerald-100 text-emerald-700"
          }`}
      >
        ✓
      </span>
      <span className="text-sm">{props.text}</span>
    </div>
  );
}
