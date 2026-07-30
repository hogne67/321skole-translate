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
  thumbnail?: boolean;
  thumbnailUrl?: string;
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
  thumbnail = false,
  thumbnailUrl,
}: TrainingVideoPlayerProps) {
  const [open, setOpen] = React.useState(false);
  const source = React.useMemo(() => resolveVideoSource(videoUrl), [videoUrl]);
  const youtubeId = React.useMemo(() => getYouTubeId(videoUrl), [videoUrl]);
  const resolvedThumbnailUrl = thumbnailUrl ?? (youtubeId ? `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg` : null);
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
          thumbnail
            ? "min-h-[70px] w-full min-w-0 max-w-[320px] justify-start gap-2 rounded-[20px] border border-blue-200 bg-white/90 p-2 text-left text-slate-900 shadow-[0_10px_24px_rgba(37,99,235,0.09)] hover:bg-white sm:min-h-[84px] sm:min-w-[250px] sm:gap-3 sm:p-2.5"
            : iconOnly
              ? "h-12 w-12 rounded-full border-0 bg-transparent p-0 shadow-none hover:scale-105"
              : "h-10 rounded-xl border border-slate-200 bg-white px-4 text-slate-900 shadow-sm hover:bg-slate-50",
          className
        )}
      >
        {thumbnail ? (
          <>
            <span className="relative block aspect-video w-[76px] shrink-0 overflow-hidden rounded-[14px] bg-blue-100 sm:w-[92px]">
              {resolvedThumbnailUrl ? (
                <img src={resolvedThumbnailUrl} alt="" className="h-full w-full object-cover" aria-hidden="true" />
              ) : null}
              <span
                className="absolute left-1/2 top-1/2 grid h-7 w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-blue-600 shadow-[0_8px_18px_rgba(37,99,235,0.22)] sm:h-9 sm:w-9"
                aria-hidden="true"
              >
                <span className="ml-0.5 h-0 w-0 border-y-[6px] border-l-[9px] border-y-transparent border-l-white sm:border-y-[8px] sm:border-l-[12px]" />
              </span>
            </span>
            <span className="min-w-0">
              <span className="block break-words text-[13px] font-black leading-5 text-slate-950">{buttonLabel}</span>
              {description ? (
                <span className="mt-0.5 hidden break-words text-[13px] font-medium leading-5 text-slate-500 sm:block">
                  {description}
                </span>
              ) : null}
            </span>
          </>
        ) : iconOnly ? (
          <img src="/videobutton.png" alt="" className="h-full w-full rounded-full object-contain" aria-hidden="true" />
        ) : (
          <PlayCircle className="h-4 w-4" aria-hidden="true" />
        )}
        {iconOnly || thumbnail ? null : <span>{buttonLabel}</span>}
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
