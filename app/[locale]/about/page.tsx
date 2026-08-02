import Image from "next/image";
import Link from "next/link";
import { getLocale } from "next-intl/server";

const content = {
  nb: {
    navBack: "Til forsiden",
    eyebrow: "Om 321skole",
    title: "Læring for alle.",
    lead:
      "321skole bygges fra en enkel idé: elever lærer bedre når de møter tekster, oppgaver og forklaringer på riktig nivå.",
    companyTitle: "Selskap",
    companyName: "Fjord service",
    orgLabel: "Org.nr.",
    addressLabel: "Adresse",
    address: "Røysegata 19, 6003 Ålesund",
    emailLabel: "E-post",
    backgroundTitle: "Bakgrunn",
    backgroundText:
      "Utgangspunktet er lesing, lesing og mer lesing på riktig nivå. Når elevene forstår mer, mestrer de mer. Når tekstene engasjerer, blir det lettere å tenke kritisk, stille spørsmål og lære språk.",
    goalsTitle: "Mål",
    goalsText:
      "Målet er å gjøre hverdagen enklere for lærere, med respekt for yrket og lærerens faglige vurdering. Mindre av det som er kjedelig. Mer av det som er gøy. Tid til elevene. KI skal være støtte, ikke erstatning. 321skole samler gode redskaper på ett sted, slik at lærere, elever, studenter og foreldre kan bruke mer tid på læring.",
    accessibilityTitle: "Tilgjengelig læring",
    accessibilityText:
      "Læring skal være mulig for flest mulig. Derfor bygger vi med støtte for lyd, oversettelse, nivåtilpasning og digitale verktøy som kan hjelpe ulike elever på ulike måter.",
    visionTitle: "Visjon",
    visionText:
      "Vi ønsker å bygge et verdensomspennende læringsnettverk med deling av leksjoner, oppgaver og kompetanse. Et sted der gode undervisningsopplegg kan leve videre, tilpasses og komme flere til gode.",
    values: [
      "Lesing på riktig nivå",
      "Mestring og motivasjon",
      "Kritisk tenking",
      "Tekster som engasjerer",
      "Språklæring for flere",
      "Gode verktøy på ett sted",
    ],
    ctaTitle: "Vil du kontakte oss?",
    ctaText: "Send oss gjerne en e-post dersom du har spørsmål, ideer eller ønsker samarbeid.",
    cta: "Kontakt oss",
  },
  en: {
    navBack: "Back to front page",
    eyebrow: "About 321school",
    title: "Learning for everyone.",
    lead:
      "321school is built from a simple idea: learners make more progress when texts, tasks and explanations meet them at the right level.",
    companyTitle: "Company",
    companyName: "Fjord service",
    orgLabel: "Company no.",
    addressLabel: "Address",
    address: "Røysegata 19, 6003 Ålesund, Norway",
    emailLabel: "Email",
    backgroundTitle: "Background",
    backgroundText:
      "The starting point is reading, reading and more reading at the right level. When learners understand more, they master more. When texts engage, it becomes easier to think critically, ask questions and learn languages.",
    goalsTitle: "Goal",
    goalsText:
      "Our goal is to make everyday teaching easier, with respect for the teaching profession and the teacher's judgement. Less of what is tedious. More of what is meaningful and fun. More time for students. AI should support, not replace. 321school brings useful tools together so teachers, learners, students and parents can spend more time on learning.",
    accessibilityTitle: "Accessible learning",
    accessibilityText:
      "Learning should be possible for as many people as possible. That is why we build with audio, translation, level adaptation and digital tools that can support different learners in different ways.",
    visionTitle: "Vision",
    visionText:
      "We want to build a global learning network focused on sharing lessons, tasks and expertise. A place where strong teaching resources can live on, be adapted and benefit more people.",
    values: [
      "Reading at the right level",
      "Mastery and motivation",
      "Critical thinking",
      "Texts that engage",
      "Language learning for more people",
      "Good tools in one place",
    ],
    ctaTitle: "Want to contact us?",
    ctaText: "Send us an email if you have questions, ideas or want to collaborate.",
    cta: "Contact us",
  },
  pt: {
    navBack: "Voltar para a página inicial",
    eyebrow: "Sobre a 321school",
    title: "Aprendizagem para todos.",
    lead:
      "A 321school nasce de uma ideia simples: as pessoas aprendem melhor quando textos, atividades e explicações estão no nível certo.",
    companyTitle: "Empresa",
    companyName: "Fjord service",
    orgLabel: "N.º da empresa",
    addressLabel: "Endereço",
    address: "Røysegata 19, 6003 Ålesund, Noruega",
    emailLabel: "E-mail",
    backgroundTitle: "Origem",
    backgroundText:
      "O ponto de partida é leitura, leitura e mais leitura no nível certo. Quando os alunos entendem mais, eles dominam mais. Quando os textos engajam, fica mais fácil pensar de forma crítica, fazer perguntas e aprender idiomas.",
    goalsTitle: "Objetivo",
    goalsText:
      "O objetivo é tornar o dia a dia dos professores mais simples, com respeito pela profissão e pelo julgamento pedagógico. Menos do que é cansativo. Mais do que é significativo e divertido. Mais tempo para os alunos. A IA deve apoiar, não substituir. A 321school reúne boas ferramentas em um só lugar para que professores, alunos, estudantes e pais possam dedicar mais tempo à aprendizagem.",
    accessibilityTitle: "Aprendizagem acessível",
    accessibilityText:
      "A aprendizagem deve ser possível para o maior número de pessoas. Por isso criamos recursos com áudio, tradução, adaptação de nível e ferramentas digitais para apoiar diferentes alunos de diferentes formas.",
    visionTitle: "Visão",
    visionText:
      "Queremos construir uma rede mundial de aprendizagem focada no compartilhamento de aulas, atividades e competência. Um lugar onde bons recursos pedagógicos possam continuar vivos, ser adaptados e beneficiar mais pessoas.",
    values: [
      "Leitura no nível certo",
      "Domínio e motivação",
      "Pensamento crítico",
      "Textos que engajam",
      "Aprendizagem de idiomas para mais pessoas",
      "Boas ferramentas em um só lugar",
    ],
    ctaTitle: "Quer falar conosco?",
    ctaText: "Envie um e-mail se tiver perguntas, ideias ou quiser colaborar.",
    cta: "Entrar em contato",
  },
} as const;

function getText(locale: string) {
  if (locale === "en" || locale === "pt") return content[locale];
  return content.nb;
}

export default async function AboutPage() {
  const locale = await getLocale();
  const t = getText(locale);

  return (
    <main className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-emerald-50 text-slate-950">
      <div className="mx-auto max-w-6xl px-6 py-8 md:py-12">
        <Link href={`/${locale}`} className="text-sm font-semibold text-sky-700 hover:text-sky-900">
          {t.navBack}
        </Link>

        <section className="mt-8 grid gap-8 rounded-[2rem] bg-white/85 p-6 shadow-xl shadow-sky-900/10 ring-1 ring-slate-200 md:grid-cols-[0.85fr_1.15fr] md:p-10">
          <aside className="rounded-3xl bg-slate-950 p-6 text-white">
            <Image
              src="/logo321ny.png"
              alt="321skole"
              width={170}
              height={52}
              className="h-auto w-40 rounded-xl bg-white p-2"
            />

            <div className="mt-8">
              <p className="text-sm font-semibold uppercase tracking-wide text-sky-200">{t.companyTitle}</p>
              <h2 className="mt-2 text-2xl font-semibold">{t.companyName}</h2>
              <dl className="mt-6 space-y-4 text-sm text-slate-200">
                <div>
                  <dt className="font-semibold text-white">{t.orgLabel}</dt>
                  <dd>968 400 789</dd>
                </div>
                <div>
                  <dt className="font-semibold text-white">{t.addressLabel}</dt>
                  <dd>{t.address}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-white">{t.emailLabel}</dt>
                  <dd>
                    <a className="text-sky-200 hover:text-white" href="mailto:post@321skole.no">
                      post@321skole.no
                    </a>
                  </dd>
                </div>
              </dl>
            </div>
          </aside>

          <div>
            <p className="inline-flex rounded-full bg-sky-100 px-4 py-2 text-sm font-semibold text-sky-800">
              {t.eyebrow}
            </p>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">{t.title}</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-700">{t.lead}</p>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {t.values.map((value) => (
                <div key={value} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800">
                  {value}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-3">
          <InfoCard title={t.backgroundTitle} text={t.backgroundText} />
          <InfoCard title={t.goalsTitle} text={t.goalsText} />
          <InfoCard title={t.accessibilityTitle} text={t.accessibilityText} />
        </section>

        <section className="mt-8 rounded-[2rem] bg-slate-950 p-6 text-white shadow-xl shadow-slate-900/10 md:p-10">
          <div className="grid gap-8 md:grid-cols-[1.4fr_0.8fr] md:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-emerald-200">{t.visionTitle}</p>
              <p className="mt-4 max-w-3xl text-xl leading-9 text-white/85">{t.visionText}</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-5">
              <h2 className="text-xl font-semibold">{t.ctaTitle}</h2>
              <p className="mt-3 text-sm leading-6 text-white/75">{t.ctaText}</p>
              <Link
                href={`/${locale}/contact`}
                className="mt-5 inline-flex rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-white/90"
              >
                {t.cta}
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function InfoCard(props: { title: string; text: string }) {
  return (
    <article className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-xl font-semibold tracking-tight text-slate-950">{props.title}</h2>
      <p className="mt-3 text-sm leading-7 text-slate-700">{props.text}</p>
    </article>
  );
}
