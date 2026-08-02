import Image from "next/image";
import Link from "next/link";
import { getLocale } from "next-intl/server";

const content = {
  nb: {
    back: "Til forsiden",
    eyebrow: "Kontakt",
    title: "Ta kontakt med 321skole.",
    lead: "Har du spørsmål, ideer, tilbakemeldinger eller ønsker samarbeid? Send oss gjerne en e-post.",
    email: "Send e-post",
    company: "Selskapsinformasjon",
    org: "Org.nr.",
    address: "Adresse",
    addressValue: "Røysegata 19, 6003 Ålesund",
  },
  en: {
    back: "Back to front page",
    eyebrow: "Contact",
    title: "Contact 321school.",
    lead: "Have questions, ideas, feedback or want to collaborate? Send us an email.",
    email: "Send email",
    company: "Company information",
    org: "Company no.",
    address: "Address",
    addressValue: "Røysegata 19, 6003 Ålesund, Norway",
  },
  pt: {
    back: "Voltar para a página inicial",
    eyebrow: "Contato",
    title: "Entre em contato com a 321school.",
    lead: "Tem perguntas, ideias, feedback ou quer colaborar? Envie um e-mail.",
    email: "Enviar e-mail",
    company: "Informações da empresa",
    org: "N.º da empresa",
    address: "Endereço",
    addressValue: "Røysegata 19, 6003 Ålesund, Noruega",
  },
} as const;

function getText(locale: string) {
  if (locale === "en" || locale === "pt") return content[locale];
  return content.nb;
}

export default async function ContactPage() {
  const locale = await getLocale();
  const t = getText(locale);

  return (
    <main className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-emerald-50 text-slate-950">
      <div className="mx-auto max-w-4xl px-6 py-8 md:py-12">
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
          <h1 className="mt-5 text-4xl font-semibold tracking-tight md:text-6xl">{t.title}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-700">{t.lead}</p>

          <a
            href="mailto:post@321skole.no"
            className="mt-8 inline-flex rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
          >
            {t.email}
          </a>

          <div className="mt-10 rounded-3xl bg-slate-50 p-6 ring-1 ring-slate-200">
            <h2 className="text-xl font-semibold">{t.company}</h2>
            <dl className="mt-5 grid gap-4 text-sm text-slate-700 sm:grid-cols-3">
              <div>
                <dt className="font-semibold text-slate-950">E-post</dt>
                <dd>
                  <a className="text-sky-700 hover:text-sky-900" href="mailto:post@321skole.no">
                    post@321skole.no
                  </a>
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-950">{t.org}</dt>
                <dd>968 400 789</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-950">{t.address}</dt>
                <dd>{t.addressValue}</dd>
              </div>
            </dl>
          </div>
        </section>
      </div>
    </main>
  );
}
