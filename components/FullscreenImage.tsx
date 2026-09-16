"use client";

import { Maximize2, X } from "lucide-react";
import React, { useEffect, useState } from "react";

type FullscreenImageProps = {
  src: string;
  alt: string;
  fit?: "cover" | "contain";
  className?: string;
  style?: React.CSSProperties;
  sizes?: string;
};

export default function FullscreenImage({
  src,
  alt,
  fit = "cover",
  className,
  style,
  sizes,
}: FullscreenImageProps) {
  const [open, setOpen] = useState(false);
  const isInline = src.startsWith("data:") || src.startsWith("blob:");

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const imageStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: fit,
    ...style,
  };

  return (
    <>
      <div className="relative h-full w-full">
        <img src={src} alt={alt} className={className} sizes={sizes} style={imageStyle} />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-black/55 text-white shadow-sm backdrop-blur transition hover:bg-black/70 focus:outline-none focus:ring-2 focus:ring-white"
          aria-label="Vis bildet i fullskjerm"
          title="Vis bildet i fullskjerm"
        >
          <Maximize2 aria-hidden="true" size={18} />
        </button>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/92 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={() => setOpen(false)}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-white/10 text-white shadow-sm backdrop-blur transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white"
            aria-label="Lukk fullskjerm"
            title="Lukk"
          >
            <X aria-hidden="true" size={22} />
          </button>
          <img
            src={src}
            alt={alt}
            className={isInline ? undefined : className}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              width: "auto",
              height: "auto",
              objectFit: "contain",
            }}
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </>
  );
}
