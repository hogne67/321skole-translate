// app/page.tsx
import Link from "next/link";
import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { getAdmin } from "@/lib/firebaseAdmin";

const brand = {
  name: "321skole",
  tagline: "AI-støttet språklæring – bygget for lærere, elsket av studenter",
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

type LibraryStripCopy = {
  eyebrow: string;
  title: string;
  description: string;
  cta: string;
};

function getLibraryStripCopy(locale: string): LibraryStripCopy {
  if (locale === "en") {
    return {
      eyebrow: "From the library",
      title: "Ready-made lessons you can use right away",
      description:
        "Use ready-made lessons and activities, or create your own in seconds with AI.",
      cta: "Explore lessons and create your own",
    };
  }

  if (locale === "pt") {
    return {
      eyebrow: "Da biblioteca",
      title: "Aulas prontas para usar imediatamente",
      description: "Use materiais prontos ou crie os seus em segundos com IA.",
      cta: "Explorar materiais e criar os seus",
    };
  }

  return {
    eyebrow: "Fra biblioteket",
    title: "Ferdige opplegg du kan bruke med én gang",
    description:
      "Bruk ferdige undervisningsopplegg og oppgaver, eller lag dine egne på sekunder med AI.",
    cta: "Utforsk opplegg og lag egne",
  };
}

function localizedPath(locale: string, path: string) {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${clean}`;
}

function pickLocalizedText(value: unknown, locale: string): string {
  if (!value) return "";

  if (typeof value === "string") return value.trim();

  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;

    const direct =
      obj[locale] ?? obj.nb ?? obj.en ?? obj.pt ?? obj.no ?? obj.title;

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

async function getFeaturedLessons(locale: string): Promise<FeaturedLesson[]> {
  try {
    const { db } = getAdmin();

    const snap = await db
      .collection("published_lessons")
      .orderBy("createdAt", "desc")
      .limit(30)
      .get();

    const items: FeaturedLesson[] = [];

    for (const doc of snap.docs) {
      const data = doc.data() as Record<string, unknown>;

      const visibility = String(data.visibility ?? "");
      const type = String(data.type ?? data.textType ?? "");
      const archived = Boolean(data.archived);

      if (visibility === "private" || type === "reading_test" || archived) {
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

    if (items.length > 0) return items;

    return getFallbackLessons();
  } catch {
    return getFallbackLessons();
  }
}

function getFallbackLessons(): FeaturedLesson[] {
  return [
    {
      id: "1",
      title: "Lag en fortelling om Edvard Munch",
      level: "A2",
      language: "nb",
      textType: "fortelling",
      image: "/landing/teacher.png",
    },
    {
      id: "2",
      title: "Read and write about jobs",
      level: "A1",
      language: "en",
      textType: "lesson",
      image: "/landing/studentstudy.jpg",
    },
    {
      id: "3",
      title: "Diskriminering forklart enkelt",
      level: "B1",
      language: "nb",
      textType: "article",
      image: "/landing/parents_study.jpg",
    },
    {
      id: "4",
      title: "Cinema vocabulary and linking words",
      level: "A2",
      language: "en",
      textType: "lesson",
      image: "/landing/studentstudy.jpg",
    },
    {
      id: "5",
      title: "Carta formal de reclamação",
      level: "A2",
      language: "pt",
      textType: "writing",
      image: "/landing/teacher.png",
    },
    {
      id: "6",
      title: "Norsk grammatikk med enkle oppgaver",
      level: "A1",
      language: "nb",
      textType: "grammar",
      image: "/landing/parents_study.jpg",
    },
    {
      id: "7",
      title: "English reading practice",
      level: "A1",
      language: "en",
      textType: "reading",
      image: "/landing/studentstudy.jpg",
    },
    {
      id: "8",
      title: "Beskriv et bilde på norsk",
      level: "A1",
      language: "nb",
      textType: "writing",
      image: "/landing/teacher.png",
    },
    {
      id: "9",
      title: "Vocabulário sobre escola",
      level: "A1",
      language: "pt",
      textType: "vocabulary",
      image: "/landing/parents_study.jpg",
    },
    {
      id: "10",
      title: "Historie: korte fakta og spørsmål",
      level: "B1",
      language: "nb",
      textType: "history",
      image: "/landing/teacher.png",
    },
    {
      id: "11",
      title: "Write about a film you like",
      level: "A2",
      language: "en",
      textType: "writing",
      image: "/landing/studentstudy.jpg",
    },
    {
      id: "12",
      title: "Les og svar på spørsmål",
      level: "A2",
      language: "nb",
      textType: "reading",
      image: "/landing/parents_study.jpg",
    },
  ];
}

export default async function HomePage() {
  const locale = (await getLocale()) as string;
  const t = await getTranslations("landing");
  const tr = await getTranslations();

  const libraryCopy = getLibraryStripCopy(locale);
  const featured = await getFeaturedLessons(locale);

  const midpoint = Math.ceil(featured.length / 2);
  const firstRow = featured.slice(0, midpoint);
  const secondRow = featured.slice(midpoint);

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <PublicHeader
        locale={locale}
        schoolLabel={tr("brandLogo.school")}
        loginLabel={t("common.login")}
      />

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-sky-200/50 blur-3xl" />
          <div className="absolute -bottom-40 -right-40 h-[520px] w-[520px] rounded-full bg-emerald-200/50 blur-3xl" />
        </div>

        <div className="mx-auto max-w-6xl px-6 py-12 md:py-16">
          <div className="flex justify-center">
            <p className="inline-flex w-fit items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {t("hero.badge")}
            </p>
          </div>

          <h1 className="mx-auto mt-5 max-w-4xl text-center text-4xl font-semibold tracking-tight md:text-6xl">
            {t("hero.title")}
          </h1>

          <p className="mx-auto mt-4 max-w-3xl text-center text-lg text-slate-700 md:text-xl">
            {t("hero.lead")}
          </p>

          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={localizedPath(locale, "/login")}
              className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
            >
              {t("hero.ctaPrimary")}
            </Link>

            <Link
              href={localizedPath(locale, "/login")}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
            >
              {t("hero.ctaSecondary")}
            </Link>
          </div>

          <div className="mt-10 rounded-3xl border border-slate-200 bg-white/85 p-3 shadow-sm backdrop-blur">
            <div className="relative aspect-[21/9] w-full overflow-hidden rounded-2xl bg-slate-100">
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

      <section className="border-y border-slate-100 bg-slate-50/70">
        <div className="mx-auto max-w-7xl px-0 py-10 md:py-12">
          <div className="mx-auto max-w-4xl px-6 text-center">
            <p className="text-sm font-semibold text-sky-700">{libraryCopy.eyebrow}</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
              {libraryCopy.title}
            </h2>
            <p className="mt-4 text-lg text-slate-700">{libraryCopy.description}</p>
          </div>

          <div className="mt-8 space-y-4 overflow-hidden">
            <MarqueeRow items={firstRow.length ? firstRow : featured} locale={locale} reverse={false} />
            <MarqueeRow items={secondRow.length ? secondRow : featured} locale={locale} reverse />
          </div>

          <div className="mt-8 px-6 text-center">
            <Link
              href={localizedPath(locale, "/321lessons")}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
            >
              {libraryCopy.cta}
            </Link>
          </div>
        </div>
      </section>

      <section className="border-b border-slate-100 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <p className="text-center text-sm text-slate-600">{t("trustLine")}</p>
        </div>
      </section>

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
        cta={{ href: localizedPath(locale, "/login"), label: t("teachers.cta") }}
        flip={false}
      />

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
        cta={{ href: localizedPath(locale, "/login"), label: t("students.cta") }}
        flip={true}
      />

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
        cta={{ href: localizedPath(locale, "/login"), label: t("parents.cta") }}
        flip={false}
      />

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
                  href={localizedPath(locale, "/login")}
                  className="inline-flex items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-white/90"
                >
                  {t("ctaLite.primary")}
                </Link>

                <Link
                  href={localizedPath(locale, "/pricing")}
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

      <footer className="bg-white">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold">{brand.name}</p>
              <p className="mt-1 text-sm text-slate-600">{brand.tagline}</p>
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              <Link className="text-slate-700 hover:text-slate-900" href={localizedPath(locale, "/about")}>
                {t("footer.about")}
              </Link>
              <Link className="text-slate-700 hover:text-slate-900" href={localizedPath(locale, "/privacy")}>
                {t("footer.privacy")}
              </Link>
              <Link className="text-slate-700 hover:text-slate-900" href={localizedPath(locale, "/contact")}>
                {t("footer.contact")}
              </Link>
            </div>
          </div>
          <p className="mt-6 text-xs text-slate-500">
            © {new Date().getFullYear()} {brand.name}. {t("footer.rights")}
          </p>
        </div>
      </footer>

      <style>{`
        @keyframes marqueeLeft {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }

        @keyframes marqueeRight {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }

        .marquee-track {
  width: max-content;
  display: flex;
  gap: 10px;
  will-change: transform;
}

        .marquee-left {
          animation: marqueeLeft 78s linear infinite;
        }

        .marquee-right {
          animation: marqueeRight 88s linear infinite;
        }

        .marquee-wrap:hover .marquee-left,
        .marquee-wrap:hover .marquee-right {
          animation-play-state: paused;
        }
      `}</style>
    </main>
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
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href={localizedPath(props.locale, "/")} className="flex items-center gap-3">
          <Image
            src="/logo321ny.png"
            alt="321"
            width={42}
            height={42}
            priority
            className="h-10 w-auto object-contain"
          />
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-extrabold text-slate-900">321</span>
            <span className="text-2xl font-semibold text-sky-400">
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
                  className={`block px-3 py-2 text-xs hover:bg-slate-50 ${
                    l.code === localeNow
                      ? "font-semibold text-slate-900"
                      : "text-slate-700"
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
          <LibraryCard
            key={`${item.id}-${index}`}
            item={item}
            href={localizedPath(props.locale, "/321lessons")}
          />
        ))}
      </div>
    </div>
  );
}

function LibraryCard(props: { item: FeaturedLesson; href: string }) {
  const { item, href } = props;

  return (
    <Link
      href={href}
      className="block min-w-[240px] max-w-[240px] no-underline overflow-hidden rounded-xl border border-slate-200/80 bg-sky-50 shadow-sm transition duration-200 hover:-translate-y-1 hover:bg-white hover:shadow-md"
    >
      <div className="relative h-28 w-full overflow-hidden bg-slate-100">
        {item.image ? (
          <img
            src={item.image}
            alt={item.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-sky-100 to-emerald-100 text-xs font-semibold text-slate-600">
            321skole
          </div>
        )}

        <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
          {item.language ? (
            <span className="rounded-full bg-slate-900/75 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
              {item.language}
            </span>
          ) : null}

          {item.level ? (
            <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-slate-900 backdrop-blur">
              {item.level}
            </span>
          ) : null}
        </div>
      </div>

      <div className="p-3">
        <p className="line-clamp-2 text-[13px] font-semibold leading-[1.2] text-slate-900 no-underline">
  {item.title}
</p>

<p className="mt-0.5 text-[11px] leading-[1.2] text-slate-500 no-underline">
  {item.textType ? item.textType.replaceAll("_", " ") : "undervisningsopplegg"}
</p>
      </div>
    </Link>
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