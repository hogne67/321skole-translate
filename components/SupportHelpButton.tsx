"use client";

import { useMemo, useState } from "react";
import { LifeBuoy, Send, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { getAuth } from "firebase/auth";

import { useUserProfile } from "@/lib/useUserProfile";

const labels = {
  nb: {
    button: "Hjelp",
    title: "Meld fra",
    lead: "Gi beskjed hvis noe stopper deg. Vi bruker dette til å følge opp feil og betalingsproblemer raskt.",
    name: "Navn",
    contact: "Kontaktinfo",
    contactHint: "E-post eller telefon, hvis du ønsker svar.",
    message: "Hva skjedde?",
    placeholder: "Skriv kort hva du prøvde å gjøre, og hva som gikk galt.",
    send: "Send",
    sending: "Sender ...",
    sent: "Takk, meldingen er sendt.",
    error: "Kunne ikke sende akkurat nå.",
    categories: {
      payment: "Betaling",
      login: "Innlogging",
      content: "Innhold/deling",
      privacy: "Personvern",
      bug: "Feil i appen",
      other: "Annet",
    },
  },
  en: {
    button: "Help",
    title: "Report an issue",
    lead: "Tell us if something blocks you. We use this to follow up errors and payment issues quickly.",
    name: "Name",
    contact: "Contact info",
    contactHint: "Email or phone, if you want a reply.",
    message: "What happened?",
    placeholder: "Briefly describe what you tried to do, and what went wrong.",
    send: "Send",
    sending: "Sending ...",
    sent: "Thanks, your message was sent.",
    error: "Could not send right now.",
    categories: {
      payment: "Payment",
      login: "Login",
      content: "Content/sharing",
      privacy: "Privacy",
      bug: "App error",
      other: "Other",
    },
  },
  pt: {
    button: "Ajuda",
    title: "Avisar sobre um problema",
    lead: "Conte se algo está impedindo você. Usamos isso para acompanhar erros e problemas de pagamento rapidamente.",
    name: "Nome",
    contact: "Contato",
    contactHint: "E-mail ou telefone, se quiser resposta.",
    message: "O que aconteceu?",
    placeholder: "Descreva brevemente o que tentou fazer e o que deu errado.",
    send: "Enviar",
    sending: "Enviando ...",
    sent: "Obrigado, sua mensagem foi enviada.",
    error: "Não foi possível enviar agora.",
    categories: {
      payment: "Pagamento",
      login: "Login",
      content: "Conteúdo/compartilhamento",
      privacy: "Privacidade",
      bug: "Erro no app",
      other: "Outro",
    },
  },
} as const;

type LocaleKey = keyof typeof labels;
type CategoryKey = keyof typeof labels.nb.categories;

function localeKey(locale: string): LocaleKey {
  if (locale === "en" || locale === "pt") return locale;
  return "nb";
}

function safeProfileValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export default function SupportHelpButton({ locale }: { locale: string }) {
  const { user, profile } = useUserProfile();
  const pathname = usePathname();
  const text = labels[localeKey(locale)];
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<CategoryKey>("payment");
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const defaults = useMemo(
    () => ({
      name: safeProfileValue(profile?.displayName) || user?.displayName || "",
      contact: safeProfileValue(profile?.email) || user?.email || "",
    }),
    [profile?.displayName, profile?.email, user?.displayName, user?.email]
  );

  function openForm() {
    setName((current) => current || defaults.name);
    setContact((current) => current || defaults.contact);
    setOpen(true);
  }

  async function submit() {
    if (!message.trim() || status === "sending") return;

    try {
      setStatus("sending");
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error("Missing login");

      const response = await fetch("/api/support-tickets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          category,
          message,
          name,
          contact,
          locale,
          page: pathname,
        }),
      });

      if (!response.ok) throw new Error("Support request failed");

      setStatus("sent");
      setMessage("");
      window.setTimeout(() => {
        setOpen(false);
        setStatus("idle");
      }, 1400);
    } catch {
      setStatus("error");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openForm}
        className="fixed bottom-24 right-4 z-40 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-xl shadow-slate-900/20 hover:bg-slate-800"
      >
        <LifeBuoy size={18} aria-hidden="true" />
        {text.button}
      </button>

      {open ? (
        <div className="fixed bottom-20 right-4 z-50 max-h-[calc(100dvh-6rem)] w-[calc(100vw-2rem)] max-w-sm overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-900/20 overscroll-contain sm:bottom-24">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="m-0 text-lg font-black text-slate-950">{text.title}</h2>
              <p className="mt-1 text-sm leading-5 text-slate-600">{text.lead}</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              aria-label="Close"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {(Object.keys(text.categories) as CategoryKey[]).map((item) => (
              <label
                key={item}
                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold ${
                  category === item
                    ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
              >
                <input
                  type="radio"
                  name="support-category"
                  checked={category === item}
                  onChange={() => setCategory(item)}
                  className="h-4 w-4 accent-emerald-700"
                />
                {text.categories[item]}
              </label>
            ))}
          </div>

          <div className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm font-bold text-slate-800">
              {text.name}
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="rounded-xl border border-slate-300 px-3 py-2 font-medium text-slate-950 outline-none focus:border-emerald-500"
              />
            </label>

            <label className="grid gap-1 text-sm font-bold text-slate-800">
              {text.contact}
              <input
                value={contact}
                onChange={(event) => setContact(event.target.value)}
                placeholder={text.contactHint}
                className="rounded-xl border border-slate-300 px-3 py-2 font-medium text-slate-950 outline-none focus:border-emerald-500"
              />
            </label>

            <label className="grid gap-1 text-sm font-bold text-slate-800">
              {text.message}
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={text.placeholder}
                rows={4}
                className="resize-none rounded-xl border border-slate-300 px-3 py-2 font-medium text-slate-950 outline-none focus:border-emerald-500"
              />
            </label>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <p
              className={`m-0 text-sm font-bold ${
                status === "sent"
                  ? "text-emerald-700"
                  : status === "error"
                    ? "text-red-700"
                    : "text-slate-500"
              }`}
            >
              {status === "sent" ? text.sent : status === "error" ? text.error : ""}
            </p>
            <button
              type="button"
              onClick={submit}
              disabled={!message.trim() || status === "sending"}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-black text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Send size={16} aria-hidden="true" />
              {status === "sending" ? text.sending : text.send}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
