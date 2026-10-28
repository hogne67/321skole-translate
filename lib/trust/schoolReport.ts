import { revisionLabel, schoolFacts as facts, translated as t, type Translated } from "./schoolFacts";

export type MunicipalityDocument = {
  id: "privacy" | "dpa" | "data" | "storage" | "purpose" | "feide";
  title: string; request: string; summary: string; points: string[];
  links: { href: string; label: string }[];
  icon: "privacy" | "dpa" | "data" | "storage" | "purpose" | "feide";
};
type DocumentSource = Omit<MunicipalityDocument, "title" | "request" | "summary" | "points" | "links"> & {
  title: Translated; request: Translated; summary: Translated; points: readonly Translated[];
  links: { href: string; label: Translated }[];
};
const documents: DocumentSource[] = [
  { id: "privacy", icon: "privacy", title: ["1. Personvernerklæring", "1. Privacy notice", "1. Aviso de privacidade"], request: ["Personvernerklæring for tjenesten.", "Privacy notice for the service.", "Aviso de privacidade do serviço."], summary: facts.provider,
    points: [facts.roles, facts.guest,
      ["Generell personvernerklæring og skoleoversikt har samme innholdsversjon. Grunnlag, frister og leverandøravklaringer er tydelig merket som åpne der de ikke er ferdigstilt.", "The general notice and school overview share a content version. Pending legal bases, retention and provider matters are explicitly identified.", "Aviso geral e visão escolar usam a mesma versão. Bases legais, retenção e fornecedores pendentes estão identificados."],
    ], links: [{ href: "/school/privacy", label: ["Personvern for skoler", "School privacy", "Privacidade escolar"] }, { href: "/privacy", label: ["Generell personvernerklæring", "General privacy notice", "Aviso geral"] }] },
  { id: "dpa", icon: "dpa", title: ["2. Databehandleravtale – utkast", "2. DPA – draft", "2. Acordo de tratamento – rascunho"], request: ["Databehandleravtale mellom skoleeier og leverandør.", "Data processing agreement between school owner and supplier.", "Acordo entre mantenedora e fornecedor."], summary: facts.draft,
    points: [facts.identity,
      ["Avtaleutkastet dekker instrukser, taushetsplikt/sikkerhet, bistand, bruddvarsling, underdatabehandlere, revisjon og opphør. Bilag A–D beskriver behandling, sikkerhet, leverandører/overføringer og oppbevaring/sletting.", "The draft covers instructions, confidentiality/security, assistance, breaches, sub-processors, audits and exit. Annexes A–D cover processing, security, providers/transfers and retention/deletion.", "O rascunho cobre instruções, confidencialidade/segurança, assistência, incidentes, suboperadores, auditoria e encerramento. Anexos A–D: tratamento, segurança, fornecedores/transferências e retenção/exclusão."],
      ["Bilag, kommunens avtalepart, funksjonsomfang, frister og juridisk gjennomgang må fullføres før signering. Denne rapporten er ikke den fullstendige avtaleteksten.", "Annexes, municipal party, scope, deadlines and legal review must be completed before signing. This report is not the full agreement text.", "Anexos, parte municipal, escopo, prazos e revisão jurídica devem ser concluídos antes da assinatura. Este relatório não é o acordo integral."],
    ], links: [{ href: "/school/dpa", label: ["DBA-utkast og bilagsgrunnlag", "DPA draft and annex evidence", "Acordo e material dos anexos"] }] },
  { id: "data", icon: "data", title: ["3. Personopplysninger", "3. Personal data", "3. Dados pessoais"], request: ["Hvilke personopplysninger behandles?", "Which personal data is processed?", "Quais dados pessoais são tratados?"], summary: ["Skoleoversikten beskriver opplysninger om lærere, elever med konto eller personlig kode og skoleadministratorer, samt elevarbeid, medier og tekniske data.", "The school overview describes data about teachers, students using accounts or personal codes, and school administrators, along with student work, media and technical data.", "A visão escolar descreve dados de professores, alunos com conta ou código pessoal e administradores escolares, além de trabalhos, mídia e dados técnicos."],
    points: [
      ["Konto/rolle: bruker-ID, navn/visningsnavn, e-post eller skolebestemt identitet når relevant, innloggingsmetadata, medlemskap og tidsstempler.", "Account/role: ID, name/display name, email or school identity where relevant, login metadata, membership and timestamps.", "Conta/papel: ID, nome, e-mail ou identidade escolar pertinente, metadados, vínculos e datas."],
      ["Arbeid: oppgaver, elevsvar, resultater, lærer-/KI-feedback, elevlyd, podcastsegmenter, bilder og vedleggsmetadata. Infrastruktur og analyse kan behandle tekniske forespørsels-/hendelsesdata.", "Work: tasks, answers, results, teacher/AI feedback, audio, podcast segments, images and attachment metadata. Infrastructure/analytics may process technical request/event data.", "Trabalhos: tarefas, respostas, resultados, feedback, áudio, podcasts, imagens e metadados. Infraestrutura/análise podem tratar dados técnicos de solicitações/eventos."],
      facts.teacherAi, facts.aiLearningSupport, facts.retention,
    ], links: [{ href: "/school/privacy#data-categories", label: ["Datakategorier og dataflyt", "Data categories and flows", "Categorias e fluxos"] }, { href: "/school/data-rights", label: ["Oppbevaring og rettigheter", "Retention and rights", "Retenção e direitos"] }] },
  { id: "storage", icon: "storage", title: ["4. Lagring, leverandører og overføringer", "4. Storage, providers and transfers", "4. Armazenamento, fornecedores e transferências"], request: ["Lagringssted, underleverandører og internasjonale overføringer.", "Storage, sub-processors and international transfers.", "Armazenamento, suboperadores e transferências internacionais."], summary: facts.database,
    points: [facts.providersStatus, facts.transfers,
      ["Google dokumenterer USA for Firebase Authentication. Vercel, OpenAI, Resend, Stripe og øvrige relevante tjenester har egne roller og avtale-/konfigurasjonsavklaringer. Ikke alle tjenester er underdatabehandlere for elevdata.", "Google documents US processing for Firebase Authentication. Vercel, OpenAI, Resend, Stripe and others have separate roles and pending contracts/settings. Not all services are sub-processors of student data.", "Google documenta EUA para Firebase Authentication. Vercel, OpenAI, Resend, Stripe e outros têm papéis próprios e pendências. Nem todos são suboperadores de dados de alunos."],
      ["Leverandørbilaget skal bekrefte juridisk enhet, avtaleversjon, land, datatyper, supporttilgang, overføringsgrunnlag og relevante tiltak. Oppgitt EU-lagring er ikke en generell EU-only-garanti.", "The annex must confirm entities, contract versions, countries, data, support access, transfer bases and safeguards. Reported EU storage is not a general EU-only guarantee.", "O anexo deve confirmar entidades, versões, países, dados, suporte, fundamentos e medidas. Armazenamento informado na UE não é garantia geral de UE exclusiva."],
    ], links: [{ href: "/school/subprocessors", label: ["Leverandør- og overføringsoversikt", "Provider and transfer inventory", "Lista de fornecedores e transferências"] }, { href: "/school/dpa#annex-c", label: ["Bilag C", "Annex C", "Anexo C"] }] },
  { id: "purpose", icon: "purpose", title: ["5. Formål og brukere", "5. Purpose and users", "5. Finalidade e usuários"], request: ["Formålet med løsningen og aktuelle brukergrupper.", "Service purpose and intended users.", "Finalidade e usuários previstos."], summary: ["321skole støtter lærerens planlegging, undervisning og oppfølging av elever med undervisningsressurser, digitale klasse- og grupperom og Live-aktiviteter. Lærere og elever bruker undervisningsfunksjonene, mens skoleadministratorer administrerer egen skoles bruk. KI og øvrige funksjonsvalg beskrives nærmere i lenkene nedenfor.", "321school supports teachers in planning, teaching and following up student work through learning resources, digital class and group rooms, and Live activities. Teachers and students use the teaching features, while school administrators manage their own school's use. The links below explain AI and other feature choices.", "321school apoia o planejamento, o ensino e o acompanhamento dos alunos com recursos didáticos, salas digitais de turma e grupo e atividades Live. Professores e alunos usam as funções de ensino; administradores gerenciam o uso da própria escola. Os links abaixo explicam IA e outras escolhas de funções."],
    points: [facts.schoolAdmin, facts.aiScope, facts.children, facts.municipalControls],
    links: [{ href: "/school/privacy#purpose-users", label: ["Bruksområder og roller", "Uses and roles", "Usos e papéis"] }, { href: "/school/ai-guidelines", label: ["KI i undervisningen", "AI in teaching", "IA no ensino"] }, { href: "/school/trust#school-assessment", label: ["Funksjoner og kommunens vurdering", "Features and municipal assessment", "Funções e avaliação municipal"] }] },
  { id: "feide", icon: "feide", title: ["6. Feide og delte brukeropplysninger", "6. Feide and shared information", "6. Feide e dados compartilhados"], request: ["Feide-integrasjon og opplysninger som deles.", "Feide integration and shared information.", "Integração Feide e dados compartilhados."], summary: facts.feide,
    points: [facts.feideData, facts.feideFields, facts.feideStudyBoundary,
      ["Før faktisk Feide-bruk: avstem portalens attributtgrupper/scopes med Firebase/OIDC-oppsettet. For hvert felt dokumenteres kilde, nødvendighet, mottak, lagring, bruk og sletting. Organisasjonstilhørighet skal ikke presenteres som verifisert mottatt før dette er kontrollert.", "Before actual Feide use reconcile the portal’s groups/scopes with Firebase/OIDC settings. Document each field's source, necessity, receipt, storage, use and deletion. Do not present organisational attributes as verified received before checking.", "Antes do uso real do Feide, concilie os grupos/scopes do portal com Firebase/OIDC. Documente origem, necessidade, recebimento, armazenamento, uso e exclusão por campo. Não apresente vínculo organizacional como verificado sem conferência."],
      ["Feide-godkjenning er ikke en DBA eller betalt skolelisens og tildeler ikke i seg selv administrator- eller undervisningsrettigheter.", "Feide approval is not a DPA or paid licence and does not itself confer administration or teaching rights.", "Aprovação Feide não é acordo nem licença paga e não concede por si administração ou ensino."],
    ], links: [{ href: "/school/privacy#feide", label: ["Feide i skoleoversikten", "Feide in the school overview", "Feide na visão escolar"] }, { href: "/school/subprocessors", label: ["Sikt/Feide og rollefordeling", "Sikt/Feide and roles", "Sikt/Feide e papéis"] }] },
];

export function municipalityDocuments(locale: string): MunicipalityDocument[] {
  return documents.map(document => ({ ...document, title: t(locale, document.title), request: t(locale, document.request), summary: t(locale, document.summary), points: document.points.map(point => t(locale, point)), links: document.links.map(link => ({ href: link.href, label: t(locale, link.label) })) }));
}
export function municipalityReportUi(locale: string) {
  const label = (value: Translated) => t(locale, value);
  return {
    eyebrow: label(["Skole- og kommunevurdering", "School and municipal assessment", "Avaliação escolar e municipal"]),
    title: label(["Kommunerapport", "Municipal report", "Relatório municipal"]),
    lead: label(["Samlet dokumentasjon for skoleeiers vurdering av 321skole. Velg en kort rapport med lenker eller en full dokumentpakke med Trust Centers dokumenttekster og DBA-bilag A–D.", "Documentation for the school owner's assessment of 321school. Choose a short report with links or a full package of Trust Center documents and DPA annexes A–D.", "Documentação para avaliação do 321school pela mantenedora. Escolha um resumo com links ou um pacote completo dos documentos da Central de confiança e anexos A–D."]),
    recipient: label(["Mottaker", "Recipient", "Destinatário"]),
    recipientPlaceholder: label(["Kommune eller skoleeier", "Municipality or school owner", "Município ou mantenedora"]),
    noteLabel: label(["Kort merknad", "Short note", "Nota breve"]),
    analyticsTitle: label(["Google Analytics – lokal kandidat og produksjonskontroll", "Google Analytics – local candidate and production verification", "Google Analytics – candidato local e verificação em produção"]),
    analyticsPlan: t(locale, facts.analyticsPlan),
    defaultNote: "",
    updated: revisionLabel(locale),
    selectTitle: label(["Velg temaer til kort rapport", "Select topics for the short report", "Selecione temas para o resumo"]),
    formatTitle: label(["Velg utskrift", "Choose print format", "Escolha a impressão"]),
    shortFormat: label(["Kort rapport", "Short report", "Resumo"]),
    shortDescription: label(["Sammendrag av valgte temaer med lenker til fulltekst.", "Selected topic summaries with links to full text.", "Resumos dos temas selecionados com links ao texto integral."]),
    fullFormat: label(["Full dokumentpakke", "Full document package", "Pacote completo"]),
    fullDescription: label(["Alle seks temaer, sju dokumentområder i fulltekst og DBA-bilag A–D.", "All six topics, seven full-text document areas and DPA annexes A–D.", "Os seis temas, sete áreas documentais integrais e anexos A–D."]),
    fullScope: label(["Pakken samler Trust Centers egne dokumenttekster og DBA-utkast med bilag A–D. Signerte avtaler og eksterne leverandøravtaler inngår ikke. Dokumentenes arbeidsstatus og avklaringspunkter følger med.", "The package contains Trust Center document texts and the DPA draft with annexes A–D. Signed agreements and external provider contracts are not included. Draft status and open points are retained.", "O pacote reúne os textos da Central de confiança e a minuta com anexos A–D. Acordos assinados e contratos externos não estão incluídos. Estado de rascunho e pendências são mantidos."]),
    contentsTitle: label(["Dokumenter i pakken", "Package contents", "Documentos do pacote"]),
    printFull: label(["Skriv ut / lagre dokumentpakke som PDF", "Print / save document package as PDF", "Imprimir / salvar pacote em PDF"]),
    printHelp: label(["Velg «Lagre som PDF» i nettleserens utskriftsdialog. Slå gjerne av nettleserens egne topp- og bunntekster.", "Choose Save as PDF in the browser print dialog. You can turn off the browser's own headers and footers.", "Escolha Salvar como PDF na janela de impressão. Você pode desativar os cabeçalhos e rodapés do navegador."]),
    countText: (count: number, total: number) => label([`${count} av ${total} sammendrag tas med ved utskrift.`, `${count} of ${total} summaries are included in print.`, `${count} de ${total} resumos incluídos na impressão.`]),
    print: label(["Skriv ut / lagre kort rapport som PDF", "Print / save short report as PDF", "Imprimir / salvar resumo em PDF"]),
    all: label(["Velg alle", "Select all", "Selecionar todos"]),
    reportFor: label(["Rapport til", "Report for", "Relatório para"]),
    defaultRecipient: label(["kommune/skoleeier", "municipality/school owner", "município/mantenedora"]),
    scope: label(["Arbeidsutkast for vurdering. Kort rapport inneholder valgte sammendrag med lenker til dokumenttekstene og bilagene.", "Review draft. The short report includes selected summaries with links to document texts and annexes.", "Rascunho para avaliação. O resumo contém os temas selecionados com links aos documentos e anexos."]),
    localFields: label(["Mottaker og merknad brukes bare i denne rapportvisningen og lagres ikke av rapportfunksjonen.", "Recipient and note are used only in this report view and are not saved by the report feature.", "Destinatário e nota são usados apenas nesta visualização e não são salvos pela função."]),
    topic: label(["Kommunens punkt", "Municipal topic", "Tema municipal"]),
  };
}

const reportIntroduction = [
  { title: ["Informasjon for skoler og skoleeiere", "Information for schools and school owners", "Informações para escolas e mantenedoras"] as Translated, paragraphs: [facts.generalOverview] },
  { title: ["Internkontroll og dokumentert fremdrift", "Internal control and documented progress", "Controles internos e progresso documentado"] as Translated, paragraphs: [facts.internalControl, facts.securityStatus] },
  { title: ["Avklaringer før oppstart", "Clarifications before starting", "Definições antes do início"] as Translated, paragraphs: [facts.analyticsPlan, facts.retention] },
];

export function municipalityReportIntroduction(locale: string) {
  return reportIntroduction.map(section => ({ title: t(locale, section.title), paragraphs: section.paragraphs.map(paragraph => t(locale, paragraph)) }));
}
