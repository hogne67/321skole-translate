import Image from "next/image";
import Link from "next/link";
import { getLocale } from "next-intl/server";

type Vendor = {
  name: string;
  purpose: string;
  data: string;
  status: string;
};

type Copy = {
  back: string;
  eyebrow: string;
  title: string;
  lead: string;
  updated: string;
  headers: {
    vendor: string;
    purpose: string;
    data: string;
    status: string;
  };
  vendors: Vendor[];
  notesTitle: string;
  notes: string[];
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
      title: "Sub-processors",
      lead: "Services that may process personal data when 321school is used. The list will be updated as the school product matures.",
      updated: "Last updated: 9 August 2026.",
      headers: { vendor: "Provider", purpose: "Used for", data: "Data that may be processed", status: "Status" },
      vendors: [
        { name: "Google / Firebase / Google Cloud", purpose: "Authentication, anonymous sign-in, database, file/image storage and backend services.", data: "Technical user ID, email for accounts, profile data, Spaces data, student work, files/images and technical logs.", status: "Active" },
        { name: "Sikt / Feide", purpose: "Feide login and school-owner controlled identity access when enabled.", data: "Login identity data such as technical identifiers, name, email where available, organization affiliation and authentication metadata handled through Feide.", status: "Active when Feide login is used" },
        { name: "Vercel", purpose: "Hosting, web application delivery and server functions.", data: "Technical request data such as IP address, browser/device data, logs and page requests.", status: "Active" },
        { name: "OpenAI", purpose: "AI features such as content generation, feedback, image generation, text tools and speech where enabled.", data: "Prompts, submitted text, generated content and context needed to provide the selected AI function.", status: "Active when AI features are used" },
        { name: "Stripe", purpose: "Payments, subscriptions, invoices and billing portal.", data: "Name, email, customer ID, subscription/payment metadata and billing information.", status: "Active for paid plans/orders" },
        { name: "Resend", purpose: "Transactional email, such as welcome messages and system emails.", data: "Email address, message content and delivery metadata.", status: "Active when email is sent" },
        { name: "Daily.co", purpose: "Live/video sessions in course features, if enabled.", data: "Participant identifiers, meeting/session metadata and technical connection data.", status: "Optional / if used" },
        { name: "YouTube / Google", purpose: "Instructional videos linked or embedded from the service.", data: "Technical data handled by YouTube/Google when videos are opened or played.", status: "Optional / if opened" },
      ],
      notesTitle: "Notes",
      notes: [
        "321school does not sell personal data.",
        "321school does not use third-party advertising or targeted advertising in school Spaces.",
        "Feide approval only enables login for users under the approving school owner. Paid school agreements and extended school administration are handled separately in 321school.",
        "Data sent to OpenAI through the API is not used to train or improve OpenAI models unless explicit opt-in has been enabled. Necessary technical logs may be processed and retained temporarily for safety and abuse prevention under OpenAI's API data terms.",
        "Code libraries used inside the app are not listed here unless they process data as an external service.",
        "Schools using 321school broadly should request a data processing agreement and a current sub-processor overview.",
      ],
    };
  }

  if (locale === "pt") {
    return {
      back: "Voltar para privacidade escolar",
      eyebrow: "Privacidade escolar",
      title: "Subprocessadores",
      lead: "Serviços que podem tratar dados pessoais quando a 321school é usada. A lista será atualizada à medida que o produto escolar amadurecer.",
      updated: "Atualizado em: 9 de agosto de 2026.",
      headers: { vendor: "Fornecedor", purpose: "Usado para", data: "Dados que podem ser tratados", status: "Status" },
      vendors: [
        { name: "Google / Firebase / Google Cloud", purpose: "Autenticação, login anônimo, banco de dados, armazenamento de arquivos/imagens e serviços de backend.", data: "ID técnico de usuário, e-mail em contas, perfil, dados de Spaces, trabalho do aluno, arquivos/imagens e logs técnicos.", status: "Ativo" },
        { name: "Sikt / Feide", purpose: "Login com Feide e acesso de identidade controlado pela mantenedora quando ativado.", data: "Dados de identidade de login, como identificadores técnicos, nome, e-mail quando disponível, vínculo organizacional e metadados de autenticação tratados via Feide.", status: "Ativo quando login com Feide é usado" },
        { name: "Vercel", purpose: "Hospedagem, entrega da aplicação web e funções de servidor.", data: "Dados técnicos de requisição, como IP, navegador/dispositivo, logs e páginas acessadas.", status: "Ativo" },
        { name: "OpenAI", purpose: "Recursos de IA como geração de conteúdo, feedback, geração de imagens, ferramentas de texto e fala quando ativados.", data: "Prompts, texto enviado, conteúdo gerado e contexto necessário para fornecer a função de IA escolhida.", status: "Ativo quando recursos de IA são usados" },
        { name: "Stripe", purpose: "Pagamentos, assinaturas, faturas e portal de cobrança.", data: "Nome, e-mail, ID de cliente, metadados de assinatura/pagamento e dados de cobrança.", status: "Ativo para planos/pedidos pagos" },
        { name: "Resend", purpose: "E-mails transacionais, como mensagens de boas-vindas e e-mails do sistema.", data: "Endereço de e-mail, conteúdo da mensagem e metadados de entrega.", status: "Ativo quando e-mail é enviado" },
        { name: "Daily.co", purpose: "Sessões ao vivo/vídeo em recursos de curso, se ativado.", data: "Identificadores de participantes, metadados de reunião/sessão e dados técnicos de conexão.", status: "Opcional / se usado" },
        { name: "YouTube / Google", purpose: "Vídeos instrutivos vinculados ou incorporados no serviço.", data: "Dados técnicos tratados pelo YouTube/Google quando vídeos são abertos ou reproduzidos.", status: "Opcional / se aberto" },
      ],
      notesTitle: "Observações",
      notes: [
        "A 321school não vende dados pessoais.",
        "A 321school não usa publicidade de terceiros ou publicidade direcionada em Spaces escolares.",
        "A aprovação no Feide apenas permite login para usuários da mantenedora que aprovou o serviço. Contratos escolares pagos e administração escolar ampliada são tratados separadamente na 321school.",
        "Dados enviados à OpenAI pela API não são usados para treinar ou melhorar modelos da OpenAI, salvo se uma autorização explícita tiver sido ativada. Logs técnicos necessários podem ser tratados e retidos temporariamente para segurança e prevenção de abuso conforme os termos de dados da API da OpenAI.",
        "Bibliotecas de código usadas dentro da aplicação não são listadas aqui, a menos que tratem dados como serviço externo.",
        "Escolas que usam a 321school de forma ampla devem solicitar acordo de tratamento de dados e visão atual dos subprocessadores.",
      ],
    };
  }

  return {
    back: "Tilbake til skolepersonvern",
    eyebrow: "Skolepersonvern",
    title: "Underleverandører",
    lead: "Tjenester som kan behandle personopplysninger når 321school brukes. Listen oppdateres etter hvert som skoleproduktet modnes.",
    updated: "Sist oppdatert: 9. august 2026.",
    headers: { vendor: "Leverandør", purpose: "Brukes til", data: "Data som kan behandles", status: "Status" },
    vendors: [
      { name: "Google / Firebase / Google Cloud", purpose: "Innlogging, anonym innlogging, database, fil-/bildelagring og backend-tjenester.", data: "Teknisk bruker-ID, e-post ved konto, profildata, Spaces-data, elevarbeid, filer/bilder og tekniske logger.", status: "Aktiv" },
      { name: "Sikt / Feide", purpose: "Feide-innlogging og skolestyrt identitetstilgang når dette er aktivert.", data: "Innloggingsidentitet som tekniske identifikatorer, navn, e-post der det er tilgjengelig, organisasjonstilhørighet og autentiseringsmetadata som behandles via Feide.", status: "Aktiv når Feide-innlogging brukes" },
      { name: "Vercel", purpose: "Hosting, levering av webapp og serverfunksjoner.", data: "Tekniske forespørselsdata som IP-adresse, nettleser/enhet, logger og sideforespørsler.", status: "Aktiv" },
      { name: "OpenAI", purpose: "KI-funksjoner som innholdsgenerering, tilbakemelding, bildegenerering, tekstverktøy og tale der dette er aktivert.", data: "Prompter, innsendt tekst, generert innhold og kontekst som trengs for å levere valgt KI-funksjon.", status: "Aktiv når KI-funksjoner brukes" },
      { name: "Stripe", purpose: "Betaling, abonnement, faktura og betalingsportal.", data: "Navn, e-post, kunde-ID, abonnements-/betalingsmetadata og fakturadata.", status: "Aktiv for betalte planer/bestillinger" },
      { name: "Resend", purpose: "Transaksjonell e-post, for eksempel velkomstmeldinger og systemmail.", data: "E-postadresse, e-postinnhold og leveringsmetadata.", status: "Aktiv når e-post sendes" },
      { name: "Daily.co", purpose: "Live-/videosesjoner i kursfunksjoner, hvis aktivert.", data: "Deltakeridentifikatorer, møte-/sesjonsmetadata og tekniske tilkoblingsdata.", status: "Valgfri / hvis brukt" },
      { name: "YouTube / Google", purpose: "Instruksjonsvideoer som lenkes til eller bygges inn i tjenesten.", data: "Tekniske data som håndteres av YouTube/Google når videoer åpnes eller spilles av.", status: "Valgfri / hvis åpnet" },
    ],
    notesTitle: "Merknader",
    notes: [
      "321school selger ikke personopplysninger.",
      "321school bruker ikke tredjepartsannonsering eller målrettet reklame i skole-Spaces.",
      "Feide-godkjenning åpner bare for innlogging for brukere under skoleeieren som godkjenner tjenesten. Betalt skoleavtale og utvidet skoleadministrasjon håndteres separat i 321school.",
      "Data som sendes til OpenAI via API brukes ikke til å trene eller forbedre OpenAI-modeller med mindre dette er eksplisitt aktivert. Nødvendige tekniske logger kan behandles og lagres midlertidig for sikkerhet og misbruksforebygging i tråd med OpenAIs API-datavilkår.",
      "Kodebiblioteker som brukes inne i appen listes ikke her, med mindre de behandler data som ekstern tjeneste.",
      "Skoler som bruker 321school bredt bør be om databehandleravtale og oppdatert underleverandøroversikt.",
    ],
  };
}

export default async function SchoolSubprocessorsPage() {
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
          <p className="inline-flex rounded-full bg-sky-50 px-4 py-2 text-sm font-bold text-sky-800">{text.eyebrow}</p>
          <h1 className="mt-5 text-4xl font-black tracking-tight md:text-6xl">{text.title}</h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-700">{text.lead}</p>
          <p className="mt-5 text-sm font-semibold text-slate-500">{text.updated}</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-8">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="hidden grid-cols-[1fr_1.2fr_1.3fr_0.8fr] gap-0 border-b border-slate-200 bg-slate-100 text-sm font-black text-slate-700 md:grid">
            <div className="p-4">{text.headers.vendor}</div>
            <div className="p-4">{text.headers.purpose}</div>
            <div className="p-4">{text.headers.data}</div>
            <div className="p-4">{text.headers.status}</div>
          </div>

          <div className="divide-y divide-slate-200">
            {text.vendors.map((vendor) => (
              <article key={vendor.name} className="grid gap-3 p-4 text-sm md:grid-cols-[1fr_1.2fr_1.3fr_0.8fr] md:gap-0">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-500 md:hidden">{text.headers.vendor}</div>
                  <div className="font-black text-slate-950">{vendor.name}</div>
                </div>
                <Cell label={text.headers.purpose}>{vendor.purpose}</Cell>
                <Cell label={text.headers.data}>{vendor.data}</Cell>
                <Cell label={text.headers.status}>{vendor.status}</Cell>
              </article>
            ))}
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black">{text.notesTitle}</h2>
          <ul className="mt-4 grid gap-2">
            {text.notes.map((note) => (
              <li key={note} className="text-sm leading-6 text-slate-700">• {note}</li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}

function Cell(props: { label: string; children: string }) {
  return (
    <div className="md:p-4 md:pt-0">
      <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-500 md:hidden">{props.label}</div>
      <div className="mt-1 leading-6 text-slate-700 md:mt-0">{props.children}</div>
    </div>
  );
}
