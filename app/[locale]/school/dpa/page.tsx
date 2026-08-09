import Image from "next/image";
import Link from "next/link";
import { getLocale } from "next-intl/server";

type Section = { title: string; body: string; points: string[] };
type Copy = {
  back: string;
  eyebrow: string;
  title: string;
  lead: string;
  updated: string;
  warning: string;
  sections: Section[];
  relatedTitle: string;
  relatedLinks: Array<{ href: string; label: string }>;
};

function localizedPath(locale: string, path: string) {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${clean}`;
}

function copyFor(locale: string): Copy {
  if (locale === "en") {
    return {
      back: "Back to school privacy",
      eyebrow: "Template / draft",
      title: "Data processing agreement for schools",
      lead: "A first template showing the topics a school and 321school should clarify before broader school use.",
      updated: "Draft version. Last updated: 9 August 2026.",
      warning: "This is not a final signed legal agreement. Schools should review it with their own administration, ICT/privacy lead or legal adviser before use.",
      sections: [
        {
          title: "Parties and roles",
          body: "The school or school owner is normally the controller for school use. 321school acts as processor when processing personal data on behalf of the school.",
          points: [
            "Controller: school or school owner.",
            "Processor: 321school.",
            "Users: teachers, students, parents/guardians and school administrators where relevant.",
          ],
        },
        {
          title: "Purpose",
          body: "Personal data is processed to provide digital learning activities, Spaces, assignments, feedback, administration and related support.",
          points: [
            "Provide access to rooms, assignments, quizzes and learning activities.",
            "Allow teachers to follow up student work.",
            "Support account, billing and school administration where enabled.",
          ],
        },
        {
          title: "Feide and authentication",
          body: "When Feide login is used, Feide and the connected identity provider authenticate the user. 321school receives the identity information needed to create and maintain access to the service.",
          points: [
            "Feide approval by a school owner allows users from that school owner to sign in; it does not by itself create a paid school agreement.",
            "321school processes login identity data only to provide account access, security, support and documented school administration.",
            "321school does not request national identity numbers for ordinary use.",
          ],
        },
        {
          title: "Categories of data",
          body: "The categories depend on how the school uses 321school.",
          points: [
            "Anonymous Spaces: technical user ID, display name, room membership and submitted work.",
            "Accounts: name, email where available, role, profile data, login provider, saved work, feedback and activity needed for the service.",
            "Teacher/school: rooms, assignments, generated content, administration and support information.",
          ],
        },
        {
          title: "No commercial resale or advertising",
          body: "321school does not process school data for sale of personal data, third-party advertising or targeted advertising.",
          points: [
            "Student work and profile data are not sold.",
            "School data is not used to build advertising profiles.",
            "Personal data is processed for the documented service purposes and according to the agreement with the school/school owner.",
          ],
        },
        {
          title: "AI and student use",
          body: "Students in Spaces normally do not use AI directly. Signed-in students may use AI features in self-study where account use and such functions have been approved.",
          points: [
            "Teachers may use AI to create or adapt content before sharing.",
            "AI use should be assessed by the school before systematic student use.",
            "For children under 13, account use and AI features should be clarified by school or guardians.",
          ],
        },
        {
          title: "Sub-processors",
          body: "321school may use sub-processors to provide hosting, authentication, storage, AI, payment and email services.",
          points: [
            "A current sub-processor overview should be available to the school.",
            "321school should notify schools of material changes where required by agreement.",
            "Sub-processors should only be used for documented service purposes.",
          ],
        },
        {
          title: "Deletion and return",
          body: "When school use ends, personal data should be deleted or returned according to the school’s instructions, unless law or necessary service records require continued storage.",
          points: [
            "Teachers can remove or archive students from Spaces.",
            "Schools can request deletion of school-related data.",
            "Backups and technical logs may follow separate retention cycles.",
          ],
        },
        {
          title: "Security and confidentiality",
          body: "321school should use appropriate technical and organizational measures to protect personal data.",
          points: [
            "Access control for user roles.",
            "Secure authentication through the identity provider in use.",
            "Logging and monitoring appropriate for service operation.",
            "Feide login where enabled by the school owner.",
          ],
        },
      ],
      relatedTitle: "Related pages",
      relatedLinks: [
        { href: "/school/privacy", label: "Privacy for schools" },
        { href: "/school/subprocessors", label: "Sub-processors" },
        { href: "/school/data-rights", label: "Access, deletion and correction" },
      ],
    };
  }

  if (locale === "pt") {
    return {
      back: "Voltar para privacidade escolar",
      eyebrow: "Modelo / rascunho",
      title: "Acordo de tratamento de dados para escolas",
      lead: "Um primeiro modelo com os pontos que uma escola e a 321school devem esclarecer antes de uso escolar mais amplo.",
      updated: "Versão rascunho. Atualizado em: 9 de agosto de 2026.",
      warning: "Este não é um contrato jurídico final assinado. Escolas devem revisar com sua administração, responsável de TI/privacidade ou assessor jurídico antes do uso.",
      sections: [
        {
          title: "Partes e papéis",
          body: "A escola ou mantenedora normalmente é a controladora no uso escolar. A 321school atua como operadora/processadora ao tratar dados pessoais em nome da escola.",
          points: [
            "Controladora: escola ou mantenedora.",
            "Operadora/processadora: 321school.",
            "Usuários: professores, alunos, pais/responsáveis e administradores escolares quando relevante.",
          ],
        },
        {
          title: "Finalidade",
          body: "Dados pessoais são tratados para fornecer atividades digitais de aprendizagem, Spaces, tarefas, feedback, administração e suporte relacionado.",
          points: [
            "Dar acesso a salas, tarefas, quizzes e atividades de aprendizagem.",
            "Permitir que professores acompanhem o trabalho dos alunos.",
            "Apoiar conta, cobrança e administração escolar quando ativado.",
          ],
        },
        {
          title: "Feide e autenticação",
          body: "Quando o login com Feide é usado, Feide e o provedor de identidade conectado autenticam o usuário. A 321school recebe as informações de identidade necessárias para criar e manter o acesso ao serviço.",
          points: [
            "A aprovação do Feide pela mantenedora permite que seus usuários entrem; isso não cria por si só um contrato escolar pago.",
            "A 321school trata dados de identidade de login apenas para acesso à conta, segurança, suporte e administração escolar documentada.",
            "A 321school não solicita número de identificação nacional para uso comum.",
          ],
        },
        {
          title: "Categorias de dados",
          body: "As categorias dependem de como a escola usa a 321school.",
          points: [
            "Spaces anônimos: ID técnico de usuário, nome exibido, participação na sala e trabalho enviado.",
            "Contas: nome, e-mail quando disponível, função, perfil, provedor de login, trabalho salvo, feedback e atividade necessária para o serviço.",
            "Professor/escola: salas, tarefas, conteúdo gerado, administração e informações de suporte.",
          ],
        },
        {
          title: "Sem revenda comercial ou publicidade",
          body: "A 321school não trata dados escolares para venda de dados pessoais, publicidade de terceiros ou publicidade direcionada.",
          points: [
            "Trabalho de alunos e dados de perfil não são vendidos.",
            "Dados escolares não são usados para criar perfis publicitários.",
            "Dados pessoais são tratados para as finalidades documentadas do serviço e conforme o acordo com a escola/mantenedora.",
          ],
        },
        {
          title: "IA e uso por alunos",
          body: "Alunos em Spaces normalmente não usam IA diretamente. Alunos conectados podem usar recursos de IA em estudo individual quando conta e tais funções foram aprovadas.",
          points: [
            "Professores podem usar IA para criar ou adaptar conteúdo antes de compartilhar.",
            "O uso de IA deve ser avaliado pela escola antes de uso sistemático com alunos.",
            "Para crianças menores de 13 anos, conta e recursos de IA devem ser esclarecidos pela escola ou responsáveis.",
          ],
        },
        {
          title: "Subprocessadores",
          body: "A 321school pode usar subprocessadores para hospedagem, autenticação, armazenamento, IA, pagamento e e-mail.",
          points: [
            "Uma visão atual dos subprocessadores deve estar disponível para a escola.",
            "A 321school deve notificar escolas sobre mudanças materiais quando exigido pelo acordo.",
            "Subprocessadores devem ser usados apenas para finalidades documentadas do serviço.",
          ],
        },
        {
          title: "Exclusão e devolução",
          body: "Quando o uso escolar termina, dados pessoais devem ser excluídos ou devolvidos conforme instruções da escola, salvo quando lei ou registros necessários do serviço exigirem armazenamento contínuo.",
          points: [
            "Professores podem remover ou arquivar alunos de Spaces.",
            "Escolas podem solicitar exclusão de dados relacionados à escola.",
            "Backups e logs técnicos podem seguir ciclos próprios de retenção.",
          ],
        },
        {
          title: "Segurança e confidencialidade",
          body: "A 321school deve usar medidas técnicas e organizacionais adequadas para proteger dados pessoais.",
          points: [
            "Controle de acesso por papéis de usuário.",
            "Autenticação segura pelo provedor de identidade em uso.",
            "Logs e monitoramento adequados para operação do serviço.",
            "Login com Feide quando ativado pela mantenedora.",
          ],
        },
      ],
      relatedTitle: "Páginas relacionadas",
      relatedLinks: [
        { href: "/school/privacy", label: "Privacidade para escolas" },
        { href: "/school/subprocessors", label: "Subprocessadores" },
        { href: "/school/data-rights", label: "Acesso, exclusão e correção" },
      ],
    };
  }

  return {
    back: "Tilbake til skolepersonvern",
    eyebrow: "Mal / foreløpig versjon",
    title: "Databehandleravtale for skoler",
    lead: "En første mal som viser punktene en skole og 321school bør avklare før bredere skolebruk.",
    updated: "Utkast. Sist oppdatert: 9. august 2026.",
    warning: "Dette er ikke en ferdig signert juridisk avtale. Skoler bør gjennomgå den med administrasjon, IKT/personvernansvarlig eller juridisk rådgiver før bruk.",
    sections: [
      {
        title: "Parter og roller",
        body: "Skolen eller skoleeier er normalt behandlingsansvarlig ved skolebruk. 321school er databehandler når personopplysninger behandles på vegne av skolen.",
        points: [
          "Behandlingsansvarlig: skole eller skoleeier.",
          "Databehandler: 321school.",
          "Brukere: lærere, elever, foreldre/foresatte og skoleadministratorer der det er relevant.",
        ],
      },
      {
        title: "Formål",
        body: "Personopplysninger behandles for å levere digitale læringsaktiviteter, Spaces, oppgaver, tilbakemelding, administrasjon og tilhørende support.",
        points: [
          "Gi tilgang til rom, oppgaver, quiz og læringsaktiviteter.",
          "La lærere følge opp elevarbeid.",
          "Støtte konto, betaling og skoleadministrasjon der dette er aktivert.",
        ],
      },
      {
        title: "Feide og autentisering",
        body: "Når Feide-innlogging brukes, autentiserer Feide og tilknyttet identitetsleverandør brukeren. 321school mottar identitetsinformasjonen som trengs for å opprette og opprettholde tilgang til tjenesten.",
        points: [
          "Feide-godkjenning fra skoleeier lar deres brukere logge inn; det oppretter ikke i seg selv en betalt skoleavtale.",
          "321school behandler innloggingsidentitet kun for kontotilgang, sikkerhet, support og dokumentert skoleadministrasjon.",
          "321school ber ikke om fødselsnummer for ordinær bruk.",
        ],
      },
      {
        title: "Kategorier av data",
        body: "Kategoriene avhenger av hvordan skolen bruker 321school.",
        points: [
          "Anonyme Spaces: teknisk bruker-ID, visningsnavn, romtilknytning og innsendt arbeid.",
          "Kontoer: navn, e-post der det er tilgjengelig, rolle, profil, innloggingsleverandør, lagret arbeid, tilbakemelding og aktivitet som trengs for tjenesten.",
          "Lærer/skole: rom, oppgaver, generert innhold, administrasjon og supportinformasjon.",
        ],
      },
      {
        title: "Ingen kommersiell videresalg eller reklame",
        body: "321school behandler ikke skoledata for salg av personopplysninger, tredjepartsannonsering eller målrettet reklame.",
        points: [
          "Elevarbeid og profildata selges ikke.",
          "Skoledata brukes ikke til å bygge reklameprofiler.",
          "Personopplysninger behandles for dokumenterte tjenesteformål og i tråd med avtale med skole/skoleeier.",
        ],
      },
      {
        title: "KI og elevbruk",
        body: "Elever i Spaces bruker normalt ikke KI direkte. Innloggede elever kan bruke KI-funksjoner i egenstudie når konto og slike funksjoner er avklart.",
        points: [
          "Lærere kan bruke KI til å lage eller tilpasse innhold før deling.",
          "KI-bruk bør vurderes av skolen før systematisk bruk med elever.",
          "For barn under 13 år bør konto og KI-funksjoner være avklart av skole eller foresatte.",
        ],
      },
      {
        title: "Underleverandører",
        body: "321school kan bruke underleverandører for hosting, innlogging, lagring, KI, betaling og e-post.",
        points: [
          "Oppdatert underleverandøroversikt bør være tilgjengelig for skolen.",
          "321school bør varsle skoler om vesentlige endringer der avtalen krever det.",
          "Underleverandører skal bare brukes til dokumenterte tjenesteformål.",
        ],
      },
      {
        title: "Sletting og tilbakelevering",
        body: "Når skolebruk avsluttes, bør personopplysninger slettes eller tilbakeleveres etter skolens instruks, med mindre lov eller nødvendige tjenestelogger krever videre lagring.",
        points: [
          "Lærere kan fjerne eller arkivere elever fra Spaces.",
          "Skoler kan be om sletting av skolerelaterte data.",
          "Sikkerhetskopier og tekniske logger kan ha egne lagringssykluser.",
        ],
      },
      {
        title: "Sikkerhet og konfidensialitet",
        body: "321school bør bruke egnede tekniske og organisatoriske tiltak for å beskytte personopplysninger.",
        points: [
          "Tilgangsstyring for brukerroller.",
          "Sikker autentisering via identitetsleverandøren som brukes.",
          "Logging og overvåking som er nødvendig for drift av tjenesten.",
          "Feide-innlogging der dette er aktivert av skoleeier.",
        ],
      },
    ],
    relatedTitle: "Relaterte sider",
    relatedLinks: [
      { href: "/school/privacy", label: "Personvern for skoler" },
      { href: "/school/subprocessors", label: "Underleverandører" },
      { href: "/school/data-rights", label: "Sletting, innsyn og retting" },
    ],
  };
}

export default async function SchoolDpaPage() {
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
          <Link href={localizedPath(locale, "/school/privacy")} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50">
            {text.back}
          </Link>
        </div>
      </header>

      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-6 py-12 md:py-16">
          <p className="inline-flex rounded-full bg-amber-50 px-4 py-2 text-sm font-bold text-amber-900">{text.eyebrow}</p>
          <h1 className="mt-5 text-4xl font-black tracking-tight md:text-6xl">{text.title}</h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-700">{text.lead}</p>
          <p className="mt-5 text-sm font-semibold text-slate-500">{text.updated}</p>
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950">{text.warning}</div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-6 py-8 md:grid-cols-2">
        {text.sections.map((section) => <InfoCard key={section.title} section={section} />)}
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-14">
        <div className="rounded-2xl bg-slate-950 p-6 text-white md:p-8">
          <h2 className="text-2xl font-black">{text.relatedTitle}</h2>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            {text.relatedLinks.map((link) => (
              <Link key={link.href} href={localizedPath(locale, link.href)} className="inline-flex justify-center rounded-xl border border-white/25 px-5 py-3 text-sm font-black text-white hover:bg-white/10">
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function InfoCard(props: { section: Section }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-black">{props.section.title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-700">{props.section.body}</p>
      <ul className="mt-4 grid gap-2">
        {props.section.points.map((point) => <li key={point} className="text-sm leading-6 text-slate-700">• {point}</li>)}
      </ul>
    </article>
  );
}
