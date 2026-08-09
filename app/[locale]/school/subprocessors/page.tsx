import Image from "next/image";
import Link from "next/link";
import { getLocale } from "next-intl/server";

type Vendor = {
  name: string;
  purpose: string;
  data: string;
  location: string;
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
    location: string;
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
      headers: { vendor: "Provider", purpose: "Used for", data: "Data that may be processed", location: "Processing / storage location", status: "Status" },
      vendors: [
        { name: "Google Firebase Authentication", purpose: "Login, anonymous sign-in, Feide/OIDC handoff and account identity.", data: "Technical user ID, provider identifiers, email where available, authentication metadata and password hashes for email/password accounts.", location: "Firebase Authentication is run only from US data centers according to Firebase documentation. Transfers are covered by Google's Firebase data processing terms and SCCs where applicable.", status: "Active" },
        { name: "Google Cloud Firestore", purpose: "Database for profiles, Spaces, assignments, student work, usage records and app data.", data: "Profile data, Spaces data, student work, submissions, teacher content, school administration data and technical timestamps.", location: "europe-west1 (Belgium). Core Firestore data is stored at rest in this European region.", status: "Active" },
        { name: "Firebase Storage / Google Cloud Storage", purpose: "File and image storage where upload features are used.", data: "Uploaded files/images and related technical metadata.", location: "Active 321school bucket: 321skole-storage, EU multi-region.", status: "Active if file/image upload is used" },
        { name: "Sikt / Feide", purpose: "Feide login and school-owner controlled identity access when enabled.", data: "Login identity data such as technical identifiers, name, email where available, organization affiliation and authentication metadata handled through Feide.", location: "Norway / EEA-oriented Feide service operated by Sikt.", status: "Active when Feide login is used" },
        { name: "Vercel", purpose: "Hosting, web application delivery and server functions.", data: "Technical request data such as IP address, browser/device data, logs and page requests.", location: "Vercel infrastructure. Region/processing location to be confirmed in the final DPA.", status: "Active" },
        { name: "Google Analytics", purpose: "Aggregate product analytics where enabled.", data: "Page/event data, device/browser data and approximate location derived by Google Analytics. IP addresses are used at collection time and then discarded before logging in GA4 according to Google documentation.", location: "Google Analytics uses regional data collection and global Google infrastructure for processing.", status: "Active when analytics is enabled" },
        { name: "OpenAI", purpose: "AI features such as content generation, feedback, image generation, text tools and speech where enabled.", data: "Prompts, submitted text, generated content and context needed to provide the selected AI function.", location: "OpenAI API processing location depends on the active OpenAI data processing terms and settings. To be documented in the final DPA.", status: "Active when AI features are used" },
        { name: "Stripe", purpose: "Payments, subscriptions, invoices and billing portal.", data: "Name, email, customer ID, subscription/payment metadata and billing information.", location: "Stripe infrastructure. Only relevant for paid plans/orders.", status: "Active for paid plans/orders" },
        { name: "Resend", purpose: "Transactional email, such as welcome messages and system emails.", data: "Email address, message content and delivery metadata.", location: "Resend/email infrastructure. To be confirmed in the final sub-processor overview.", status: "Active when email is sent" },
        { name: "Daily.co", purpose: "Live/video sessions in course features, if enabled.", data: "Participant identifiers, meeting/session metadata and technical connection data.", location: "Daily infrastructure, only if live/video sessions are enabled.", status: "Optional / if used" },
        { name: "YouTube / Google", purpose: "Instructional videos linked or embedded from the service.", data: "Technical data handled by YouTube/Google when videos are opened or played.", location: "Google/YouTube infrastructure, only when external videos are opened.", status: "Optional / if opened" },
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
      headers: { vendor: "Fornecedor", purpose: "Usado para", data: "Dados que podem ser tratados", location: "Local de tratamento / armazenamento", status: "Status" },
      vendors: [
        { name: "Google Firebase Authentication", purpose: "Login, login anônimo, conexão Feide/OIDC e identidade de conta.", data: "ID técnico de usuário, identificadores de provedor, e-mail quando disponível, metadados de autenticação e hashes de senha para contas com e-mail/senha.", location: "Firebase Authentication opera apenas em data centers nos EUA segundo a documentação Firebase. Transferências são cobertas pelos termos de tratamento de dados Firebase do Google e SCCs quando aplicável.", status: "Ativo" },
        { name: "Google Cloud Firestore", purpose: "Banco de dados para perfis, Spaces, tarefas, trabalhos de alunos, registros de uso e dados da aplicação.", data: "Perfil, dados de Spaces, trabalho de alunos, entregas, conteúdo de professores, administração escolar e timestamps técnicos.", location: "europe-west1 (Bélgica). Dados principais do Firestore são armazenados em repouso nesta região europeia.", status: "Ativo" },
        { name: "Firebase Storage / Google Cloud Storage", purpose: "Armazenamento de arquivos e imagens quando recursos de upload são usados.", data: "Arquivos/imagens enviados e metadados técnicos relacionados.", location: "Bucket ativo da 321school: 321skole-storage, multi-região UE.", status: "Ativo se upload de arquivos/imagens for usado" },
        { name: "Sikt / Feide", purpose: "Login com Feide e acesso de identidade controlado pela mantenedora quando ativado.", data: "Dados de identidade de login, como identificadores técnicos, nome, e-mail quando disponível, vínculo organizacional e metadados de autenticação tratados via Feide.", location: "Noruega / serviço Feide voltado ao EEE operado pela Sikt.", status: "Ativo quando login com Feide é usado" },
        { name: "Vercel", purpose: "Hospedagem, entrega da aplicação web e funções de servidor.", data: "Dados técnicos de requisição, como IP, navegador/dispositivo, logs e páginas acessadas.", location: "Infraestrutura Vercel. Região/local de tratamento a confirmar no acordo final.", status: "Ativo" },
        { name: "Google Analytics", purpose: "Análise agregada do produto quando ativada.", data: "Dados de páginas/eventos, navegador/dispositivo e localização aproximada derivada pelo Google Analytics. IP é usado na coleta e depois descartado antes do registro no GA4 segundo a documentação Google.", location: "Google Analytics usa coleta regional e infraestrutura global do Google para processamento.", status: "Ativo quando analytics está ativado" },
        { name: "OpenAI", purpose: "Recursos de IA como geração de conteúdo, feedback, geração de imagens, ferramentas de texto e fala quando ativados.", data: "Prompts, texto enviado, conteúdo gerado e contexto necessário para fornecer a função de IA escolhida.", location: "Local de tratamento da API OpenAI depende dos termos e configurações ativos. A documentar no acordo final.", status: "Ativo quando recursos de IA são usados" },
        { name: "Stripe", purpose: "Pagamentos, assinaturas, faturas e portal de cobrança.", data: "Nome, e-mail, ID de cliente, metadados de assinatura/pagamento e dados de cobrança.", location: "Infraestrutura Stripe. Relevante apenas para planos/pedidos pagos.", status: "Ativo para planos/pedidos pagos" },
        { name: "Resend", purpose: "E-mails transacionais, como mensagens de boas-vindas e e-mails do sistema.", data: "Endereço de e-mail, conteúdo da mensagem e metadados de entrega.", location: "Infraestrutura Resend/e-mail. A confirmar na visão final de subprocessadores.", status: "Ativo quando e-mail é enviado" },
        { name: "Daily.co", purpose: "Sessões ao vivo/vídeo em recursos de curso, se ativado.", data: "Identificadores de participantes, metadados de reunião/sessão e dados técnicos de conexão.", location: "Infraestrutura Daily, apenas se sessões ao vivo/vídeo forem ativadas.", status: "Opcional / se usado" },
        { name: "YouTube / Google", purpose: "Vídeos instrutivos vinculados ou incorporados no serviço.", data: "Dados técnicos tratados pelo YouTube/Google quando vídeos são abertos ou reproduzidos.", location: "Infraestrutura Google/YouTube, apenas quando vídeos externos são abertos.", status: "Opcional / se aberto" },
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
    headers: { vendor: "Leverandør", purpose: "Brukes til", data: "Data som kan behandles", location: "Behandlings-/lagringssted", status: "Status" },
    vendors: [
      { name: "Google Firebase Authentication", purpose: "Innlogging, anonym innlogging, Feide/OIDC-overføring og kontoidentitet.", data: "Teknisk bruker-ID, leverandøridentifikatorer, e-post der det er tilgjengelig, autentiseringsmetadata og passordhasher for e-post/passord-kontoer.", location: "Firebase Authentication kjøres bare fra datasentre i USA ifølge Firebase-dokumentasjonen. Overføringer dekkes av Googles Firebase databehandlingsvilkår og SCC-er der det er relevant.", status: "Aktiv" },
      { name: "Google Cloud Firestore", purpose: "Database for profiler, Spaces, oppgaver, elevarbeid, brukslogger og appdata.", data: "Profildata, Spaces-data, elevarbeid, innleveringer, lærerinnhold, skoleadministrasjon og tekniske tidsstempler.", location: "europe-west1 (Belgia). Kjernedata i Firestore lagres kryptert i ro i denne europeiske regionen.", status: "Aktiv" },
      { name: "Firebase Storage / Google Cloud Storage", purpose: "Fil- og bildelagring der opplastingsfunksjoner brukes.", data: "Opplastede filer/bilder og tilhørende teknisk metadata.", location: "Aktiv 321skole-bucket: 321skole-storage, EU multi-region.", status: "Aktiv hvis fil-/bildeopplasting brukes" },
      { name: "Sikt / Feide", purpose: "Feide-innlogging og skolestyrt identitetstilgang når dette er aktivert.", data: "Innloggingsidentitet som tekniske identifikatorer, navn, e-post der det er tilgjengelig, organisasjonstilhørighet og autentiseringsmetadata som behandles via Feide.", location: "Norge / EØS-orientert Feide-tjeneste driftet av Sikt.", status: "Aktiv når Feide-innlogging brukes" },
      { name: "Vercel", purpose: "Hosting, levering av webapp og serverfunksjoner.", data: "Tekniske forespørselsdata som IP-adresse, nettleser/enhet, logger og sideforespørsler.", location: "Vercel-infrastruktur. Region/behandlingssted bekreftes i endelig DPA.", status: "Aktiv" },
      { name: "Google Analytics", purpose: "Aggregert produktanalyse der dette er aktivert.", data: "Side-/hendelsesdata, nettleser-/enhetsdata og omtrentlig lokasjon utledet av Google Analytics. IP-adresser brukes ved innsamling og forkastes deretter før logging i GA4 ifølge Google-dokumentasjonen.", location: "Google Analytics bruker regional datainnsamling og global Google-infrastruktur for behandling.", status: "Aktiv når analytics er aktivert" },
      { name: "OpenAI", purpose: "KI-funksjoner som innholdsgenerering, tilbakemelding, bildegenerering, tekstverktøy og tale der dette er aktivert.", data: "Prompter, innsendt tekst, generert innhold og kontekst som trengs for å levere valgt KI-funksjon.", location: "Behandlingssted for OpenAI API avhenger av gjeldende OpenAI-vilkår og innstillinger. Dokumenteres i endelig DPA.", status: "Aktiv når KI-funksjoner brukes" },
      { name: "Stripe", purpose: "Betaling, abonnement, faktura og betalingsportal.", data: "Navn, e-post, kunde-ID, abonnements-/betalingsmetadata og fakturadata.", location: "Stripe-infrastruktur. Bare relevant for betalte planer/bestillinger.", status: "Aktiv for betalte planer/bestillinger" },
      { name: "Resend", purpose: "Transaksjonell e-post, for eksempel velkomstmeldinger og systemmail.", data: "E-postadresse, e-postinnhold og leveringsmetadata.", location: "Resend/e-post-infrastruktur. Bekreftes i endelig underleverandøroversikt.", status: "Aktiv når e-post sendes" },
      { name: "Daily.co", purpose: "Live-/videosesjoner i kursfunksjoner, hvis aktivert.", data: "Deltakeridentifikatorer, møte-/sesjonsmetadata og tekniske tilkoblingsdata.", location: "Daily-infrastruktur, bare hvis live-/videosesjoner aktiveres.", status: "Valgfri / hvis brukt" },
      { name: "YouTube / Google", purpose: "Instruksjonsvideoer som lenkes til eller bygges inn i tjenesten.", data: "Tekniske data som håndteres av YouTube/Google når videoer åpnes eller spilles av.", location: "Google/YouTube-infrastruktur, bare når eksterne videoer åpnes.", status: "Valgfri / hvis åpnet" },
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
          <div className="hidden grid-cols-[0.9fr_1.05fr_1.2fr_1.1fr_0.65fr] gap-0 border-b border-slate-200 bg-slate-100 text-sm font-black text-slate-700 md:grid">
            <div className="p-4">{text.headers.vendor}</div>
            <div className="p-4">{text.headers.purpose}</div>
            <div className="p-4">{text.headers.data}</div>
            <div className="p-4">{text.headers.location}</div>
            <div className="p-4">{text.headers.status}</div>
          </div>

          <div className="divide-y divide-slate-200">
            {text.vendors.map((vendor) => (
              <article key={vendor.name} className="grid gap-3 p-4 text-sm md:grid-cols-[0.9fr_1.05fr_1.2fr_1.1fr_0.65fr] md:gap-0">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-500 md:hidden">{text.headers.vendor}</div>
                  <div className="font-black text-slate-950">{vendor.name}</div>
                </div>
                <Cell label={text.headers.purpose}>{vendor.purpose}</Cell>
                <Cell label={text.headers.data}>{vendor.data}</Cell>
                <Cell label={text.headers.location}>{vendor.location}</Cell>
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
