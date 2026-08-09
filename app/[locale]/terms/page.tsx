// app/[locale]/terms/page.tsx
import Link from "next/link";
import { getLocale } from "next-intl/server";

const termsContent = {
  nb: {
    title: "Vilkår",
    lead: "Kortversjon av vilkårene for bruk av 321skole.",
    paragraphs: [
      "Ved å bruke 321skole godtar du å bruke tjenesten i tråd med gjeldende lover, skolens regler og plattformens formål.",
      "Brukeren er ansvarlig for at innhold som lastes opp eller deles, ikke bryter med lovverk, opphavsrett eller andres personvern.",
      "Kontoer er personlige og skal ikke deles med andre uten uttrykkelig tillatelse.",
      "Vi kan oppdatere funksjoner, sikkerhet og vilkår ved behov. Vesentlige endringer kommuniseres tydelig i tjenesten.",
    ],
    privacy: "Personvern",
    contact: "Kontakt",
  },
  en: {
    title: "Terms",
    lead: "A short version of the terms for using 321school.",
    paragraphs: [
      "By using 321school, you agree to use the service in line with applicable laws, school rules, and the purpose of the platform.",
      "Users are responsible for ensuring that content they upload or share does not violate laws, copyright, or the privacy of others.",
      "Accounts are personal and must not be shared with others without explicit permission.",
      "We may update features, security, and terms when needed. Important changes will be communicated clearly in the service.",
    ],
    privacy: "Privacy",
    contact: "Contact",
  },
  pt: {
    title: "Termos",
    lead: "Uma versão curta dos termos de uso da 321escola.",
    paragraphs: [
      "Ao usar a 321escola, você concorda em usar o serviço de acordo com as leis aplicáveis, as regras da escola e o objetivo da plataforma.",
      "O usuário é responsável por garantir que o conteúdo enviado ou compartilhado não viole leis, direitos autorais ou a privacidade de outras pessoas.",
      "As contas são pessoais e não devem ser compartilhadas com outras pessoas sem permissão explícita.",
      "Podemos atualizar recursos, segurança e termos quando necessário. Mudanças importantes serão comunicadas claramente no serviço.",
    ],
    privacy: "Privacidade",
    contact: "Contato",
  },
} as const;

type TermsLocale = keyof typeof termsContent;

export default async function TermsPage() {
  const locale = await getLocale();
  const normalizedLocale: TermsLocale =
    locale === "en" || locale === "pt" || locale === "nb" ? locale : "en";
  const content = termsContent[normalizedLocale];

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-semibold text-slate-950">{content.title}</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">{content.lead}</p>
      <div className="mt-6 space-y-4 text-sm leading-7 text-slate-700">
        {content.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap gap-3 text-sm">
        <Link
          className="rounded-full border border-slate-200 px-4 py-2 text-slate-700 hover:border-blue-300 hover:text-blue-700"
          href={`/${normalizedLocale}/privacy`}
        >
          {content.privacy}
        </Link>
        <Link
          className="rounded-full border border-slate-200 px-4 py-2 text-slate-700 hover:border-blue-300 hover:text-blue-700"
          href={`/${normalizedLocale}/contact`}
        >
          {content.contact}
        </Link>
      </div>
    </main>
  );
}
