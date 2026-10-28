"use client";

import { useLocale } from "next-intl";

const copy = {
  nb: "Videoen er ikke innebygd. Åpne på YouTube (ekstern tjeneste).",
  en: "This video is not embedded. Open on YouTube (external service).",
  pt: "Este vídeo não está incorporado. Abrir no YouTube (serviço externo).",
};

/** An ordinary link makes no automatic request to the video provider. */
export default function ExternalTrainingVideoNotice({ href, title }: { href: string; title: string }) {
  const locale = useLocale();
  return (
    <div className="flex h-full items-center justify-center bg-slate-100 p-6 text-slate-900">
      <a href={href} target="_blank" rel="noopener noreferrer" className="underline" aria-label={title}>
        {copy[locale as keyof typeof copy] ?? copy.en}
      </a>
    </div>
  );
}
