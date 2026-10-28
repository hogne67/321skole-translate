import { schoolSubprocessorsContent as copyFor } from "@/lib/trust/schoolContent";
import { TrustNavigation } from "@/components/trust/TrustNavigation";
import { getLocale } from "next-intl/server";

export default async function SchoolSubprocessorsPage() {
  const locale = (await getLocale()) as string;
  const text = copyFor(locale);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <TrustNavigation locale={locale} currentPath="/school/subprocessors" />

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
