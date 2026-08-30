import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  BadgeCheck,
  Eye,
  ImageIcon,
  LockKeyhole,
  Scale,
  School,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
} from "lucide-react";
import { getLocale } from "next-intl/server";

type Section = {
  title: string;
  body: string;
  points: string[];
  icon: ReactNode;
};

type Copy = {
  back: string;
  eyebrow: string;
  title: string;
  lead: string;
  updated: string;
  noticeTitle: string;
  noticeText: string;
  principlesTitle: string;
  principles: string[];
  sections: Section[];
  footerTitle: string;
  footerText: string;
  privacyCta: string;
  subprocessorsCta: string;
};

function localizedPath(locale: string, path: string) {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${clean}`;
}

function copyFor(locale: string): Copy {
  if (locale === "en") {
    return {
      back: "Back to Trust Center",
      eyebrow: "AI guidelines",
      title: "Guidelines for AI use in 321school",
      lead: "A practical overview of how AI should support learning, teacher work and school-controlled use without replacing adult judgement.",
      updated: "Working version. Last updated: 29 August 2026.",
      noticeTitle: "Role and responsibility",
      noticeText:
        "321school is a learning platform. Teachers, schools and content creators are responsible for reviewing the content they create, share or publish. AI features are support tools and may produce errors, omissions or unsuitable suggestions. 321school may use technical and manual measures to prevent misuse, handle reports, remove content that appears to violate terms, safety requirements or privacy, and restrict access where needed. These measures are not a guarantee that all user-created content has been reviewed in advance.",
      principlesTitle: "Core principles",
      principles: [
        "AI output is a draft or suggestion, not a final professional judgement.",
        "Teachers review and approve AI-supported content before it is used with students.",
        "Students and guardians cannot publish public learning content from 321school.",
        "Public publishing is limited to teacher, creator or admin roles and requires an active choice.",
        "Student data should be kept out of prompts unless it is necessary, appropriate and approved for the school purpose.",
      ],
      sections: guidelineSections("en"),
      footerTitle: "For school assessment",
      footerText:
        "These guidelines are meant to support school review and everyday use. They should be read together with the privacy overview, sub-processor list, terms and any data processing agreement with the school owner.",
      privacyCta: "Privacy for schools",
      subprocessorsCta: "Sub-processors",
    };
  }

  if (locale === "pt") {
    return {
      back: "Voltar à Central de confiança",
      eyebrow: "Diretrizes de IA",
      title: "Diretrizes para uso de IA na 321school",
      lead: "Uma visão prática de como a IA deve apoiar aprendizagem, trabalho docente e uso controlado pela escola sem substituir o julgamento adulto.",
      updated: "Versão de trabalho. Atualizado em: 29 de agosto de 2026.",
      noticeTitle: "Papéis e responsabilidade",
      noticeText:
        "A 321school é uma plataforma de aprendizagem. Professores, escolas e criadores de conteúdo são responsáveis por revisar o conteúdo que criam, compartilham ou publicam. Recursos de IA são ferramentas de apoio e podem gerar erros, omissões ou sugestões inadequadas. A 321school pode usar medidas técnicas e manuais para prevenir mau uso, tratar denúncias, remover conteúdo que pareça violar termos, segurança ou privacidade, e restringir acesso quando necessário. Essas medidas não são garantia de que todo conteúdo criado por usuários foi revisado previamente.",
      principlesTitle: "Princípios centrais",
      principles: [
        "A resposta da IA é rascunho ou sugestão, não julgamento profissional final.",
        "Professores revisam e aprovam conteúdo apoiado por IA antes do uso com alunos.",
        "Alunos e responsáveis não podem publicar conteúdo pedagógico público na 321school.",
        "Publicação pública é limitada a professores, criadores ou admins e exige uma ação ativa.",
        "Dados de alunos devem ficar fora de prompts salvo quando necessário, adequado e aprovado para a finalidade escolar.",
      ],
      sections: guidelineSections("pt"),
      footerTitle: "Para avaliação escolar",
      footerText:
        "Estas diretrizes apoiam a avaliação escolar e o uso diário. Devem ser lidas junto com a visão de privacidade, lista de subprocessadores, termos e eventual acordo de tratamento de dados com a mantenedora.",
      privacyCta: "Privacidade para escolas",
      subprocessorsCta: "Subprocessadores",
    };
  }

  return {
    back: "Tilbake til Trust Center",
    eyebrow: "KI-retningslinjer",
    title: "Retningslinjer for bruk av KI i 321school",
    lead: "En praktisk oversikt over hvordan KI skal støtte læring, lærerarbeid og skolestyrt bruk uten å erstatte voksnes vurdering.",
    updated: "Arbeidsversjon. Sist oppdatert: 29. august 2026.",
    noticeTitle: "Roller og ansvar",
    noticeText:
      "321school er en læringsplattform. Lærere, skoler og innholdsprodusenter har ansvar for å vurdere innhold de lager, deler eller publiserer. KI-funksjoner er støtteverktøy og kan gi feil, mangler eller upassende forslag. 321school kan bruke tekniske og manuelle tiltak for å forebygge misbruk, håndtere rapporter, fjerne innhold som ser ut til å bryte med vilkår, sikkerhet eller personvern, og begrense tilgang ved behov. Slike tiltak er ikke en garanti for at alt brukeropprettet innhold er forhåndskontrollert.",
    principlesTitle: "Grunnprinsipper",
    principles: [
      "KI-svar er utkast eller forslag, ikke en ferdig faglig vurdering.",
      "Lærere vurderer og godkjenner KI-støttet innhold før det brukes med elever.",
      "Elever og foresatte kan ikke publisere offentlig læringsinnhold fra 321school.",
      "Offentlig publisering er begrenset til lærer-, creator- eller adminroller og krever en aktiv handling.",
      "Elevdata bør holdes ute av prompter med mindre det er nødvendig, egnet og avklart for skoleformålet.",
    ],
    sections: guidelineSections("nb"),
    footerTitle: "For skolevurdering",
    footerText:
      "Retningslinjene er laget for å støtte skolens vurdering og daglige bruk. De bør leses sammen med personvernoversikten, underleverandøroversikten, vilkårene og eventuell databehandleravtale med skoleeier.",
    privacyCta: "Personvern for skoler",
    subprocessorsCta: "Underleverandører",
  };
}

function guidelineSections(locale: string): Section[] {
  if (locale === "en") {
    return [
      {
        title: "Teacher review",
        body: "AI may help create, adapt or suggest learning content, but the teacher remains the person who decides what is suitable for students.",
        points: [
          "Generated or pasted text should be reviewed before it becomes an assignment.",
          "AI feedback suggestions should be checked and edited before they are saved or shown as teacher feedback.",
          "Teachers should consider age, subject, language level and local school expectations before sharing AI-supported content.",
        ],
        icon: <UserRoundCheck />,
      },
      {
        title: "Students and guardians",
        body: "Student and guardian roles are designed for participation, self-study and follow-up, not public publishing on behalf of the school.",
        points: [
          "Students can answer tasks, receive feedback and use self-study features where enabled.",
          "Guardians can follow or support learning flows where relevant.",
          "Students and guardians cannot publish public library content or public course material from 321school.",
        ],
        icon: <School />,
      },
      {
        title: "Public publishing",
        body: "Public publishing requires an active choice from a role with publishing access.",
        points: [
          "Teachers and creators should review title, text, tasks, images and metadata before publishing.",
          "Published content should not include unnecessary personal information, student names or identifiable student work without clarification.",
          "321school may unpublish, restrict or remove content that appears unsuitable or conflicts with terms, safety or privacy.",
        ],
        icon: <Eye />,
      },
      {
        title: "Images and media",
        body: "Images can make learning content better, but they also need extra care in school contexts.",
        points: [
          "Avoid using identifiable photos of students or children unless this has been clearly approved for the school purpose.",
          "AI-generated images used in public-facing material should be presented in a way that does not mislead people into believing they are real documentary photos.",
          "Image prompts should avoid private, sensitive or identifying student information.",
        ],
        icon: <ImageIcon />,
      },
      {
        title: "Personal data",
        body: "AI prompts should use the least amount of personal data needed for the learning purpose.",
        points: [
          "Avoid health data, private family matters, special category data and unnecessary names or contact information.",
          "Use anonymous or general examples when they are sufficient.",
          "School use should follow the school's own assessment, routines and data processing agreement where applicable.",
        ],
        icon: <LockKeyhole />,
      },
      {
        title: "Moderation and reports",
        body: "321school can take action when content or use appears to create risk, but moderation is not a promise of advance review.",
        points: [
          "Technical safeguards may block or limit some prompts, outputs or usage patterns.",
          "Reports and support requests may be reviewed manually.",
          "Access may be limited if needed to protect users, privacy, service stability or compliance with terms.",
        ],
        icon: <ShieldCheck />,
      },
    ];
  }

  if (locale === "pt") {
    return [
      {
        title: "Revisão pelo professor",
        body: "A IA pode ajudar a criar, adaptar ou sugerir conteúdo de aprendizagem, mas o professor decide o que é adequado para os alunos.",
        points: [
          "Textos gerados ou colados devem ser revisados antes de virar tarefa.",
          "Sugestões de feedback da IA devem ser verificadas e editadas antes de serem salvas ou mostradas como feedback do professor.",
          "Professores devem considerar idade, disciplina, nível de idioma e expectativas locais da escola antes de compartilhar conteúdo apoiado por IA.",
        ],
        icon: <UserRoundCheck />,
      },
      {
        title: "Alunos e responsáveis",
        body: "Papéis de aluno e responsável são voltados a participação, estudo individual e acompanhamento, não publicação pública em nome da escola.",
        points: [
          "Alunos podem responder tarefas, receber feedback e usar recursos de estudo individual quando ativados.",
          "Responsáveis podem acompanhar ou apoiar fluxos de aprendizagem quando relevante.",
          "Alunos e responsáveis não podem publicar conteúdo de biblioteca pública ou material de curso público pela 321school.",
        ],
        icon: <School />,
      },
      {
        title: "Publicação pública",
        body: "Publicação pública exige uma escolha ativa de uma função com acesso de publicação.",
        points: [
          "Professores e criadores devem revisar título, texto, tarefas, imagens e metadados antes da publicação.",
          "Conteúdo publicado não deve conter dados pessoais desnecessários, nomes de alunos ou trabalhos identificáveis sem esclarecimento.",
          "A 321school pode despublicar, restringir ou remover conteúdo que pareça inadequado ou conflite com termos, segurança ou privacidade.",
        ],
        icon: <Eye />,
      },
      {
        title: "Imagens e mídia",
        body: "Imagens podem melhorar o conteúdo, mas exigem cuidado extra em contextos escolares.",
        points: [
          "Evite fotos identificáveis de alunos ou crianças, salvo se isso foi claramente aprovado para a finalidade escolar.",
          "Imagens geradas por IA em materiais públicos devem ser apresentadas de forma que não induza as pessoas a acreditar que são fotos documentais reais.",
          "Prompts de imagem devem evitar informações privadas, sensíveis ou identificáveis de alunos.",
        ],
        icon: <ImageIcon />,
      },
      {
        title: "Dados pessoais",
        body: "Prompts de IA devem usar a menor quantidade possível de dados pessoais necessária para a finalidade pedagógica.",
        points: [
          "Evite dados de saúde, questões familiares privadas, categorias especiais de dados e nomes ou contatos desnecessários.",
          "Use exemplos anônimos ou gerais quando forem suficientes.",
          "Uso escolar deve seguir a avaliação, as rotinas e eventual acordo de tratamento de dados da escola.",
        ],
        icon: <LockKeyhole />,
      },
      {
        title: "Moderação e denúncias",
        body: "A 321school pode agir quando conteúdo ou uso pareça criar risco, mas moderação não é promessa de revisão prévia.",
        points: [
          "Proteções técnicas podem bloquear ou limitar alguns prompts, respostas ou padrões de uso.",
          "Denúncias e pedidos de suporte podem ser revisados manualmente.",
          "O acesso pode ser limitado quando necessário para proteger usuários, privacidade, estabilidade do serviço ou cumprimento dos termos.",
        ],
        icon: <ShieldCheck />,
      },
    ];
  }

  return [
    {
      title: "Lærers gjennomgang",
      body: "KI kan hjelpe med å lage, tilpasse eller foreslå læringsinnhold, men læreren er fortsatt den som avgjør hva som er egnet for elever.",
      points: [
        "Generert eller innlimt tekst bør leses gjennom før den blir til en oppgave.",
        "KI-forslag til feedback bør sjekkes og redigeres før de lagres eller vises som lærerfeedback.",
        "Lærere bør vurdere alder, fag, språknivå og lokale skoleforventninger før KI-støttet innhold deles.",
      ],
      icon: <UserRoundCheck />,
    },
    {
      title: "Elever og foresatte",
      body: "Elev- og foresatteroller er laget for deltakelse, egenstudie og oppfølging, ikke offentlig publisering på vegne av skolen.",
      points: [
        "Elever kan svare på oppgaver, få tilbakemelding og bruke egenstudiefunksjoner der dette er aktivert.",
        "Foresatte kan følge eller støtte læringsflyter der det er relevant.",
        "Elever og foresatte kan ikke publisere innhold i offentlig bibliotek eller offentlige kurs fra 321school.",
      ],
      icon: <School />,
    },
    {
      title: "Offentlig publisering",
      body: "Offentlig publisering krever en aktiv handling fra en rolle med publiseringstilgang.",
      points: [
        "Lærere og creators bør gjennomgå tittel, tekst, oppgaver, bilder og metadata før publisering.",
        "Publisert innhold bør ikke inneholde unødvendige personopplysninger, elevnavn eller identifiserbart elevarbeid uten avklaring.",
        "321school kan avpublisere, begrense eller fjerne innhold som fremstår som uegnet eller i konflikt med vilkår, sikkerhet eller personvern.",
      ],
      icon: <Eye />,
    },
    {
      title: "Bilder og medier",
      body: "Bilder kan gjøre læringsinnhold bedre, men krever ekstra varsomhet i skolesammenheng.",
      points: [
        "Unngå identifiserbare bilder av elever eller barn med mindre dette er tydelig avklart for skoleformålet.",
        "KI-genererte bilder som brukes offentlig bør presenteres slik at de ikke gir inntrykk av å være ekte dokumentarfoto.",
        "Bildeprompter bør ikke inneholde private, sensitive eller identifiserende elevopplysninger.",
      ],
      icon: <ImageIcon />,
    },
    {
      title: "Personopplysninger",
      body: "KI-prompter bør bruke minst mulig personopplysninger for å oppnå læringsformålet.",
      points: [
        "Unngå helseopplysninger, private familieforhold, særlige kategorier av data og unødvendige navn eller kontaktopplysninger.",
        "Bruk anonyme eller generelle eksempler når det er nok.",
        "Skolebruk bør følge skolens egen vurdering, rutiner og eventuell databehandleravtale.",
      ],
      icon: <LockKeyhole />,
    },
    {
      title: "Moderering og rapporter",
      body: "321school kan gripe inn når innhold eller bruk ser ut til å skape risiko, men moderering er ikke et løfte om forhåndskontroll.",
      points: [
        "Tekniske sikkerhetstiltak kan blokkere eller begrense enkelte prompter, svar eller bruksmønstre.",
        "Rapporter og supporthenvendelser kan gjennomgås manuelt.",
        "Tilgang kan begrenses når det trengs for å beskytte brukere, personvern, tjenestens stabilitet eller etterlevelse av vilkår.",
      ],
      icon: <ShieldCheck />,
    },
  ];
}

export default async function SchoolAiGuidelinesPage() {
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
          <Link href={localizedPath(locale, "/school/trust")} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50">
            {text.back}
          </Link>
        </div>
      </header>

      <section className="bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 md:grid-cols-[1.05fr_0.95fr] md:items-start md:py-16">
          <div>
            <p className="inline-flex rounded-full bg-sky-50 px-4 py-2 text-sm font-bold text-sky-800">
              {text.eyebrow}
            </p>
            <h1 className="mt-5 max-w-4xl text-4xl font-black tracking-tight md:text-6xl">{text.title}</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-700">{text.lead}</p>
            <p className="mt-5 text-sm font-semibold text-slate-500">{text.updated}</p>
          </div>

          <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white text-sky-700 shadow-sm">
              <Scale className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-xl font-black">{text.noticeTitle}</h2>
            <p className="mt-3 text-sm leading-6 text-slate-700">{text.noticeText}</p>
          </aside>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-2xl font-black">{text.principlesTitle}</h2>
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {text.principles.map((principle) => (
              <li key={principle} className="flex gap-3 text-sm leading-6 text-slate-700">
                <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <span>{principle}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-6 py-8 md:grid-cols-2">
        {text.sections.map((section) => (
          <GuidelineCard key={section.title} section={section} />
        ))}
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-14">
        <div className="rounded-2xl bg-slate-950 p-6 text-white md:p-8">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-sky-200">
            <Sparkles className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-2xl font-black">{text.footerTitle}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/80">{text.footerText}</p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Link href={localizedPath(locale, "/school/privacy")} className="inline-flex justify-center rounded-xl bg-white px-5 py-3 text-sm font-black text-slate-950 hover:bg-slate-100">
              {text.privacyCta}
            </Link>
            <Link href={localizedPath(locale, "/school/subprocessors")} className="inline-flex justify-center rounded-xl border border-white/25 px-5 py-3 text-sm font-black text-white hover:bg-white/10">
              {text.subprocessorsCta}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function GuidelineCard({ section }: { section: Section }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-sky-700 [&_svg]:h-5 [&_svg]:w-5">
          {section.icon}
        </div>
        <div>
          <h2 className="text-xl font-black">{section.title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">{section.body}</p>
        </div>
      </div>
      <ul className="mt-4 grid gap-2">
        {section.points.map((point) => (
          <li key={point} className="flex gap-2 text-sm leading-6 text-slate-700">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
