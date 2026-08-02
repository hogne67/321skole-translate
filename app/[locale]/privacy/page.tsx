import Image from "next/image";
import Link from "next/link";
import { getLocale } from "next-intl/server";

const content = {
  nb: {
    back: "Til forsiden",
    eyebrow: "Personvern",
    title: "Personvernerklæring for 321skole",
    intro:
      "321skole behandler personopplysninger for å levere innlogging, læringsinnhold, elevtilknytning, kommunikasjon og nødvendig drift av tjenesten.",
    updated: "Sist oppdatert: 2. august 2026",
    controllerTitle: "Behandlingsansvarlig og kontakt",
    controllerText:
      "321skole drives av Fjord service. For spørsmål om personvern, innsyn, retting eller sletting kan du kontakte oss på post@321skole.no.",
    company: "Fjord service",
    org: "Org.nr. 968 400 789",
    address: "Røysegata 19, 6003 Ålesund",
    sections: [
      {
        title: "Hvilke opplysninger vi behandler",
        text:
          "Vi kan lagre opplysninger som navn, e-postadresse, rolle, land, tilknytning til klasserom, Spaces, kurs, læringsinnhold og brukeraktivitet som er nødvendig for å levere tjenesten.",
      },
      {
        title: "Hva opplysningene brukes til",
        text:
          "Opplysningene brukes til innlogging, sikkerhet, drift, læringsfunksjoner, deling av innhold, oppfølging av arbeid, kommunikasjon og forbedring av tjenesten. Opplysningene brukes ikke til andre formål enn drift, sikkerhet, forbedring av tjenesten og funksjoner brukeren selv tar i bruk.",
      },
      {
        title: "Skoler, lærere og elever",
        text:
          "Når en skole eller lærer bruker 321skole med elever, behandles opplysninger for å kunne gi tilgang til klasserom, oppgaver, innleveringer, tavle, feedback og annet læringsinnhold. Skolens bruk kan være regulert av egne avtaler og rutiner.",
      },
      {
        title: "Databehandlere og drift",
        text:
          "321skole kan bruke nødvendige leverandører for teknisk drift, innlogging, lagring, betaling, sikkerhet og kommunikasjon. Slike leverandører skal bare behandle opplysninger for å levere tjenesten og etter avtale.",
      },
      {
        title: "Lagring og sletting",
        text:
          "Vi lagrer opplysninger så lenge det er nødvendig for å levere tjenesten, oppfylle avtaler, ivareta sikkerhet eller følge lovpålagte krav. Du kan kontakte oss dersom du ønsker sletting, så langt det er forenlig med lovpålagte krav og skolens bruk av plattformen.",
      },
      {
        title: "Dine rettigheter",
        text:
          "Du kan be om innsyn, retting, sletting, begrensning eller dataportabilitet der regelverket gir rett til det. Du kan også protestere mot enkelte former for behandling. Vi må kunne bekrefte identiteten din før vi utleverer eller endrer opplysninger.",
      },
      {
        title: "Informasjonskapsler og lokal lagring",
        text:
          "Tjenesten kan bruke nødvendige informasjonskapsler og lokal lagring for innlogging, sikkerhet og grunnleggende funksjoner. Dette brukes for at tjenesten skal fungere i nettleseren.",
      },
    ],
    contactTitle: "Kontakt",
    contactText:
      "Har du spørsmål om personvern eller ønsker å bruke rettighetene dine, kan du kontakte oss på e-post.",
    emailButton: "Send e-post",
  },
  en: {
    back: "Back to front page",
    eyebrow: "Privacy",
    title: "Privacy Policy for 321school",
    intro:
      "321school processes personal data to provide login, learning content, learner connections, communication and the necessary operation of the service.",
    updated: "Last updated: August 2, 2026",
    controllerTitle: "Controller and contact",
    controllerText:
      "321school is operated by Fjord service. For questions about privacy, access, correction or deletion, contact us at post@321skole.no.",
    company: "Fjord service",
    org: "Company no. 968 400 789",
    address: "Røysegata 19, 6003 Ålesund, Norway",
    sections: [
      {
        title: "What data we process",
        text:
          "We may store information such as name, email address, role, country, connection to classrooms, Spaces, courses, learning content and user activity that is necessary to provide the service.",
      },
      {
        title: "How the data is used",
        text:
          "The data is used for login, security, operation, learning features, content sharing, follow-up of work, communication and service improvement. The data is not used for purposes other than operation, security, improvement of the service and features the user chooses to use.",
      },
      {
        title: "Schools, teachers and learners",
        text:
          "When a school or teacher uses 321school with learners, data is processed to provide access to classrooms, tasks, submissions, board activities, feedback and other learning content. School use may be governed by separate agreements and routines.",
      },
      {
        title: "Processors and operations",
        text:
          "321school may use necessary providers for technical operation, login, storage, payment, security and communication. Such providers must only process data to deliver the service and according to agreement.",
      },
      {
        title: "Storage and deletion",
        text:
          "We store data as long as necessary to provide the service, fulfil agreements, maintain security or comply with legal requirements. You may contact us if you want deletion, as far as this is compatible with legal requirements and the school's use of the platform.",
      },
      {
        title: "Your rights",
        text:
          "You may request access, correction, deletion, restriction or data portability where the law gives you that right. You may also object to certain types of processing. We must be able to confirm your identity before disclosing or changing data.",
      },
      {
        title: "Cookies and local storage",
        text:
          "The service may use necessary cookies and local storage for login, security and basic features. This is used so the service can function in the browser.",
      },
    ],
    contactTitle: "Contact",
    contactText:
      "If you have privacy questions or want to exercise your rights, you can contact us by email.",
    emailButton: "Send email",
  },
  pt: {
    back: "Voltar para a página inicial",
    eyebrow: "Privacidade",
    title: "Política de Privacidade da 321school",
    intro:
      "A 321school trata dados pessoais para fornecer login, conteúdo de aprendizagem, ligação com alunos, comunicação e funcionamento necessário do serviço.",
    updated: "Última atualização: 2 de agosto de 2026",
    controllerTitle: "Responsável e contato",
    controllerText:
      "A 321school é operada pela Fjord service. Para perguntas sobre privacidade, acesso, correção ou exclusão, entre em contato pelo e-mail post@321skole.no.",
    company: "Fjord service",
    org: "N.º da empresa 968 400 789",
    address: "Røysegata 19, 6003 Ålesund, Noruega",
    sections: [
      {
        title: "Quais dados tratamos",
        text:
          "Podemos armazenar informações como nome, endereço de e-mail, função, país, ligação a salas, Spaces, cursos, conteúdo de aprendizagem e atividade de uso necessária para fornecer o serviço.",
      },
      {
        title: "Como os dados são usados",
        text:
          "Os dados são usados para login, segurança, operação, recursos de aprendizagem, compartilhamento de conteúdo, acompanhamento de trabalho, comunicação e melhoria do serviço. Os dados não são usados para outros fins além de operação, segurança, melhoria do serviço e recursos que o usuário escolhe usar.",
      },
      {
        title: "Escolas, professores e alunos",
        text:
          "Quando uma escola ou professor usa a 321school com alunos, os dados são tratados para fornecer acesso a salas, atividades, entregas, quadro, feedback e outros conteúdos de aprendizagem. O uso escolar pode ser regulado por acordos e rotinas próprios.",
      },
      {
        title: "Operadores e funcionamento",
        text:
          "A 321school pode usar fornecedores necessários para operação técnica, login, armazenamento, pagamento, segurança e comunicação. Esses fornecedores devem tratar dados apenas para entregar o serviço e conforme acordo.",
      },
      {
        title: "Armazenamento e exclusão",
        text:
          "Armazenamos dados enquanto for necessário para fornecer o serviço, cumprir acordos, manter a segurança ou cumprir requisitos legais. Você pode entrar em contato se quiser solicitar exclusão, quando isso for compatível com requisitos legais e com o uso da plataforma pela escola.",
      },
      {
        title: "Seus direitos",
        text:
          "Você pode solicitar acesso, correção, exclusão, restrição ou portabilidade de dados quando a lei conceder esse direito. Você também pode se opor a certos tipos de tratamento. Precisamos confirmar sua identidade antes de divulgar ou alterar dados.",
      },
      {
        title: "Cookies e armazenamento local",
        text:
          "O serviço pode usar cookies necessários e armazenamento local para login, segurança e funções básicas. Isso é usado para que o serviço funcione no navegador.",
      },
    ],
    contactTitle: "Contato",
    contactText:
      "Se tiver perguntas sobre privacidade ou quiser exercer seus direitos, entre em contato por e-mail.",
    emailButton: "Enviar e-mail",
  },
} as const;

function getText(locale: string) {
  if (locale === "en" || locale === "pt") return content[locale];
  return content.nb;
}

export default async function PrivacyPage() {
  const locale = await getLocale();
  const t = getText(locale);

  return (
    <main className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-slate-50 text-slate-950">
      <div className="mx-auto max-w-5xl px-6 py-8 md:py-12">
        <Link href={`/${locale}`} className="text-sm font-semibold text-sky-700 hover:text-sky-900">
          {t.back}
        </Link>

        <section className="mt-8 rounded-[2rem] bg-white p-6 shadow-xl shadow-sky-900/10 ring-1 ring-slate-200 md:p-10">
          <Image
            src="/logo321ny.png"
            alt="321skole"
            width={180}
            height={56}
            className="h-auto w-44"
          />

          <p className="mt-8 inline-flex rounded-full bg-sky-100 px-4 py-2 text-sm font-semibold text-sky-800">
            {t.eyebrow}
          </p>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">{t.title}</h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-700">{t.intro}</p>
          <p className="mt-4 text-sm font-semibold text-slate-500">{t.updated}</p>

          <div className="mt-8 rounded-3xl bg-slate-950 p-6 text-white">
            <h2 className="text-xl font-semibold">{t.controllerTitle}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-white/80">{t.controllerText}</p>
            <dl className="mt-5 grid gap-4 text-sm text-white/80 md:grid-cols-3">
              <div>
                <dt className="font-semibold text-white">{t.company}</dt>
                <dd>{t.org}</dd>
              </div>
              <div>
                <dt className="font-semibold text-white">E-post</dt>
                <dd>
                  <a href="mailto:post@321skole.no" className="text-sky-200 hover:text-white">
                    post@321skole.no
                  </a>
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-white">Adresse</dt>
                <dd>{t.address}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="mt-6 grid gap-4">
          {t.sections.map((section) => (
            <article key={section.title} className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h2 className="text-xl font-semibold tracking-tight text-slate-950">{section.title}</h2>
              <p className="mt-3 text-sm leading-7 text-slate-700">{section.text}</p>
            </article>
          ))}
        </section>

        <section className="mt-6 rounded-3xl bg-sky-50 p-6 ring-1 ring-sky-100">
          <h2 className="text-xl font-semibold">{t.contactTitle}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-700">{t.contactText}</p>
          <a
            href="mailto:post@321skole.no"
            className="mt-5 inline-flex rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
          >
            {t.emailButton}
          </a>
        </section>
      </div>
    </main>
  );
}
