"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useState } from "react";
import { authedPost } from "@/lib/authedPost";

function copyForLocale(locale: string) {
  if (locale === "pt") {
    return {
      badge: "Modo aluno",
      title: "Quer estudar por conta propria?",
      body:
        "Este usuario esta em modo aluno para turmas e Spaces. Ative o estudo individual para abrir biblioteca, ferramentas e criacao de atividades fora de uma turma.",
      activate: "Ativar estudo individual",
      activating: "Ativando...",
      login: "Entrar para estudar por conta propria",
      spaces: "Abrir Spaces",
      error: "Nao foi possivel ativar o estudo individual agora.",
    };
  }

  if (locale === "en") {
    return {
      badge: "Student mode",
      title: "Want to study on your own?",
      body:
        "This account is in student mode for classes and Spaces. Turn on self study to open the library, tools and your own task creation outside a class.",
      activate: "Turn on self study",
      activating: "Turning on...",
      login: "Log in to study on your own",
      spaces: "Open Spaces",
      error: "Could not turn on self study right now.",
    };
  }

  return {
    badge: "Elevmodus",
    title: "Vil du studere på egenhånd?",
    body:
      "Denne brukeren er i elevmodus for klasserom og Spaces. Åpne egenstudie for å bruke bibliotek, verktøy og lage egne oppgaver utenfor et klasserom.",
    activate: "Åpne egenstudie",
    activating: "Åpner...",
    login: "Logg inn for å studere på egenhånd",
    spaces: "Åpne Spaces",
    error: "Kunne ikke åpne egenstudie akkurat nå.",
  };
}

export default function StudentSelfStudyPrompt({
  isAnonymous = false,
  nextHref,
}: {
  isAnonymous?: boolean;
  nextHref?: string;
}) {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const copy = copyForLocale(locale);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentPath = nextHref || pathname || `/${locale}/student`;
  const loginHref = `/${locale}/login?next=${encodeURIComponent(currentPath)}`;

  async function activateSelfStudy() {
    setBusy(true);
    setError(null);

    try {
      await authedPost("/api/student/access-mode", {
        studentAccessMode: "self_study",
      });
      router.refresh();
    } catch {
      setError(copy.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-[55vh] w-full max-w-2xl place-items-center px-4 py-10">
      <section className="w-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-black text-sky-800">
          {copy.badge}
        </div>
        <h1 className="mt-4 text-2xl font-black text-slate-950">{copy.title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{copy.body}</p>

        {error ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-3">
          {isAnonymous ? (
            <Link
              href={loginHref}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-black text-white no-underline"
            >
              {copy.login}
            </Link>
          ) : (
            <button
              type="button"
              onClick={activateSelfStudy}
              disabled={busy}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border-0 bg-slate-950 px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? copy.activating : copy.activate}
            </button>
          )}

          <Link
            href={`/${locale}/student/spaces`}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-900 no-underline"
          >
            {copy.spaces}
          </Link>
        </div>
      </section>
    </main>
  );
}
