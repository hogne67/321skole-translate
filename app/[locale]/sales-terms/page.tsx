// app/[locale]/sales-terms/page.tsx
import Image from "next/image";
import Link from "next/link";
import { getLocale } from "next-intl/server";

const content = {
  nb: {
    brand: "321skole",
    back: "Til forsiden",
    eyebrow: "Salgsvilkår",
    title: "Salgsvilkår for 321skole",
    updated: "Sist oppdatert: 9. august 2026",
    intro:
      "Disse salgsvilkårene gjelder kjøp av betalte abonnement og digitale tjenester i 321skole.",
    sellerTitle: "Selger",
    sellerName: "Fjord service",
    orgLabel: "Org.nr.",
    orgValue: "968 400 789 MVA",
    addressLabel: "Adresse",
    addressValue: "Røysegata 19, 6003 Ålesund",
    emailLabel: "E-post",
    sections: [
      {
        title: "1. Hva du kjøper",
        text:
          "321skole er en digital læringsplattform med verktøy for lærere, elever, studenter og foreldre. Betalte abonnement gir tilgang til mer kapasitet og flere funksjoner enn gratisplanen. Nøyaktig innhold, grenser og pris vises på prissiden og i betalingsvinduet før kjøpet fullføres.",
      },
      {
        title: "2. Priser og betaling",
        text:
          "Priser for norske kunder vises i norske kroner. Merverdiavgift er inkludert der mva skal beregnes. Betaling skjer gjennom tilgjengelige betalingsleverandører, for eksempel Stripe eller Vipps. Betalingsleverandøren kan be om nødvendig betalings- og fakturainformasjon for å gjennomføre betalingen.",
      },
      {
        title: "3. Abonnement, fornyelse og oppsigelse",
        text:
          "Betalte planer leveres som løpende abonnement dersom ikke annet er tydelig oppgitt. Abonnementet fornyes automatisk for valgt periode til det sies opp. Du kan administrere eller si opp abonnementet fra kontosiden/betalingsportalen. Ved oppsigelse beholder du normalt tilgangen ut den perioden som allerede er betalt.",
      },
      {
        title: "4. Levering",
        text:
          "Tilgang til betalte funksjoner gis normalt automatisk når betalingen er bekreftet. Dersom tilgangen ikke aktiveres som forventet, kontakt oss på post@321skole.no, så retter vi feilen eller hjelper med refusjon der det er aktuelt.",
      },
      {
        title: "5. Angrerett og refusjon",
        text:
          "Forbrukere har normalt 14 dagers angrerett ved kjøp på nett. Fristen regnes som hovedregel fra avtalen ble inngått. Hvis du vil angre et kjøp, send e-post til post@321skole.no. Vi følger gjeldende angrerettregler for digitale tjenester og abonnement. Dersom du har brukt tjenesten før du angrer, kan refusjon vurderes i tråd med lovens regler og hvor mye av tjenesten som er levert.",
      },
      {
        title: "6. Reklamasjon og feil",
        text:
          "Hvis tjenesten ikke fungerer som avtalt, bør du kontakte oss så raskt som mulig. Vi vil forsøke å rette feilen. Dersom feilen ikke kan rettes, kan du ha krav på prisavslag, refusjon eller andre rettigheter etter gjeldende forbrukerregler.",
      },
      {
        title: "7. Endringer i tjenesten",
        text:
          "321skole kan videreutvikle og endre funksjoner, kapasitetsgrenser og planer. Vesentlige endringer som påvirker et aktivt betalt abonnement, kommuniseres tydelig før de får virkning der dette er nødvendig.",
      },
      {
        title: "8. Personvern",
        text:
          "Personopplysninger behandles i tråd med personvernerklæringen. Betalingsleverandører behandler nødvendige betalingsopplysninger for å kunne gjennomføre betaling, fakturering og abonnementshåndtering.",
      },
      {
        title: "9. Kontakt og klage",
        text:
          "Spørsmål om kjøp, betaling, angrerett eller abonnement kan sendes til post@321skole.no. Hvis du ikke er fornøyd med løsningen, kan du kontakte Forbrukerrådet for veiledning.",
      },
    ],
    links: {
      pricing: "Priser",
      privacy: "Personvern",
      terms: "Bruksvilkår",
      contact: "Kontakt",
    },
  },
  en: {
    brand: "321school",
    back: "Back to front page",
    eyebrow: "Sales terms",
    title: "Sales Terms for 321school",
    updated: "Last updated: August 9, 2026",
    intro:
      "These sales terms apply to paid subscriptions and digital services purchased in 321school.",
    sellerTitle: "Seller",
    sellerName: "Fjord service",
    orgLabel: "Company no.",
    orgValue: "968 400 789 VAT",
    addressLabel: "Address",
    addressValue: "Røysegata 19, 6003 Ålesund, Norway",
    emailLabel: "Email",
    sections: [
      {
        title: "1. What you buy",
        text:
          "321school is a digital learning platform with tools for teachers, learners, students and parents. Paid subscriptions provide more capacity and more features than the free plan. The exact content, limits and price are shown on the pricing page and in checkout before purchase.",
      },
      {
        title: "2. Prices and payment",
        text:
          "Prices for Norwegian customers are shown in NOK. VAT is included where VAT applies. Payment is handled through available payment providers, such as Stripe or Vipps. The payment provider may request necessary payment and billing information to complete the payment.",
      },
      {
        title: "3. Subscription, renewal and cancellation",
        text:
          "Paid plans are delivered as recurring subscriptions unless clearly stated otherwise. The subscription renews automatically for the selected period until cancelled. You can manage or cancel your subscription from the account page/billing portal. When cancelling, you normally keep access until the end of the paid period.",
      },
      {
        title: "4. Delivery",
        text:
          "Access to paid features is normally granted automatically when payment is confirmed. If access is not activated as expected, contact post@321skole.no and we will correct the issue or help with a refund where applicable.",
      },
      {
        title: "5. Right of withdrawal and refunds",
        text:
          "Consumers normally have a 14-day right of withdrawal for online purchases. The period generally starts when the agreement is made. To withdraw from a purchase, email post@321skole.no. We follow applicable withdrawal rules for digital services and subscriptions. If you have used the service before withdrawing, any refund may be assessed according to legal rules and the amount of service already delivered.",
      },
      {
        title: "6. Complaints and errors",
        text:
          "If the service does not work as agreed, contact us as soon as possible. We will try to correct the issue. If it cannot be corrected, you may be entitled to a price reduction, refund or other rights under applicable consumer rules.",
      },
      {
        title: "7. Changes to the service",
        text:
          "321school may develop and change features, capacity limits and plans. Significant changes affecting an active paid subscription will be communicated clearly before they take effect where required.",
      },
      {
        title: "8. Privacy",
        text:
          "Personal data is processed according to the Privacy Policy. Payment providers process necessary payment data to handle payment, invoicing and subscription management.",
      },
      {
        title: "9. Contact and complaints",
        text:
          "Questions about purchases, payment, withdrawal or subscriptions can be sent to post@321skole.no. If you are not satisfied with the solution, you may contact the Norwegian Consumer Council for guidance.",
      },
    ],
    links: {
      pricing: "Pricing",
      privacy: "Privacy",
      terms: "Terms",
      contact: "Contact",
    },
  },
  pt: {
    brand: "321escola",
    back: "Voltar para a página inicial",
    eyebrow: "Termos de venda",
    title: "Termos de Venda da 321escola",
    updated: "Última atualização: 9 de agosto de 2026",
    intro:
      "Estes termos de venda se aplicam a assinaturas pagas e serviços digitais comprados na 321escola.",
    sellerTitle: "Vendedor",
    sellerName: "Fjord service",
    orgLabel: "N.º da empresa",
    orgValue: "968 400 789 VAT",
    addressLabel: "Endereço",
    addressValue: "Røysegata 19, 6003 Ålesund, Noruega",
    emailLabel: "E-mail",
    sections: [
      {
        title: "1. O que você compra",
        text:
          "A 321escola é uma plataforma digital de aprendizagem com ferramentas para professores, alunos, estudantes e pais. Assinaturas pagas oferecem mais capacidade e mais recursos do que o plano gratuito. O conteúdo exato, limites e preço são exibidos na página de preços e no checkout antes da compra.",
      },
      {
        title: "2. Preços e pagamento",
        text:
          "Preços para clientes noruegueses são exibidos em NOK. O VAT/MVA está incluído quando aplicável. O pagamento é feito por provedores disponíveis, como Stripe ou Vipps. O provedor de pagamento pode solicitar informações necessárias de pagamento e faturamento.",
      },
      {
        title: "3. Assinatura, renovação e cancelamento",
        text:
          "Planos pagos são fornecidos como assinaturas recorrentes, salvo indicação clara em contrário. A assinatura renova automaticamente pelo período escolhido até ser cancelada. Você pode gerenciar ou cancelar a assinatura na página da conta/portal de cobrança. Ao cancelar, normalmente mantém o acesso até o fim do período pago.",
      },
      {
        title: "4. Entrega",
        text:
          "O acesso aos recursos pagos normalmente é ativado automaticamente quando o pagamento é confirmado. Se o acesso não for ativado como esperado, entre em contato pelo e-mail post@321skole.no.",
      },
      {
        title: "5. Direito de arrependimento e reembolso",
        text:
          "Consumidores normalmente têm 14 dias de direito de arrependimento em compras online. O prazo geralmente começa quando o acordo é feito. Para cancelar uma compra, envie e-mail para post@321skole.no. Seguimos as regras aplicáveis para serviços digitais e assinaturas.",
      },
      {
        title: "6. Reclamações e erros",
        text:
          "Se o serviço não funcionar como acordado, entre em contato conosco o mais rápido possível. Tentaremos corrigir o problema. Se não puder ser corrigido, você pode ter direito a redução de preço, reembolso ou outros direitos conforme as regras aplicáveis.",
      },
      {
        title: "7. Alterações no serviço",
        text:
          "A 321escola pode desenvolver e alterar recursos, limites de capacidade e planos. Alterações importantes que afetem uma assinatura paga ativa serão comunicadas claramente quando necessário.",
      },
      {
        title: "8. Privacidade",
        text:
          "Dados pessoais são tratados conforme a Política de Privacidade. Provedores de pagamento tratam os dados necessários para pagamento, faturamento e gestão da assinatura.",
      },
      {
        title: "9. Contato e reclamações",
        text:
          "Perguntas sobre compras, pagamento, arrependimento ou assinaturas podem ser enviadas para post@321skole.no.",
      },
    ],
    links: {
      pricing: "Preços",
      privacy: "Privacidade",
      terms: "Termos",
      contact: "Contato",
    },
  },
} as const;

function getText(locale: string) {
  if (locale === "en" || locale === "pt") return content[locale];
  return content.nb;
}

export default async function SalesTermsPage() {
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
            alt={t.brand}
            width={180}
            height={56}
            className="h-auto w-44"
          />
          <p className="mt-8 inline-flex rounded-full bg-sky-100 px-4 py-2 text-sm font-semibold text-sky-800">
            {t.eyebrow}
          </p>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight md:text-6xl">{t.title}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-700">{t.intro}</p>
          <p className="mt-3 text-sm font-semibold text-slate-500">{t.updated}</p>

          <div className="mt-10 rounded-3xl bg-slate-50 p-6 ring-1 ring-slate-200">
            <h2 className="text-xl font-semibold">{t.sellerTitle}</h2>
            <dl className="mt-5 grid gap-4 text-sm text-slate-700 sm:grid-cols-2">
              <div>
                <dt className="font-semibold text-slate-950">{t.sellerName}</dt>
                <dd>{t.orgLabel} {t.orgValue}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-950">{t.addressLabel}</dt>
                <dd>{t.addressValue}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-950">{t.emailLabel}</dt>
                <dd>
                  <a className="text-sky-700 hover:text-sky-900" href="mailto:post@321skole.no">
                    post@321skole.no
                  </a>
                </dd>
              </div>
            </dl>
          </div>

          <div className="mt-10 space-y-7">
            {t.sections.map((section) => (
              <section key={section.title}>
                <h2 className="text-xl font-semibold text-slate-950">{section.title}</h2>
                <p className="mt-2 text-sm leading-7 text-slate-700">{section.text}</p>
              </section>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap gap-3 text-sm">
            <Link
              className="rounded-full border border-slate-200 px-4 py-2 font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700"
              href={`/${locale}/pricing`}
            >
              {t.links.pricing}
            </Link>
            <Link
              className="rounded-full border border-slate-200 px-4 py-2 font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700"
              href={`/${locale}/privacy`}
            >
              {t.links.privacy}
            </Link>
            <Link
              className="rounded-full border border-slate-200 px-4 py-2 font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700"
              href={`/${locale}/terms`}
            >
              {t.links.terms}
            </Link>
            <Link
              className="rounded-full border border-slate-200 px-4 py-2 font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700"
              href={`/${locale}/contact`}
            >
              {t.links.contact}
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
