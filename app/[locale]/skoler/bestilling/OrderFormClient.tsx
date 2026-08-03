"use client";

import { FormEvent, ReactNode, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useLocale } from "next-intl";
import { ArrowLeft, Check, ClipboardList, HelpCircle, Mail, Phone, Rocket } from "lucide-react";

function localizedPath(locale: string, path: string) {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${clean}`;
}

function schoolAccessNotice(locale: string) {
  if (locale === "pt") {
    return {
      eyebrow: "Escolas",
      title: "O acesso escolar ainda não está disponível no Brasil.",
      text: "Estamos preparando a 321escola para escolas fora da Noruega. Em breve, escolas brasileiras poderão solicitar acesso, criar uma estrutura escolar e convidar professores com uma solução adaptada ao Brasil.",
      primary: "Voltar para 321escola",
      secondary: "Entrar em contato",
    };
  }

  if (locale === "en") {
    return {
      eyebrow: "Schools",
      title: "School access is not ready in your country yet.",
      text: "We are preparing 321school outside Norway. Soon, schools in more countries will be able to request access, create a school structure, and invite teachers with a setup adapted to their country.",
      primary: "Back to 321school",
      secondary: "Contact us",
    };
  }

  return null;
}

function headerLabels(locale: string) {
  if (locale === "pt") return { back: "Voltar para escolas" };
  if (locale === "en") return { back: "Back to schools" };
  return { back: "Til skolesiden" };
}

export default function OrderFormClient() {
  const locale = useLocale();
  const unavailable = schoolAccessNotice(locale);
  const header = headerLabels(locale);
  const [teacherCount, setTeacherCount] = useState(10);
  const [requestType, setRequestType] = useState<"startup" | "info">("startup");
  const [preferredContact, setPreferredContact] = useState<"email" | "phone">("email");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

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
        requestType,
        preferredContact,
        teacherCount,
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
            {header.back}
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

      {unavailable ? (
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 py-10 md:grid-cols-[1fr_0.82fr] md:items-center md:py-14">
          <section>
            <p className="inline-flex rounded-full bg-sky-100 px-4 py-2 text-sm font-semibold text-sky-800">
              {unavailable.eyebrow}
            </p>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl">
              {unavailable.title}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-700 md:text-lg">
              {unavailable.text}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href={localizedPath(locale, "/")}
                className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
              >
                {unavailable.primary}
              </Link>
              <Link
                href={localizedPath(locale, "/contact")}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
              >
                {unavailable.secondary}
              </Link>
            </div>
          </section>

          <aside>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
              <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-sky-100">
                <Image
                  src="/landingschool/teacher_helping.jpg"
                  alt=""
                  fill
                  className="object-cover object-center"
                />
              </div>
            </div>
          </aside>
        </div>
      ) : (
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 py-10 md:grid-cols-[1fr_0.82fr] md:py-14">
        <section>
          <p className="inline-flex rounded-full bg-sky-100 px-4 py-2 text-sm font-semibold text-sky-800">
            Oppstart for norske skoler
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl">
            Fortell oss litt om skolen, så finner vi riktig oppstart sammen.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-700 md:text-lg">
            I denne fasen setter vi opp skolebruk i dialog med dere. Skolen
            betaler for lærere og voksne som trenger tilgang. Elevene kan bruke
            opplegg og aktiviteter i klasserommet uten ekstra kostnad.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <fieldset>
              <legend className="text-sm font-semibold text-slate-900">Hva ønsker dere?</legend>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ChoiceCard
                  checked={requestType === "startup"}
                  description="Vi vil se på behov, skoleoppsett, lærertilgang og en ryddig oppstart."
                  icon={<Rocket size={18} />}
                  label="Vi vil planlegge oppstart"
                  name="requestType"
                  onChange={() => setRequestType("startup")}
                  value="startup"
                />
                <ChoiceCard
                  checked={requestType === "info"}
                  description="Vi vil avklare muligheter, pris, personvern eller praktiske detaljer først."
                  icon={<HelpCircle size={18} />}
                  label="Vi vil ha mer informasjon"
                  name="requestType"
                  onChange={() => setRequestType("info")}
                  value="info"
                />
              </div>
            </fieldset>

            <fieldset className="mt-6">
              <legend className="text-sm font-semibold text-slate-900">Hvordan skal vi kontakte dere?</legend>
              <div className="mt-3 flex flex-wrap gap-3">
                <ContactChoice
                  checked={preferredContact === "email"}
                  icon={<Mail size={17} />}
                  label="E-post"
                  name="preferredContact"
                  onChange={() => setPreferredContact("email")}
                  value="email"
                />
                <ContactChoice
                  checked={preferredContact === "phone"}
                  icon={<Phone size={17} />}
                  label="Telefon"
                  name="preferredContact"
                  onChange={() => setPreferredContact("phone")}
                  value="phone"
                />
              </div>
            </fieldset>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-x-7 md:gap-y-5">
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
                    Aktuelt omfang
                  </label>
                  <p className="mt-1 text-sm text-slate-600">
                    Velg omtrent hvor mange lærere, ansatte og vikarer som kan
                    trenge tilgang.
                  </p>
                </div>
                <div className="text-3xl font-semibold text-slate-950">
                  {teacherCount} <span className="text-base font-medium text-slate-600">voksne</span>
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
                placeholder="Eventuelle avdelinger, ønsket oppstart, fakturainfo eller praktiske detaljer."
              />
            </label>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="submit"
                disabled={status === "sending"}
                className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
              >
                {status === "sending"
                  ? "Sender..."
                  : requestType === "startup"
                    ? "Send oppstartsforespørsel"
                    : "Send forespørsel"}
              </button>

              {status === "sent" ? (
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700">
                  <Check size={16} />
                  {requestType === "startup"
                    ? "Oppstartsforespørselen er sendt. Vi tar kontakt."
                    : "Forespørselen er sendt. Vi tar kontakt."}
                </p>
              ) : null}

              {status === "error" ? (
                <p className="text-sm font-semibold text-rose-700">
                  Forespørselen kunne ikke sendes akkurat nå. Prøv igjen om litt.
                </p>
              ) : null}
            </div>
          </form>
        </section>

        <aside className="md:sticky md:top-20 md:self-start">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="relative aspect-[4/3] bg-sky-100">
              <Image
                src="/landingschool/teacher_helping.jpg"
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
                  <p className="text-sm font-semibold text-slate-900">Oppstartsforespørsel</p>
                  <p className="text-sm text-slate-600">Vi tar kontakt før avtale settes opp</p>
                </div>
              </div>

              <div className="mt-6 space-y-3 rounded-2xl bg-slate-50 p-4">
                <SummaryRow label="Omtrent antall voksne" value={`${teacherCount}`} />
                <SummaryRow label="Elever i klasserommet" value="Uten ekstra kostnad" />
                <SummaryRow label="Neste steg" value="Avklaring og oppsett" strong />
              </div>

              <p className="mt-4 text-sm leading-6 text-slate-600">
                Antallet er bare et utgangspunkt. Vi avklarer behov, praktisk
                oppsett og vilkår før skolen tar stilling.
              </p>
            </div>
          </div>
        </aside>
      </div>
      )}
    </main>
  );
}

function ChoiceCard(props: {
  checked: boolean;
  description: string;
  icon: ReactNode;
  label: string;
  name: string;
  onChange: () => void;
  value: string;
}) {
  return (
    <label
      className={[
        "flex cursor-pointer gap-3 rounded-xl border p-4 transition",
        props.checked ? "border-sky-500 bg-sky-50" : "border-slate-200 bg-white hover:border-slate-300",
      ].join(" ")}
    >
      <input
        checked={props.checked}
        className="sr-only"
        name={props.name}
        onChange={props.onChange}
        type="radio"
        value={props.value}
      />
      <span
        className={[
          "mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          props.checked ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600",
        ].join(" ")}
      >
        {props.icon}
      </span>
      <span>
        <span className="block text-sm font-semibold text-slate-950">{props.label}</span>
        <span className="mt-1 block text-sm leading-5 text-slate-600">{props.description}</span>
      </span>
    </label>
  );
}

function ContactChoice(props: {
  checked: boolean;
  icon: ReactNode;
  label: string;
  name: string;
  onChange: () => void;
  value: string;
}) {
  return (
    <label
      className={[
        "inline-flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition",
        props.checked ? "border-sky-500 bg-sky-50 text-sky-900" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
      ].join(" ")}
    >
      <input
        checked={props.checked}
        className="sr-only"
        name={props.name}
        onChange={props.onChange}
        type="radio"
        value={props.value}
      />
      {props.icon}
      {props.label}
    </label>
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
