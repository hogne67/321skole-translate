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
  sections: Section[];
  noteTitle: string;
  noteText: string;
};

function localizedPath(locale: string, path: string) {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${clean}`;
}

function copyFor(locale: string): Copy {
  if (locale === "en") {
    return {
      back: "Back to school privacy",
      eyebrow: "School privacy",
      title: "Access, deletion and correction",
      lead: "A practical routine for requests about student data, anonymous Spaces, accounts and school use.",
      updated: "First version. Last updated: 5 August 2026.",
      sections: [
        {
          title: "Who should receive the request?",
          body: "When 321school is used by a school, requests from students or guardians should normally go through the teacher or school first.",
          points: [
            "The school decides how the tool is used in teaching.",
            "The teacher can often identify the correct Space, assignment or student display name faster.",
            "321school can assist the school with technical deletion or access where needed.",
          ],
        },
        {
          title: "Anonymous Spaces",
          body: "Anonymous Spaces use a technical user ID and a display name chosen by the student. The student may not have a stable account across devices.",
          points: [
            "Teacher can remove or archive a student from a Space.",
            "If the student used several devices, several anonymous technical users may exist.",
            "Requests should include Space name/code, display name and approximate time of use when possible.",
          ],
        },
        {
          title: "Student accounts",
          body: "For signed-in students, data can be connected to the account and may include saved work, feedback and profile information.",
          points: [
            "Requests should include the account email or user ID if known.",
            "Deletion can affect saved work and access across devices.",
            "For children under 13, account use should be clarified with school or guardians.",
          ],
        },
        {
          title: "Response and follow-up",
          body: "The school should confirm the request and decide whether it concerns access, correction, deletion or restriction.",
          points: [
            "Correct obvious errors in display names or membership where appropriate.",
            "Delete or archive data that is no longer needed for the school purpose.",
            "Escalate technical requests to 321school when school tools cannot handle the request directly.",
          ],
        },
      ],
      noteTitle: "Working version",
      noteText: "This is a practical routine for early school use. A more formal process can be included in a data processing agreement when a school or school owner adopts 321school broadly.",
    };
  }

  if (locale === "pt") {
    return {
      back: "Voltar para privacidade escolar",
      eyebrow: "Privacidade escolar",
      title: "Acesso, exclusão e correção",
      lead: "Uma rotina prática para pedidos sobre dados de alunos, Spaces anônimos, contas e uso escolar.",
      updated: "Primeira versão. Atualizado em: 5 de agosto de 2026.",
      sections: [
        {
          title: "Quem deve receber o pedido?",
          body: "Quando a 321school é usada por uma escola, pedidos de alunos ou responsáveis normalmente devem passar primeiro pelo professor ou pela escola.",
          points: [
            "A escola decide como a ferramenta é usada no ensino.",
            "O professor normalmente consegue identificar mais rapidamente o Space, atividade ou nome exibido do aluno.",
            "A 321school pode ajudar a escola com exclusão técnica ou acesso quando necessário.",
          ],
        },
        {
          title: "Spaces anônimos",
          body: "Spaces anônimos usam um ID técnico de usuário e um nome escolhido pelo aluno. O aluno pode não ter uma conta estável em diferentes dispositivos.",
          points: [
            "O professor pode remover ou arquivar um aluno de um Space.",
            "Se o aluno usou vários dispositivos, podem existir vários usuários técnicos anônimos.",
            "Pedidos devem incluir nome/código do Space, nome exibido e período aproximado de uso quando possível.",
          ],
        },
        {
          title: "Contas de aluno",
          body: "Para alunos conectados, os dados podem estar ligados à conta e incluir trabalho salvo, feedback e informações de perfil.",
          points: [
            "Pedidos devem incluir e-mail da conta ou ID de usuário se conhecido.",
            "A exclusão pode afetar trabalho salvo e acesso em diferentes dispositivos.",
            "Para crianças menores de 13 anos, o uso de conta deve ser esclarecido com escola ou responsáveis.",
          ],
        },
        {
          title: "Resposta e acompanhamento",
          body: "A escola deve confirmar o pedido e decidir se ele trata de acesso, correção, exclusão ou restrição.",
          points: [
            "Corrigir erros evidentes em nomes exibidos ou participação quando apropriado.",
            "Excluir ou arquivar dados que não são mais necessários para a finalidade escolar.",
            "Encaminhar pedidos técnicos para a 321school quando as ferramentas da escola não resolverem diretamente.",
          ],
        },
      ],
      noteTitle: "Versão de trabalho",
      noteText: "Esta é uma rotina prática para uso escolar inicial. Um processo mais formal pode ser incluído em um acordo de tratamento de dados quando uma escola adotar a 321school de forma ampla.",
    };
  }

  return {
    back: "Tilbake til skolepersonvern",
    eyebrow: "Skolepersonvern",
    title: "Sletting, innsyn og retting",
    lead: "En praktisk rutine for forespørsler om elevdata, anonyme Spaces, kontoer og skolebruk.",
    updated: "Første versjon. Sist oppdatert: 5. august 2026.",
    sections: [
      {
        title: "Hvem bør få forespørselen?",
        body: "Når 321school brukes av en skole, bør forespørsler fra elever eller foresatte normalt gå via lærer eller skole først.",
        points: [
          "Skolen avgjør hvordan verktøyet brukes i undervisningen.",
          "Læreren kan ofte raskere finne riktig Space, oppgave eller visningsnavn.",
          "321school kan hjelpe skolen med teknisk sletting eller innsyn der det trengs.",
        ],
      },
      {
        title: "Anonyme Spaces",
        body: "Anonyme Spaces bruker en teknisk bruker-ID og et visningsnavn eleven selv skriver inn. Eleven har ikke nødvendigvis en stabil konto på tvers av enheter.",
        points: [
          "Lærer kan fjerne eller arkivere en elev fra et Space.",
          "Hvis eleven har brukt flere enheter, kan det finnes flere anonyme tekniske brukere.",
          "Forespørsler bør helst inneholde Space-navn/kode, visningsnavn og omtrent tidspunkt for bruk.",
        ],
      },
      {
        title: "Elevkontoer",
        body: "For innloggede elever kan data være knyttet til kontoen og omfatte lagret arbeid, tilbakemeldinger og profilinformasjon.",
        points: [
          "Forespørsler bør inneholde kontoens e-post eller bruker-ID hvis kjent.",
          "Sletting kan påvirke lagret arbeid og tilgang på tvers av enheter.",
          "For barn under 13 år bør kontobruk være avklart med skole eller foresatte.",
        ],
      },
      {
        title: "Svar og oppfølging",
        body: "Skolen bør bekrefte forespørselen og vurdere om den gjelder innsyn, retting, sletting eller begrensning.",
        points: [
          "Rett åpenbare feil i visningsnavn eller medlemskap der det passer.",
          "Slett eller arkiver data som ikke lenger trengs til skoleformålet.",
          "Send tekniske forespørsler videre til 321school når skolens verktøy ikke løser det direkte.",
        ],
      },
    ],
    noteTitle: "Arbeidsversjon",
    noteText: "Dette er en praktisk rutine for tidlig skolebruk. En mer formell prosess kan inngå i databehandleravtale når skole eller skoleeier tar 321school bredere i bruk.",
  };
}

export default async function SchoolDataRightsPage() {
  const locale = (await getLocale()) as string;
  const text = copyFor(locale);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <Header locale={locale} back={text.back} />
      <Hero eyebrow={text.eyebrow} title={text.title} lead={text.lead} updated={text.updated} />
      <section className="mx-auto grid max-w-6xl gap-4 px-6 py-8 md:grid-cols-2">
        {text.sections.map((section) => <InfoCard key={section.title} section={section} />)}
      </section>
      <Note title={text.noteTitle} text={text.noteText} />
    </main>
  );
}

function Header(props: { locale: string; back: string }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href={localizedPath(props.locale, "/")} className="flex items-center gap-3">
          <Image src="/logo321ny.png" alt="321school" width={38} height={38} priority className="h-9 w-auto object-contain" />
          <span className="text-lg font-black">321school</span>
        </Link>
        <Link href={localizedPath(props.locale, "/school/privacy")} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50">
          {props.back}
        </Link>
      </div>
    </header>
  );
}

function Hero(props: { eyebrow: string; title: string; lead: string; updated: string }) {
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-6xl px-6 py-12 md:py-16">
        <p className="inline-flex rounded-full bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800">{props.eyebrow}</p>
        <h1 className="mt-5 text-4xl font-black tracking-tight md:text-6xl">{props.title}</h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-700">{props.lead}</p>
        <p className="mt-5 text-sm font-semibold text-slate-500">{props.updated}</p>
      </div>
    </section>
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

function Note(props: { title: string; text: string }) {
  return (
    <section className="mx-auto max-w-6xl px-6 pb-14">
      <div className="rounded-2xl bg-slate-950 p-6 text-white md:p-8">
        <h2 className="text-2xl font-black">{props.title}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/80">{props.text}</p>
      </div>
    </section>
  );
}
