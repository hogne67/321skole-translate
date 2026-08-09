import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { CheckCircle2, Database, Eye, LockKeyhole, School, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { getLocale } from "next-intl/server";

type Copy = {
  back: string;
  eyebrow: string;
  title: string;
  lead: string;
  updated: string;
  cards: Array<{ title: string; text: string }>;
  sections: Array<{ title: string; body: string; points?: string[] }>;
  contactTitle: string;
  contactText: string;
  contactCta: string;
  subprocessorsCta: string;
  dataRightsCta: string;
  dpaCta: string;
};

function localizedPath(locale: string, path: string) {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${clean}`;
}

function copyFor(locale: string): Copy {
  if (locale === "en") {
    return {
      back: "Back to schools",
      eyebrow: "Schools, students and privacy",
      title: "Privacy for schools",
      lead: "How 321school works with safe school use, anonymous student access, accounts and AI features.",
      updated: "Working version for school assessment. Last updated: 9 August 2026.",
      cards: [
        { title: "Anonymous access first", text: "Students can join Spaces with a code or QR code without email, account or national identity number." },
        { title: "Feide-supported login", text: "Schools and school owners can allow users to sign in through Feide when they approve the service." },
        { title: "School-controlled use", text: "In school use, the school should know which digital tools are used with students." },
        { title: "No direct AI in Spaces", text: "Students in Spaces normally answer teacher-controlled activities, not AI directly." },
      ],
      sections: [
        {
          title: "Roles in school use",
          body: "The school or school owner is normally responsible for deciding which digital learning tools are used in teaching. 321school provides the tool and should be assessed by the school before systematic use with students.",
          points: [
            "The teacher controls rooms, activities and shared content.",
            "Students join with code/QR or with an account when approved.",
            "Parents/guardians can receive information from the school or teacher about how the room is used.",
          ],
        },
        {
          title: "Feide and school-controlled access",
          body: "321school supports Feide login through OpenID Connect. Feide makes login easier and more controlled for schools, but it does not replace the school's privacy assessment of the service.",
          points: [
            "A school owner can approve or deny whether its users may sign in to 321school with Feide.",
            "Feide approval only opens login; it does not create a paid school agreement or give extended school administration features by itself.",
            "When a user signs in with Feide, 321school receives standard login identity data through Firebase, such as technical user ID, name and email if available.",
            "321school does not request national identity numbers for ordinary use.",
          ],
        },
        {
          title: "Anonymous access in Spaces",
          body: "Anonymous access is designed for low-friction classroom use. A student can join a Space without email and without creating a personal account.",
          points: [
            "The teacher can see the name the student enters and the work done in the Space.",
            "321school does not require national identity numbers or private email addresses for anonymous student participation in Spaces.",
            "Anonymous access is usually remembered only on the same device and browser.",
            "Changing device, private browsing, sign-out or clearing browser data may create a new anonymous technical user.",
            "Anonymous work is not saved to a personal account or available across devices.",
          ],
        },
        {
          title: "Accounts and children under 13",
          body: "Accounts give more continuity, but they also mean more persistent processing. For children under 13, we recommend anonymous access in Spaces unless the school or guardians have approved account use.",
          points: [
            "With an account, work can be saved and used across devices.",
            "For school use, account use should be clarified by the school, also for older students.",
            "Students should not be asked to use a private email address if the school has not approved account use.",
          ],
        },
        {
          title: "AI in 321school",
          body: "In Spaces, students normally do not use AI directly. Students answer content shared by the teacher, and the teacher controls the activity. Teachers may have used AI to create or adapt learning content before sharing it.",
          points: [
            "Teachers must review and approve generated or pasted text before tasks are created from it.",
            "Only teachers can choose to publish learning content to the public library, and published content is tied to the teacher's name.",
            "321school shows warnings where AI use or privacy risk may require extra attention, for example around student names, images and AI feedback.",
            "Data sent to OpenAI through the API is not used to train or improve OpenAI models unless explicit opt-in has been enabled. OpenAI may process and temporarily retain necessary technical logs for safety and abuse prevention under its API data terms.",
            "Signed-in students can use AI features in self-study, for example feedback on their own answers or generating practice tasks.",
            "For children under 13, account use and AI features should be clarified by the school or guardians.",
            "Schools should assess AI use before using it systematically with students.",
          ],
        },
        {
          title: "What may be stored",
          body: "The exact data depends on how 321school is used. The principle is to keep student participation as limited as possible, especially in anonymous Spaces.",
          points: [
            "Anonymous Spaces: room membership, selected display name, technical user ID and work submitted in the room.",
            "Student account: profile data, saved work, feedback and activity needed to provide the service.",
            "Teacher account: rooms, assignments, generated content and administration data.",
          ],
        },
        {
          title: "No sale or advertising use",
          body: "321school is not built around advertising, sale of user data or profiling of children for commercial purposes.",
          points: [
            "321school does not sell personal data.",
            "321school does not use student work or profile data for third-party advertising or targeted advertising.",
            "Data is processed to provide the learning service, support, security, billing where relevant and documented school administration.",
          ],
        },
        {
          title: "Deletion and access",
          body: "Students, parents and schools may need access, correction or deletion. Requests should normally go through the teacher or school when the use happens in school.",
          points: [
            "Teachers can remove or archive students from Spaces.",
            "School-related deletion requests should be handled with the school as the responsible party.",
            "More formal routines for data processing agreements, sub-processors and school administration will be expanded as school use grows.",
          ],
        },
      ],
      contactTitle: "For school assessment",
      contactText: "This page is a practical overview. Schools that want to use 321school more broadly should ask for a data processing agreement, sub-processor overview and routines for access/deletion.",
      contactCta: "Request school access",
      subprocessorsCta: "View sub-processors",
      dataRightsCta: "Access and deletion",
      dpaCta: "DPA template",
    };
  }

  if (locale === "pt") {
    return {
      back: "Voltar para escolas",
      eyebrow: "Escolas, alunos e privacidade",
      title: "Privacidade para escolas",
      lead: "Como a 321school trabalha com uso seguro na escola, acesso anônimo, contas e recursos de IA.",
      updated: "Versão de trabalho para avaliação escolar. Atualizado em: 9 de agosto de 2026.",
      cards: [
        { title: "Acesso anônimo primeiro", text: "Alunos podem entrar em Spaces com código ou QR sem e-mail, conta ou número de identificação nacional." },
        { title: "Login com Feide", text: "Escolas e mantenedoras podem permitir login por Feide quando aprovam o serviço." },
        { title: "Uso controlado pela escola", text: "No uso escolar, a escola deve saber quais ferramentas digitais são usadas com alunos." },
        { title: "Sem IA direta em Spaces", text: "Em Spaces, alunos normalmente respondem atividades controladas pelo professor, não IA diretamente." },
      ],
      sections: [
        {
          title: "Papéis no uso escolar",
          body: "A escola ou mantenedora normalmente é responsável por decidir quais ferramentas digitais de aprendizagem são usadas no ensino. A 321school fornece a ferramenta e deve ser avaliada pela escola antes do uso sistemático com alunos.",
          points: [
            "O professor controla salas, atividades e conteúdo compartilhado.",
            "Alunos entram com código/QR ou com conta quando isso foi aprovado.",
            "Pais/responsáveis podem receber informações da escola ou do professor sobre o uso da sala.",
          ],
        },
        {
          title: "Feide e acesso controlado pela escola",
          body: "A 321school oferece login com Feide via OpenID Connect. Feide torna o login mais simples e mais controlado para escolas, mas não substitui a avaliação de privacidade da própria escola sobre o serviço.",
          points: [
            "A mantenedora pode aprovar ou negar se seus usuários podem entrar na 321school com Feide.",
            "A aprovação no Feide apenas libera o login; ela não cria contrato escolar pago nem recursos ampliados de administração escolar por si só.",
            "Quando o usuário entra com Feide, a 321school recebe dados padrão de identidade via Firebase, como ID técnico, nome e e-mail quando disponível.",
            "A 321school não solicita número de identificação nacional para uso comum.",
          ],
        },
        {
          title: "Acesso anônimo em Spaces",
          body: "O acesso anônimo foi criado para uso simples em sala de aula. O aluno pode entrar em um Space sem e-mail e sem criar uma conta pessoal.",
          points: [
            "O professor pode ver o nome informado pelo aluno e o trabalho feito no Space.",
            "A 321school não exige número de identificação nacional nem e-mail particular para participação anônima de alunos em Spaces.",
            "O acesso anônimo normalmente é lembrado apenas no mesmo dispositivo e navegador.",
            "Trocar de dispositivo, usar navegação privada, sair da conta ou limpar dados do navegador pode criar um novo usuário técnico anônimo.",
            "O trabalho anônimo não é salvo em uma conta pessoal nem fica disponível em diferentes dispositivos.",
          ],
        },
        {
          title: "Contas e crianças menores de 13 anos",
          body: "Contas dão mais continuidade, mas também significam tratamento mais persistente de dados. Para crianças menores de 13 anos, recomendamos acesso anônimo em Spaces, salvo quando a escola ou os responsáveis tiverem autorizado conta.",
          points: [
            "Com conta, o trabalho pode ser salvo e usado em diferentes dispositivos.",
            "No uso escolar, o uso de conta deve ser esclarecido pela escola, também para alunos mais velhos.",
            "Alunos não devem ser orientados a usar e-mail particular se a escola não aprovou o uso de conta.",
          ],
        },
        {
          title: "IA na 321school",
          body: "Em Spaces, alunos normalmente não usam IA diretamente. Eles respondem conteúdo compartilhado pelo professor, e o professor controla a atividade. O professor pode ter usado IA para criar ou adaptar conteúdo antes de compartilhá-lo.",
          points: [
            "Professores devem revisar e aprovar textos gerados ou colados antes que atividades sejam criadas a partir deles.",
            "Somente professores podem escolher publicar conteúdo pedagógico na biblioteca pública, e o conteúdo publicado fica vinculado ao nome do professor.",
            "A 321school mostra avisos nos pontos em que IA ou privacidade podem exigir atenção extra, por exemplo nomes de alunos, imagens e feedback de IA.",
            "Dados enviados à OpenAI pela API não são usados para treinar ou melhorar modelos da OpenAI, salvo se uma autorização explícita tiver sido ativada. A OpenAI pode tratar e reter temporariamente logs técnicos necessários para segurança e prevenção de abuso conforme seus termos de dados da API.",
            "Alunos conectados podem usar recursos de IA em estudo individual, por exemplo feedback sobre respostas próprias ou geração de atividades de prática.",
            "Para crianças menores de 13 anos, conta e recursos de IA devem ser esclarecidos pela escola ou responsáveis.",
            "Escolas devem avaliar o uso de IA antes de usá-la sistematicamente com alunos.",
          ],
        },
        {
          title: "O que pode ser armazenado",
          body: "Os dados exatos dependem de como a 321school é usada. O princípio é manter a participação do aluno o mais limitada possível, especialmente em Spaces anônimos.",
          points: [
            "Spaces anônimos: participação na sala, nome escolhido, ID técnico de usuário e trabalho enviado na sala.",
            "Conta de aluno: dados de perfil, trabalho salvo, feedback e atividade necessária para fornecer o serviço.",
            "Conta de professor: salas, tarefas, conteúdo gerado e dados de administração.",
          ],
        },
        {
          title: "Sem venda ou uso publicitário",
          body: "A 321school não é construída sobre publicidade, venda de dados de usuários ou perfilamento de crianças para fins comerciais.",
          points: [
            "A 321school não vende dados pessoais.",
            "A 321school não usa trabalho de alunos ou dados de perfil para publicidade de terceiros ou publicidade direcionada.",
            "Os dados são tratados para fornecer o serviço de aprendizagem, suporte, segurança, cobrança quando relevante e administração escolar documentada.",
          ],
        },
        {
          title: "Exclusão e acesso",
          body: "Alunos, responsáveis e escolas podem precisar de acesso, correção ou exclusão. Pedidos normalmente devem passar pelo professor ou pela escola quando o uso acontece no contexto escolar.",
          points: [
            "Professores podem remover ou arquivar alunos de Spaces.",
            "Pedidos escolares de exclusão devem ser tratados com a escola como responsável.",
            "Rotinas formais para acordo de tratamento de dados, subprocessadores e administração escolar serão ampliadas à medida que o uso escolar crescer.",
          ],
        },
      ],
      contactTitle: "Para avaliação da escola",
      contactText: "Esta página é uma visão prática. Escolas que desejam usar a 321school de forma mais ampla devem solicitar acordo de tratamento de dados, visão de subprocessadores e rotinas de acesso/exclusão.",
      contactCta: "Solicitar acesso escolar",
      subprocessorsCta: "Ver subprocessadores",
      dataRightsCta: "Acesso e exclusão",
      dpaCta: "Modelo de acordo",
    };
  }

  return {
    back: "Tilbake til skolesiden",
    eyebrow: "Skoler, elever og personvern",
    title: "Personvern for skoler",
    lead: "Slik jobber 321school med trygg skolebruk, anonym elevtilgang, kontoer og KI-funksjoner.",
    updated: "Arbeidsversjon for skolevurdering. Sist oppdatert: 9. august 2026.",
    cards: [
      { title: "Anonym tilgang først", text: "Elever kan bli med i Spaces med kode eller QR uten e-post, konto eller fødselsnummer." },
      { title: "Feide-støttet innlogging", text: "Skoler og skoleeiere kan åpne for innlogging med Feide når de godkjenner tjenesten." },
      { title: "Skolen styrer bruken", text: "Ved skolebruk bør skolen vite hvilke digitale verktøy som brukes med elever." },
      { title: "Ikke direkte KI i Spaces", text: "I Spaces svarer elever normalt på lærerstyrte aktiviteter, ikke direkte til KI." },
    ],
    sections: [
      {
        title: "Roller i skolebruk",
        body: "Skolen eller skoleeier er normalt ansvarlig for å avgjøre hvilke digitale læringsverktøy som brukes i undervisningen. 321school leverer verktøyet og bør vurderes av skolen før systematisk bruk med elever.",
        points: [
          "Lærer styrer rom, aktiviteter og innhold som deles.",
          "Elever blir med med kode/QR eller med konto når det er avklart.",
          "Foreldre/foresatte kan få informasjon fra skolen eller læreren om hvordan rommet brukes.",
        ],
      },
      {
        title: "Feide og skolestyrt tilgang",
        body: "321school støtter Feide-innlogging via OpenID Connect. Feide gjør innlogging enklere og mer kontrollert for skoler, men erstatter ikke skolens vurdering av selve tjenesten.",
        points: [
          "Skoleeier kan godkjenne eller nekte om deres brukere får logge inn i 321school med Feide.",
          "Feide-godkjenning åpner bare for innlogging; den oppretter ikke en betalt skoleavtale eller utvidet skoleadministrasjon i seg selv.",
          "Når en bruker logger inn med Feide, mottar 321school standard innloggingsdata via Firebase, som teknisk bruker-ID, navn og e-post hvis tilgjengelig.",
          "321school ber ikke om fødselsnummer for ordinær bruk.",
        ],
      },
      {
        title: "Anonym tilgang i Spaces",
        body: "Anonym tilgang er laget for lav terskel i klasserommet. Eleven kan bli med i et Space uten e-post og uten å opprette personlig konto.",
        points: [
          "Læreren kan se navnet eleven skriver inn og arbeidet som gjøres i rommet.",
          "321school krever ikke fødselsnummer eller privat e-post for anonym elevdeltakelse i Spaces.",
          "Anonym tilgang huskes vanligvis bare på samme enhet og nettleser.",
          "Bytte av enhet, privat nettlesing, utlogging eller sletting av nettleserdata kan gi en ny anonym teknisk bruker.",
          "Anonymt arbeid lagres ikke i en personlig konto og er ikke tilgjengelig på tvers av enheter.",
        ],
      },
      {
        title: "Konto og barn under 13 år",
        body: "Konto gir mer kontinuitet, men innebærer også mer varig behandling. For barn under 13 år anbefaler vi anonym tilgang i Spaces, med mindre skolen eller foresatte har avklart bruk av konto.",
        points: [
          "Med konto kan arbeid lagres og brukes på tvers av enheter.",
          "Ved skolebruk bør kontobruk være avklart med skolen, også for eldre elever.",
          "Elever bør ikke bes om å bruke privat e-post hvis skolen ikke har åpnet for konto.",
        ],
      },
      {
        title: "KI i 321school",
        body: "I Spaces bruker elever normalt ikke KI direkte. Elever svarer på innhold som lærer har delt, og lærer styrer aktiviteten. Lærer kan ha brukt KI for å lage eller tilpasse læringsinnhold før det deles.",
        points: [
          "Lærer må lese gjennom og godkjenne generert eller innlimt tekst før det lages oppgaver fra teksten.",
          "Kun lærere kan velge å publisere læringsinnhold i det åpne biblioteket, og publisert innhold knyttes til lærerens navn.",
          "321school viser advarsler i arbeidsflyten der KI eller personvern kan kreve ekstra oppmerksomhet, for eksempel ved elevnavn, bilder og KI-tilbakemelding.",
          "Data som sendes til OpenAI via API brukes ikke til å trene eller forbedre OpenAI-modeller med mindre dette er eksplisitt aktivert. OpenAI kan behandle og midlertidig lagre nødvendige tekniske logger for sikkerhet og misbruksforebygging i tråd med sine API-datavilkår.",
          "Innloggede elever/studenter kan i egenstudie bruke KI-funksjoner, for eksempel tilbakemelding på egne svar eller generering av øvingsoppgaver.",
          "For barn under 13 år bør konto og KI-funksjoner være avklart av skolen eller foresatte.",
          "Skoler bør vurdere KI-bruk før systematisk bruk med elever.",
        ],
      },
      {
        title: "Hva kan lagres",
        body: "Hvilke data som lagres avhenger av hvordan 321school brukes. Prinsippet er å holde elevdeltakelse så begrenset som mulig, særlig i anonyme Spaces.",
        points: [
          "Anonyme Spaces: romtilknytning, valgt visningsnavn, teknisk bruker-ID og arbeid som leveres i rommet.",
          "Elevkonto: profildata, lagret arbeid, tilbakemelding og aktivitet som trengs for å levere tjenesten.",
          "Lærerkonto: rom, oppgaver, generert innhold og administrasjonsdata.",
        ],
      },
      {
        title: "Ingen salg eller reklamebruk",
        body: "321school er ikke bygget rundt reklame, salg av brukerdata eller profilering av barn for kommersielle formål.",
        points: [
          "321school selger ikke personopplysninger.",
          "321school bruker ikke elevarbeid eller profildata til tredjepartsannonsering eller målrettet reklame.",
          "Data behandles for å levere læringstjenesten, support, sikkerhet, betaling der det er relevant og dokumentert skoleadministrasjon.",
        ],
      },
      {
        title: "Sletting og innsyn",
        body: "Elever, foresatte og skoler kan ha behov for innsyn, retting eller sletting. Ved skolebruk bør slike forespørsler normalt gå via lærer eller skole.",
        points: [
          "Lærere kan fjerne eller arkivere elever fra Spaces.",
          "Skolerelaterte sletteønsker bør håndteres med skolen som ansvarlig part.",
          "Mer formelle rutiner for databehandleravtale, underleverandører og skoleadministrasjon utvides etter hvert som skolebruk vokser.",
        ],
      },
    ],
    contactTitle: "For skolevurdering",
    contactText: "Denne siden er en praktisk oversikt. Skoler som ønsker bredere bruk av 321school bør be om databehandleravtale, oversikt over underleverandører og rutiner for innsyn/sletting.",
    contactCta: "Be om skoletilgang",
    subprocessorsCta: "Se underleverandører",
    dataRightsCta: "Sletting og innsyn",
    dpaCta: "Databehandleravtale-mal",
  };
}

export default async function SchoolPrivacyPage() {
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
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-12 md:grid-cols-[1.1fr_0.9fr] md:items-center md:py-16">
          <div>
            <p className="inline-flex rounded-full bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800">
              {text.eyebrow}
            </p>
            <h1 className="mt-5 max-w-3xl text-4xl font-black tracking-tight md:text-6xl">{text.title}</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-700">{text.lead}</p>
            <p className="mt-5 text-sm font-semibold text-slate-500">{text.updated}</p>
          </div>
          <div className="grid gap-3">
            {text.cards.map((card, index) => (
              <TrustCard key={card.title} icon={index === 0 ? <UserRound /> : index === 1 ? <LockKeyhole /> : index === 2 ? <School /> : <Sparkles />} title={card.title} text={card.text} />
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-6 py-8 md:grid-cols-2">
        {text.sections.map((section, index) => (
          <InfoSection
            key={section.title}
            icon={index === 0 ? <School /> : index === 1 ? <LockKeyhole /> : index === 2 ? <ShieldCheck /> : index === 3 ? <LockKeyhole /> : index === 4 ? <Sparkles /> : index === 5 ? <Database /> : index === 6 ? <ShieldCheck /> : <Eye />}
            title={section.title}
            body={section.body}
            points={section.points}
          />
        ))}
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-14">
        <div className="rounded-2xl bg-slate-950 p-6 text-white md:p-8">
          <h2 className="text-2xl font-black">{text.contactTitle}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/80">{text.contactText}</p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Link href={localizedPath(locale, "/skoler/bestilling")} className="inline-flex justify-center rounded-xl bg-white px-5 py-3 text-sm font-black text-slate-950 hover:bg-slate-100">
              {text.contactCta}
            </Link>
            <Link href={localizedPath(locale, "/school/subprocessors")} className="inline-flex justify-center rounded-xl border border-white/25 px-5 py-3 text-sm font-black text-white hover:bg-white/10">
              {text.subprocessorsCta}
            </Link>
            <Link href={localizedPath(locale, "/school/data-rights")} className="inline-flex justify-center rounded-xl border border-white/25 px-5 py-3 text-sm font-black text-white hover:bg-white/10">
              {text.dataRightsCta}
            </Link>
            <Link href={localizedPath(locale, "/school/dpa")} className="inline-flex justify-center rounded-xl border border-white/25 px-5 py-3 text-sm font-black text-white hover:bg-white/10">
              {text.dpaCta}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function TrustCard(props: { icon: ReactNode; title: string; text: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <div className="flex items-start gap-3">
        <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-700 shadow-sm [&_svg]:h-5 [&_svg]:w-5">
          {props.icon}
        </div>
        <div>
          <h2 className="text-base font-black">{props.title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">{props.text}</p>
        </div>
      </div>
    </article>
  );
}

function InfoSection(props: { icon: ReactNode; title: string; body: string; points?: string[] }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-sky-700 [&_svg]:h-5 [&_svg]:w-5">
          {props.icon}
        </div>
        <div>
          <h2 className="text-xl font-black">{props.title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">{props.body}</p>
        </div>
      </div>
      {props.points?.length ? (
        <ul className="mt-4 grid gap-2">
          {props.points.map((point) => (
            <li key={point} className="flex gap-2 text-sm leading-6 text-slate-700">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
