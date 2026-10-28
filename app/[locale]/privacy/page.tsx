import { generalPrivacyContent as getText } from "@/lib/trust/schoolContent";
import Image from "next/image";
import Link from "next/link";
import { TrustNavigation } from "@/components/trust/TrustNavigation";
import { getLocale } from "next-intl/server";

export default async function PrivacyPage() {
  const locale = await getLocale();
  const t = getText(locale);

  return (
    <main className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-slate-50 text-slate-950">
      <TrustNavigation locale={locale} currentPath="/privacy" />
      <div className="mx-auto max-w-5xl px-6 py-8 md:py-12">


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
                <dt className="font-semibold text-white">{t.emailLabel}</dt>
                <dd>
                  <a href={`mailto:${t.email}`} className="text-sky-200 hover:text-white">
                    {t.email}
                  </a>
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-white">{t.addressLabel}</dt>
                <dd>{t.address}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="mt-6 grid gap-4">
          {t.sections.map((section) => (
            <article key={section.id} id={section.id} className="scroll-mt-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h2 className="text-xl font-semibold tracking-tight text-slate-950">{section.title}</h2>
              <p className="mt-3 text-sm leading-7 text-slate-700">{section.text}</p>
              {section.points.length ? (
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-slate-700">
                  {section.points.map(point => <li key={point}>{point}</li>)}
                </ul>
              ) : null}
              {section.links.length ? (
                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
                  {section.links.map(link => <Link key={link.href} href={link.href} className="rounded text-sm font-semibold text-sky-800 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-sky-700">{link.label}</Link>)}
                </div>
              ) : null}
            </article>
          ))}
        </section>

        <section className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 p-6">
          <h2 className="text-xl font-semibold">{t.statusTitle}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-700">{t.statusText}</p>
        </section>

        <section className="mt-6 rounded-3xl bg-sky-50 p-6 ring-1 ring-sky-100">
          <h2 className="text-xl font-semibold">{t.contactTitle}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-700">{t.contactText}</p>
          <a
            href={`mailto:${t.email}`}
            className="mt-5 inline-flex rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
          >
            {t.emailButton}
          </a>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
            {t.sourceLinks.map(link => <a key={link.href} href={link.href} className="rounded text-sm font-semibold text-sky-800 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-sky-700">{link.label}</a>)}
          </div>
        </section>
      </div>
    </main>
  );
}
