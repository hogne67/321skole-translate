import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  BadgeCheck,
  Database,
  FileText,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRoundCheck,
} from "lucide-react";
import { getLocale } from "next-intl/server";

type LinkItem = { href: string; label: string; note?: string };
type Section = {
  title: string;
  text: string;
  icon: ReactNode;
  links: LinkItem[];
};
type Copy = {
  back: string;
  eyebrow: string;
  title: string;
  lead: string;
  updated: string;
  promisesTitle: string;
  promises: string[];
  audienceTitle: string;
  audience: Array<{ title: string; text: string }>;
  sections: Section[];
  sovereigntyTitle: string;
  sovereigntyText: string;
  sovereigntyPoints: string[];
  cookiesTitle: string;
  cookiesText: string;
  cookiesPoints: string[];
  municipalTemplatesTitle: string;
  municipalTemplatesText: string;
  municipalTemplatesPoints: string[];
  feideTitle: string;
  feideText: string;
  feidePoints: string[];
  footerTitle: string;
  footerText: string;
  contactCta: string;
};

function localizedPath(locale: string, path: string) {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${clean}`;
}

function copyFor(locale: string): Copy {
  if (locale === "en") {
    return {
      back: "Back to schools",
      eyebrow: "321school Trust Center",
      title: "Privacy, safety and school control in one place",
      lead: "A practical overview for schools and school owners assessing 321school, Feide login, AI features, data processing and deletion routines.",
      updated: "Working version. Last updated: 9 August 2026.",
      promisesTitle: "Our basic principles",
      promises: [
        "Students can join classroom Spaces anonymously with code or QR where account use has not been approved.",
        "321school supports Feide login when the school owner approves the service.",
        "321school does not sell personal data and does not use student data for third-party advertising.",
        "AI features are documented and should be assessed by the school before systematic student use.",
      ],
      audienceTitle: "Find the right information",
      audience: [
        { title: "For teachers", text: "Understand what students can do in Spaces, accounts, assignments and AI-supported workflows." },
        { title: "For school owners", text: "Review data processing, sub-processors, Feide, deletion routines and the DPA draft." },
        { title: "For parents", text: "See how anonymous participation, accounts and student work are handled." },
      ],
      sections: trustSections("en"),
      sovereigntyTitle: "Data location and data sovereignty",
      sovereigntyText: "Schools often need to know where personal data and student work are stored. The main Firestore database for the active 321school Firebase project is located in europe-west1, Belgium.",
      sovereigntyPoints: [
        "Core app data in Firestore is stored at rest in europe-west1, Belgium.",
        "Firebase Authentication processes authentication data in the United States according to Firebase documentation. This is described in the sub-processor overview.",
        "The active school Storage bucket 321skole-storage is located in the EU multi-region.",
        "Hosting and server functions are delivered through Vercel.",
        "AI requests are processed by OpenAI only when AI features are used.",
        "The final school agreement should state all confirmed regions and any processing outside the EU/EEA for the current production setup.",
      ],
      cookiesTitle: "Cookies and browser storage",
      cookiesText: "321school uses necessary browser storage so login, anonymous participation and classroom activities can function. This is not used to sell data or run third-party advertising.",
      cookiesPoints: [
        "Firebase Auth may use cookies, IndexedDB and local browser storage to keep users signed in.",
        "321school uses localStorage/sessionStorage for functional state such as app mode, anonymous classroom participation, quiz/session aliases and unsaved drafts.",
        "Google Analytics may be used for aggregate product analytics where configured; school-facing pages should describe any analytics in the general privacy policy.",
      ],
      municipalTemplatesTitle: "DPA and municipal templates",
      municipalTemplatesText: "321school can enter into a data processing agreement with the school or school owner. We maintain a DPA draft and structured information that can also be used with the municipality's own template or KS/SkoleSec/Digdir-based templates.",
      municipalTemplatesPoints: [
        "Available information includes purpose, data categories, sub-processors, processing locations, security, deletion/access routines and AI use.",
        "If the municipality uses its own DPA template, 321school can use the same information as the basis for completing it.",
        "The school owner remains responsible for its own assessment, risk review and final approval before systematic school use.",
      ],
      feideTitle: "Feide login",
      feideText: "Feide lowers the threshold for safe school login because access is controlled by the school owner. Feide approval opens login; paid school agreements and extended school administration are handled separately in 321school.",
      feidePoints: [
        "School owners can approve or deny Feide login for their users.",
        "321school receives only the identity data needed for login and account access, such as technical ID, name and email where available.",
        "Feide is not required for anonymous classroom participation in Spaces.",
      ],
      footerTitle: "For school assessment",
      footerText: "This Trust Center is intended to make the assessment easier. It is not a substitute for the school owner's own privacy and security review.",
      contactCta: "Contact 321school",
    };
  }

  if (locale === "pt") {
    return {
      back: "Voltar para escolas",
      eyebrow: "Central de confiança 321school",
      title: "Privacidade, segurança e controle escolar em um só lugar",
      lead: "Uma visão prática para escolas e mantenedoras avaliarem a 321school, login Feide, IA, tratamento de dados e rotinas de exclusão.",
      updated: "Versão de trabalho. Atualizado em: 9 de agosto de 2026.",
      promisesTitle: "Nossos princípios básicos",
      promises: [
        "Alunos podem entrar em Spaces de sala de aula anonimamente com código ou QR quando conta não foi aprovada.",
        "A 321school oferece login com Feide quando a mantenedora aprova o serviço.",
        "A 321school não vende dados pessoais e não usa dados de alunos para publicidade de terceiros.",
        "Recursos de IA são documentados e devem ser avaliados pela escola antes de uso sistemático com alunos.",
      ],
      audienceTitle: "Encontre a informação certa",
      audience: [
        { title: "Para professores", text: "Entenda o que alunos podem fazer em Spaces, contas, tarefas e fluxos com apoio de IA." },
        { title: "Para mantenedoras", text: "Revise tratamento de dados, subprocessadores, Feide, rotinas de exclusão e o rascunho de acordo." },
        { title: "Para responsáveis", text: "Veja como participação anônima, contas e trabalhos de alunos são tratados." },
      ],
      sections: trustSections("pt"),
      sovereigntyTitle: "Localização de dados e soberania",
      sovereigntyText: "Escolas normalmente precisam saber onde dados pessoais e trabalhos de alunos são armazenados. O banco Firestore principal do projeto Firebase ativo da 321school está localizado em europe-west1, Bélgica.",
      sovereigntyPoints: [
        "Dados principais no Firestore são armazenados em repouso em europe-west1, Bélgica.",
        "Firebase Authentication trata dados de autenticação nos Estados Unidos segundo a documentação Firebase. Isso é descrito na visão de subprocessadores.",
        "O bucket escolar ativo 321skole-storage está localizado na multi-região UE.",
        "Hospedagem e funções de servidor são entregues pela Vercel.",
        "Pedidos de IA são tratados pela OpenAI apenas quando recursos de IA são usados.",
        "O acordo final com a escola deve indicar todas as regiões confirmadas e eventual tratamento fora da UE/EEE para a configuração de produção atual.",
      ],
      cookiesTitle: "Cookies e armazenamento no navegador",
      cookiesText: "A 321school usa armazenamento necessário no navegador para que login, participação anônima e atividades de sala funcionem. Isso não é usado para vender dados nem para publicidade de terceiros.",
      cookiesPoints: [
        "Firebase Auth pode usar cookies, IndexedDB e armazenamento local para manter usuários conectados.",
        "A 321school usa localStorage/sessionStorage para estado funcional, como modo do app, participação anônima, apelidos de quiz/sessão e rascunhos não salvos.",
        "Google Analytics pode ser usado para análise agregada do produto quando configurado; páginas para escolas devem descrever analítica na política geral de privacidade.",
      ],
      municipalTemplatesTitle: "Acordo de tratamento e modelos municipais",
      municipalTemplatesText: "A 321school pode firmar acordo de tratamento de dados com a escola ou mantenedora. Mantemos um rascunho de acordo e informações estruturadas que também podem ser usadas com o modelo próprio do município ou modelos baseados em KS/SkoleSec/Digdir.",
      municipalTemplatesPoints: [
        "As informações disponíveis incluem finalidade, categorias de dados, subprocessadores, locais de tratamento, segurança, rotinas de exclusão/acesso e uso de IA.",
        "Se o município usa seu próprio modelo, a 321school pode usar as mesmas informações como base para preenchê-lo.",
        "A mantenedora continua responsável por sua avaliação, análise de risco e aprovação final antes de uso escolar sistemático.",
      ],
      feideTitle: "Login com Feide",
      feideText: "Feide reduz a barreira para login escolar seguro porque o acesso é controlado pela mantenedora. A aprovação no Feide libera o login; contratos pagos e administração escolar ampliada são tratados separadamente na 321school.",
      feidePoints: [
        "Mantenedoras podem aprovar ou negar login Feide para seus usuários.",
        "A 321school recebe apenas os dados de identidade necessários para login e acesso à conta, como ID técnico, nome e e-mail quando disponível.",
        "Feide não é necessário para participação anônima em Spaces de sala de aula.",
      ],
      footerTitle: "Para avaliação escolar",
      footerText: "Esta central existe para facilitar a avaliação. Ela não substitui a análise própria de privacidade e segurança da escola/mantenedora.",
      contactCta: "Contatar 321school",
    };
  }

  return {
    back: "Tilbake til skolesiden",
    eyebrow: "321skole Trust Center",
    title: "Personvern, trygghet og skolekontroll samlet på ett sted",
    lead: "En praktisk oversikt for skoler og skoleeiere som vurderer 321skole, Feide-innlogging, KI-funksjoner, databehandling og sletterutiner.",
    updated: "Arbeidsversjon. Sist oppdatert: 9. august 2026.",
    promisesTitle: "Våre grunnprinsipper",
    promises: [
      "Elever kan delta anonymt i klasseroms-Spaces med kode eller QR der kontobruk ikke er avklart.",
      "321skole støtter Feide-innlogging når skoleeier godkjenner tjenesten.",
      "321skole selger ikke personopplysninger og bruker ikke elevdata til tredjepartsannonsering.",
      "KI-funksjoner er dokumentert og bør vurderes av skolen før systematisk elevbruk.",
    ],
    audienceTitle: "Finn riktig informasjon",
    audience: [
      { title: "For lærere", text: "Se hva elever kan gjøre i Spaces, kontoer, oppgaver og KI-støttede arbeidsflyter." },
      { title: "For skoleeiere", text: "Vurder databehandling, underleverandører, Feide, sletterutiner og DPA-utkast." },
      { title: "For foresatte", text: "Se hvordan anonym deltakelse, kontoer og elevarbeid håndteres." },
    ],
    sections: trustSections("nb"),
    sovereigntyTitle: "Lagringssted og datasuverenitet",
    sovereigntyText: "Skoler vil ofte vite hvor personopplysninger og elevarbeid lagres. Hoveddatabasen i Firestore for aktivt 321skole Firebase-prosjekt ligger i europe-west1, Belgia.",
    sovereigntyPoints: [
      "Kjernedata i Firestore lagres kryptert i ro i europe-west1, Belgia.",
      "Firebase Authentication behandler autentiseringsdata i USA ifølge Firebase-dokumentasjonen. Dette beskrives i underleverandøroversikten.",
      "Aktiv skolebucket for Storage, 321skole-storage, ligger i EU multi-region.",
      "Hosting og serverfunksjoner leveres gjennom Vercel.",
      "KI-forespørsler behandles av OpenAI bare når KI-funksjoner brukes.",
      "Endelig skoleavtale bør angi alle bekreftede regioner og eventuell behandling utenfor EU/EØS for gjeldende produksjonsoppsett.",
    ],
    cookiesTitle: "Informasjonskapsler og nettleserlagring",
    cookiesText: "321skole bruker nødvendig nettleserlagring for at innlogging, anonym deltakelse og klasseromsaktiviteter skal fungere. Dette brukes ikke til salg av data eller tredjepartsannonsering.",
    cookiesPoints: [
      "Firebase Auth kan bruke informasjonskapsler, IndexedDB og lokal nettleserlagring for å holde brukere innlogget.",
      "321skole bruker localStorage/sessionStorage til funksjonell tilstand, for eksempel appmodus, anonym klasseromsdeltakelse, quiz-/sesjonsalias og ulagrede utkast.",
      "Google Analytics kan brukes til aggregert produktanalyse der dette er konfigurert; skolevendte sider bør beskrive analysebruk i generell personvernerklæring.",
    ],
    municipalTemplatesTitle: "Databehandleravtale og kommunale maler",
    municipalTemplatesText: "321skole kan inngå databehandleravtale med skole eller skoleeier. Vi har et DPA-utkast og strukturert informasjon som også kan brukes dersom kommunen ønsker egen mal eller KS/SkoleSec/Digdir-basert mal.",
    municipalTemplatesPoints: [
      "Tilgjengelig informasjon omfatter formål, datakategorier, underleverandører, behandlingssteder, sikkerhet, sletting/innsyn og KI-bruk.",
      "Hvis kommunen bruker egen DPA-mal, kan 321skole bruke samme informasjon som grunnlag for utfylling.",
      "Skoleeier er fortsatt ansvarlig for egen vurdering, risikovurdering og endelig godkjenning før systematisk skolebruk.",
    ],
    feideTitle: "Feide-innlogging",
    feideText: "Feide senker terskelen for trygg skoleinnlogging fordi tilgang styres av skoleeier. Feide-godkjenning åpner for innlogging; betalt skoleavtale og utvidet skoleadministrasjon håndteres separat i 321skole.",
    feidePoints: [
      "Skoleeier kan godkjenne eller nekte Feide-innlogging for sine brukere.",
      "321skole mottar bare identitetsdata som trengs for innlogging og kontotilgang, som teknisk ID, navn og e-post der det er tilgjengelig.",
      "Feide er ikke nødvendig for anonym klasseromsdeltakelse i Spaces.",
    ],
    footerTitle: "For skolevurdering",
    footerText: "Denne Trust Center-siden er laget for å gjøre vurderingen enklere. Den erstatter ikke skoleeiers egen personvern- og sikkerhetsvurdering.",
    contactCta: "Kontakt 321skole",
  };
}

function trustSections(locale: string): Section[] {
  if (locale === "en") {
    return [
      {
        title: "Data privacy",
        text: "How 321school handles accounts, anonymous Spaces, student work, profiles and school-controlled use.",
        icon: <ShieldCheck />,
        links: [
          { href: "/school/privacy", label: "Privacy for schools" },
          { href: "/privacy", label: "General privacy policy" },
        ],
      },
      {
        title: "Data processing",
        text: "Draft terms and documentation for schools that need a data processing agreement.",
        icon: <FileText />,
        links: [{ href: "/school/dpa", label: "DPA template", note: "Draft for review" }],
      },
      {
        title: "Sub-processors",
        text: "External services that may process data, including Firebase, Feide, Vercel, OpenAI and email/payment providers.",
        icon: <Database />,
        links: [{ href: "/school/subprocessors", label: "Sub-processors" }],
      },
      {
        title: "Access and deletion",
        text: "Practical routine for requests about student data, anonymous Spaces, accounts, correction and deletion.",
        icon: <Trash2 />,
        links: [{ href: "/school/data-rights", label: "Access, deletion and correction" }],
      },
      {
        title: "AI features",
        text: "What AI functions may do, who controls them and why schools should assess AI before systematic student use.",
        icon: <Sparkles />,
        links: [{ href: "/school/privacy", label: "AI in 321school", note: "Section on school privacy page" }],
      },
      {
        title: "Terms and contact",
        text: "General terms, sales terms and contact information for follow-up questions.",
        icon: <BadgeCheck />,
        links: [
          { href: "/terms", label: "Terms" },
          { href: "/sales-terms", label: "Sales terms" },
          { href: "/contact", label: "Contact" },
        ],
      },
    ];
  }

  if (locale === "pt") {
    return [
      {
        title: "Privacidade",
        text: "Como a 321school trata contas, Spaces anônimos, trabalhos de alunos, perfis e uso controlado pela escola.",
        icon: <ShieldCheck />,
        links: [
          { href: "/school/privacy", label: "Privacidade para escolas" },
          { href: "/privacy", label: "Política geral de privacidade" },
        ],
      },
      {
        title: "Tratamento de dados",
        text: "Termos e documentação em rascunho para escolas que precisam de acordo de tratamento de dados.",
        icon: <FileText />,
        links: [{ href: "/school/dpa", label: "Modelo de acordo", note: "Rascunho para revisão" }],
      },
      {
        title: "Subprocessadores",
        text: "Serviços externos que podem tratar dados, incluindo Firebase, Feide, Vercel, OpenAI e provedores de e-mail/pagamento.",
        icon: <Database />,
        links: [{ href: "/school/subprocessors", label: "Subprocessadores" }],
      },
      {
        title: "Acesso e exclusão",
        text: "Rotina prática para pedidos sobre dados de alunos, Spaces anônimos, contas, correção e exclusão.",
        icon: <Trash2 />,
        links: [{ href: "/school/data-rights", label: "Acesso, exclusão e correção" }],
      },
      {
        title: "Recursos de IA",
        text: "O que recursos de IA podem fazer, quem controla e por que escolas devem avaliar IA antes de uso sistemático com alunos.",
        icon: <Sparkles />,
        links: [{ href: "/school/privacy", label: "IA na 321school", note: "Seção na página de privacidade escolar" }],
      },
      {
        title: "Termos e contato",
        text: "Termos gerais, termos de venda e contato para perguntas de acompanhamento.",
        icon: <BadgeCheck />,
        links: [
          { href: "/terms", label: "Termos" },
          { href: "/sales-terms", label: "Termos de venda" },
          { href: "/contact", label: "Contato" },
        ],
      },
    ];
  }

  return [
    {
      title: "Personvern",
      text: "Hvordan 321skole håndterer kontoer, anonyme Spaces, elevarbeid, profiler og skolestyrt bruk.",
      icon: <ShieldCheck />,
      links: [
        { href: "/school/privacy", label: "Personvern for skoler" },
        { href: "/privacy", label: "Generell personvernerklæring" },
      ],
    },
    {
      title: "Databehandling",
      text: "Utkast og dokumentasjon for skoler som trenger databehandleravtale.",
      icon: <FileText />,
      links: [{ href: "/school/dpa", label: "Databehandleravtale-mal", note: "Utkast for gjennomgang" }],
    },
    {
      title: "Underleverandører",
      text: "Eksterne tjenester som kan behandle data, blant annet Firebase, Feide, Vercel, OpenAI og e-post-/betalingsleverandører.",
      icon: <Database />,
      links: [{ href: "/school/subprocessors", label: "Underleverandører" }],
    },
    {
      title: "Innsyn og sletting",
      text: "Praktisk rutine for forespørsler om elevdata, anonyme Spaces, kontoer, retting og sletting.",
      icon: <Trash2 />,
      links: [{ href: "/school/data-rights", label: "Sletting, innsyn og retting" }],
    },
    {
      title: "KI-funksjoner",
      text: "Hva KI-funksjoner kan gjøre, hvem som styrer dem, og hvorfor skoler bør vurdere KI før systematisk elevbruk.",
      icon: <Sparkles />,
      links: [{ href: "/school/privacy", label: "KI i 321skole", note: "Seksjon på skolepersonvern-siden" }],
    },
    {
      title: "Vilkår og kontakt",
      text: "Generelle vilkår, salgsvilkår og kontaktinformasjon for oppfølgingsspørsmål.",
      icon: <BadgeCheck />,
      links: [
        { href: "/terms", label: "Vilkår" },
        { href: "/sales-terms", label: "Salgsvilkår" },
        { href: "/contact", label: "Kontakt" },
      ],
    },
  ];
}

export default async function SchoolTrustPage() {
  const locale = (await getLocale()) as string;
  const text = copyFor(locale);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href={localizedPath(locale, "/")} className="flex items-center gap-3">
            <Image src="/logo321ny.png" alt="321school" width={38} height={38} priority className="h-9 w-auto object-contain" />
            <span className="text-lg font-black">321school</span>
          </Link>
          <Link href={localizedPath(locale, "/skoler")} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50">
            {text.back}
          </Link>
        </div>
      </header>

      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 md:grid-cols-[1.05fr_0.95fr] md:items-center md:py-16">
          <div>
            <p className="inline-flex rounded-full bg-sky-50 px-4 py-2 text-sm font-bold text-sky-800">
              {text.eyebrow}
            </p>
            <h1 className="mt-5 max-w-4xl text-4xl font-black tracking-tight md:text-6xl">{text.title}</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-700">{text.lead}</p>
            <p className="mt-5 text-sm font-semibold text-slate-500">{text.updated}</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
            <h2 className="text-xl font-black">{text.promisesTitle}</h2>
            <ul className="mt-4 grid gap-3">
              {text.promises.map((promise) => (
                <li key={promise} className="flex gap-3 text-sm leading-6 text-slate-700">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <span>{promise}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-8">
        <h2 className="text-2xl font-black">{text.audienceTitle}</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {text.audience.map((item, index) => (
            <article key={item.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
                {index === 0 ? <UserRoundCheck className="h-5 w-5" /> : index === 1 ? <LockKeyhole className="h-5 w-5" /> : <KeyRound className="h-5 w-5" />}
              </div>
              <h3 className="mt-4 text-lg font-black">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-700">{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-6 py-8 md:grid-cols-2">
        {text.sections.map((section) => (
          <TrustSection key={section.title} locale={locale} section={section} />
        ))}
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-6 py-8 md:grid-cols-2">
        <DetailPanel
          icon={<Database className="h-5 w-5" />}
          title={text.sovereigntyTitle}
          text={text.sovereigntyText}
          points={text.sovereigntyPoints}
        />
        <DetailPanel
          icon={<LockKeyhole className="h-5 w-5" />}
          title={text.cookiesTitle}
          text={text.cookiesText}
          points={text.cookiesPoints}
        />
      </section>

      <section className="mx-auto max-w-6xl px-6 py-8">
        <DetailPanel
          icon={<FileText className="h-5 w-5" />}
          title={text.municipalTemplatesTitle}
          text={text.municipalTemplatesText}
          points={text.municipalTemplatesPoints}
        />
      </section>

      <section className="mx-auto max-w-6xl px-6 py-8">
        <div className="rounded-2xl bg-slate-950 p-6 text-white md:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-sky-200">
                <KeyRound className="h-5 w-5" />
              </div>
              <h2 className="mt-4 text-2xl font-black">{text.feideTitle}</h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/80">{text.feideText}</p>
            </div>
          </div>
          <ul className="mt-5 grid gap-2 md:grid-cols-3">
            {text.feidePoints.map((point) => (
              <li key={point} className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-white/80">
                {point}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-14">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <h2 className="text-2xl font-black">{text.footerTitle}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700">{text.footerText}</p>
          <Link href={localizedPath(locale, "/contact")} className="mt-5 inline-flex rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-slate-800">
            {text.contactCta}
          </Link>
        </div>
      </section>
    </main>
  );
}

function TrustSection(props: { locale: string; section: Section }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-sky-700 [&_svg]:h-5 [&_svg]:w-5">
          {props.section.icon}
        </div>
        <div>
          <h2 className="text-xl font-black">{props.section.title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">{props.section.text}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-2">
        {props.section.links.map((link) => (
          <Link
            key={`${props.section.title}-${link.href}-${link.label}`}
            href={localizedPath(props.locale, link.href)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 hover:bg-slate-100"
          >
            {link.label}
            {link.note ? <span className="ml-2 font-semibold text-slate-500">{link.note}</span> : null}
          </Link>
        ))}
      </div>
    </article>
  );
}

function DetailPanel(props: { icon: ReactNode; title: string; text: string; points: string[] }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-sky-700">
          {props.icon}
        </div>
        <div>
          <h2 className="text-xl font-black">{props.title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">{props.text}</p>
        </div>
      </div>
      <ul className="mt-4 grid gap-2">
        {props.points.map((point) => (
          <li key={point} className="text-sm leading-6 text-slate-700">• {point}</li>
        ))}
      </ul>
    </article>
  );
}
