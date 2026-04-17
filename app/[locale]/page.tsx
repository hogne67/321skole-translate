import Link from "next/link";
import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { getAdmin } from "@/lib/firebaseAdmin";

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

async function getFeaturedLessons(locale: string): Promise<FeaturedLesson[]> {
  try {
    const { db } = getAdmin();

    const snap = await db
      .collection("published_lessons")
      .orderBy("createdAt", "desc")
      .limit(40)
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

    if (unique.length > 0) return unique;

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
      <PublicHeader
        locale={locale}
        schoolLabel={tr("brandLogo.school")}
        loginLabel={t("common.login")}
      />

      <section className="w-full overflow-hidden bg-gradient-to-b from-sky-950 via-sky-800 to-sky-600 text-white">
        <div className="w-full py-8 md:py-10">
          <div className="mx-auto max-w-5xl px-6 text-center">
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white md:text-5xl">
              {t("topStrip.title")}
            </h2>

            <p className="mt-3 text-lg text-white/75 md:text-xl">
              {t("topStrip.description")}
            </p>
          </div>

          <div className="mx-auto mt-8 w-[90vw] max-w-[1800px] space-y-5 overflow-hidden py-2">
            <MarqueeRow
              items={firstRow.length ? firstRow : featured}
              locale={locale}
              reverse={false}
            />
            <MarqueeRow
              items={secondRow.length ? secondRow : featured}
              locale={locale}
              reverse
            />
          </div>

          <div className="mt-6 px-6 text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              {t("topStrip.badge", { count: lessonCountLabel })}
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-sky-600">
        <div className="mx-auto max-w-6xl px-6 py-12 md:py-16">
          <h1 className="mx-auto max-w-4xl text-center text-4xl font-semibold tracking-tight text-white md:text-6xl">
            {t("hero.title")}
          </h1>

          <p className="mx-auto mt-4 max-w-3xl text-center text-lg text-white/85 md:text-xl">
            {t("hero.lead")}
          </p>

          <div className="mt-10 rounded-3xl border border-white/20 bg-white/10 p-3 shadow-sm backdrop-blur">
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
        flip
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
              <p className="mt-1 text-sm text-slate-600">{t("footer.tagline")}</p>
            </div>
            <div className="flex flex-wrap gap-3 text-sm">
              <Link
                className="text-slate-700 hover:text-slate-900"
                href={localizedPath(locale, "/about")}
              >
                {t("footer.about")}
              </Link>
              <Link
                className="text-slate-700 hover:text-slate-900"
                href={localizedPath(locale, "/privacy")}
              >
                {t("footer.privacy")}
              </Link>
              <Link
                className="text-slate-700 hover:text-slate-900"
                href={localizedPath(locale, "/contact")}
              >
                {t("footer.contact")}
              </Link>
            </div>
          </div>
          <p className="mt-6 text-xs text-slate-500">
            © {currentYear} {brand.name}. {t("footer.rights")}
          </p>
        </div>
      </footer>
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
    <Link href={`/${lessonLocale}/student/lesson/${item.id}`} className="library-card">
      <div className="library-card-inner">
        {item.image ? (
          <img src={item.image} alt={item.title} loading="lazy" />
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
          className={`grid grid-cols-1 items-center gap-10 md:grid-cols-2 ${props.flip ? "md:[&>*:first-child]:order-2" : ""
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
        className={`mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full ${props.dark ? "bg-white/15 text-white" : "bg-emerald-100 text-emerald-700"
          }`}
      >
        ✓
      </span>
      <span className="text-sm">{props.text}</span>
    </div>
  );
}