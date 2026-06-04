"use client";

import * as React from "react";
import { ExternalLink, PlayCircle, X } from "lucide-react";
import { cn } from "@/lib/cn";

type TrainingVideoPlayerProps = {
  title: string;
  videoUrl: string;
  buttonLabel?: string;
  buttonTitle?: string;
  closeLabel?: string;
  description?: string;
  className?: string;
  iconOnly?: boolean;
};

type VideoSource =
  | { type: "youtube"; embedUrl: string; watchUrl: string }
  | { type: "file"; src: string };

function getYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      return u.pathname.split("/").filter(Boolean)[0] ?? null;
    }

    if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      if (u.pathname.startsWith("/shorts/") || u.pathname.startsWith("/embed/")) {
        return u.pathname.split("/").filter(Boolean)[1] ?? null;
      }

      return u.searchParams.get("v");
    }
  } catch {
    return null;
  }

  return null;
}

function resolveVideoSource(videoUrl: string): VideoSource {
  const youtubeId = getYouTubeId(videoUrl);

  if (youtubeId) {
    return {
      type: "youtube",
      embedUrl: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(
        youtubeId
      )}?autoplay=1&rel=0&modestbranding=1`,
      watchUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(youtubeId)}`,
    };
  }

  return { type: "file", src: videoUrl };
}

export default function TrainingVideoPlayer({
  title,
  videoUrl,
  buttonLabel = "Se opplæring",
  buttonTitle,
  closeLabel = "Lukk",
  description,
  className,
  iconOnly = false,
}: TrainingVideoPlayerProps) {
  const [open, setOpen] = React.useState(false);
  const source = React.useMemo(() => resolveVideoSource(videoUrl), [videoUrl]);
  const titleId = React.useId();

  React.useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={buttonTitle ?? buttonLabel}
        aria-label={iconOnly ? buttonTitle ?? buttonLabel : undefined}
        className={cn(
          "inline-flex items-center justify-center gap-2 text-sm font-bold transition active:translate-y-px",
          iconOnly
            ? "h-12 w-12 rounded-full border-0 bg-transparent p-0 shadow-none hover:scale-105"
            : "h-10 rounded-xl border border-slate-200 bg-white px-4 text-slate-900 shadow-sm hover:bg-slate-50",
          className
        )}
      >
        {iconOnly ? (
          <img src="/videobutton.png" alt="" className="h-full w-full rounded-full object-contain" aria-hidden="true" />
        ) : (
          <PlayCircle className="h-4 w-4" aria-hidden="true" />
        )}
        {iconOnly ? null : <span>{buttonLabel}</span>}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/72 p-3 sm:p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-4 sm:p-5">
              <div className="min-w-0">
                <h2 id={titleId} className="break-words text-lg font-extrabold text-slate-950 sm:text-xl">
                  {title}
                </h2>
                {description ? (
                  <p className="mt-1 break-words text-sm text-slate-600">{description}</p>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
                aria-label="Lukk video"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="bg-black">
              <div className="aspect-video w-full">
                {source.type === "youtube" ? (
                  <iframe
                    className="h-full w-full"
                    src={source.embedUrl}
                    title={title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                ) : (
                  <video className="h-full w-full" src={source.src} controls autoPlay playsInline />
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 px-4 py-3 sm:px-5">
              {source.type === "youtube" ? (
                <a
                  href={source.watchUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-bold text-slate-700 hover:text-slate-950"
                >
                  Åpne på YouTube
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
              ) : null}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-bold text-white transition hover:bg-slate-800"
              >
                {closeLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
