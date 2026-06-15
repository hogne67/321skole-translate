"use client";

import { FormEvent, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useLocale } from "next-intl";
import { ArrowLeft, Check, ClipboardList } from "lucide-react";

const TEACHER_PRICE = 75;

function localizedPath(locale: string, path: string) {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${clean}`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function OrderFormClient() {
  const locale = useLocale();
  const [teacherCount, setTeacherCount] = useState(10);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const monthlyTotal = useMemo(() => teacherCount * TEACHER_PRICE, [teacherCount]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");

    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());

    const response = await fetch("/api/school-orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        teacherCount,
        monthlyTotal,
      }),
    });

    setStatus(response.ok ? "sent" : "error");
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link
            href={localizedPath(locale, "/skoler")}
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-slate-950"
          >
            <ArrowLeft size={16} />
            Til skolesiden
          </Link>

          <Link href={localizedPath(locale, "/")} className="flex items-center gap-2">
            <Image
              src="/logo321ny.png"
              alt="321"
              width={32}
              height={32}
              className="h-8 w-auto object-contain"
            />
            <span className="text-lg font-semibold">321skole</span>
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 py-10 md:grid-cols-[1fr_0.82fr] md:py-14">
        <section>
          <p className="inline-flex rounded-full bg-sky-100 px-4 py-2 text-sm font-semibold text-sky-800">
            Bestilling for skoler
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl">
            Fortell oss hvem dere er, så setter vi opp riktig antall lisenser.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-700 md:text-lg">
            Elever er gratis i klasserommet. Dere betaler kun for ansatte og
            vikarer som skal lage, dele og følge opp læring.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Skole / virksomhet" name="school" required />
              <Field label="Kommune" name="municipality" required />
              <Field label="Adresse" name="address" required />
              <Field label="Poststed" name="place" required />
              <Field label="Kontaktperson" name="contactName" required />
              <Field label="E-post" name="email" type="email" required />
              <Field label="Telefon" name="phone" type="tel" />
              <Field label="Rolle" name="role" placeholder="Rektor, avdelingsleder..." />
            </div>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <label htmlFor="teacherCount" className="text-sm font-semibold text-slate-900">
                    Vi bestiller for
                  </label>
                  <p className="mt-1 text-sm text-slate-600">
                    Velg antall lærere, ansatte og vikarer som skal ha tilgang.
                  </p>
                </div>
                <div className="text-3xl font-semibold text-slate-950">
                  {teacherCount} <span className="text-base font-medium text-slate-600">lærere</span>
                </div>
              </div>

              <input
                id="teacherCount"
                name="teacherCount"
                type="range"
                min="1"
                max="200"
                value={teacherCount}
                onChange={(event) => setTeacherCount(Number(event.target.value))}
                className="mt-5 w-full accent-sky-600"
              />

              <div className="mt-3 flex justify-between text-xs font-semibold text-slate-500">
                <span>1</span>
                <span>50</span>
                <span>100</span>
                <span>200</span>
              </div>
            </div>

            <label className="mt-5 block">
              <span className="text-sm font-semibold text-slate-900">Kommentar</span>
              <textarea
                name="comment"
                rows={4}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                placeholder="Eventuelle avdelinger, fakturainfo eller praktiske detaljer."
              />
            </label>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="submit"
                disabled={status === "sending"}
                className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
              >
                {status === "sending" ? "Sender..." : "Send bestilling"}
              </button>

              {status === "sent" ? (
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700">
                  <Check size={16} />
                  Bestillingen er sendt. Vi tar kontakt.
                </p>
              ) : null}

              {status === "error" ? (
                <p className="text-sm font-semibold text-rose-700">
                  Bestillingen kunne ikke sendes akkurat nå. Prøv igjen om litt.
                </p>
              ) : null}
            </div>
          </form>
        </section>

        <aside className="md:sticky md:top-20 md:self-start">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="relative aspect-[4/3] bg-sky-100">
              <Image
                src="/landingschool/school_teacher_students.png"
                alt="Lærer og elever i klasserom"
                fill
                className="object-cover object-center"
              />
            </div>

            <div className="p-6">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                  <ClipboardList size={20} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Oppsummering</p>
                  <p className="text-sm text-slate-600">75 kr per lærer per måned</p>
                </div>
              </div>

              <div className="mt-6 space-y-3 rounded-2xl bg-slate-50 p-4">
                <SummaryRow label="Lærere" value={`${teacherCount}`} />
                <SummaryRow label="Pris per lærer" value={formatCurrency(TEACHER_PRICE)} />
                <SummaryRow label="Elever" value="Gratis" />
                <div className="border-t border-slate-200 pt-3">
                  <SummaryRow
                    label="Sum per måned"
                    value={formatCurrency(monthlyTotal)}
                    strong
                  />
                </div>
              </div>

              <p className="mt-4 text-sm leading-6 text-slate-600">
                Antall kan justeres senere. Dere betaler bare for aktive
                personell-lisenser.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

function Field(props: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-900">{props.label}</span>
      <input
        name={props.name}
        type={props.type ?? "text"}
        placeholder={props.placeholder}
        required={props.required}
        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
      />
    </label>
  );
}

function SummaryRow(props: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={props.strong ? "text-base font-semibold" : "text-sm text-slate-600"}>
        {props.label}
      </span>
      <span className={props.strong ? "text-xl font-semibold" : "text-sm font-semibold"}>
        {props.value}
      </span>
    </div>
  );
}
