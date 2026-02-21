"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

const SUPPORTED = ["no", "en"] as const;
type Locale = (typeof SUPPORTED)[number];

function getLocaleFromPath(pathname: string): Locale | null {
  const seg = pathname.split("/")[1];
  return (SUPPORTED as readonly string[]).includes(seg) ? (seg as Locale) : null;
}

function setLocaleInPath(pathname: string, nextLocale: Locale): string {
  const parts = pathname.split("/");
  const current = getLocaleFromPath(pathname);

  if (current) {
    parts[1] = nextLocale; // replace /no/... with /en/...
    return parts.join("/") || `/${nextLocale}`;
  }

  // No locale in path (e.g. /space/...) -> decide what you want:
  // Option A: keep path unchanged
  return pathname;

  // Option B: force into localized root:
  // return `/${nextLocale}`;
}

export default function LocaleSwitcher() {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();

  const current = getLocaleFromPath(pathname) ?? "no";

  function go(nextLocale: Locale) {
    const nextPath = setLocaleInPath(pathname, nextLocale);
    const qs = searchParams?.toString();
    router.push(qs ? `${nextPath}?${qs}` : nextPath);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => go("no")}
        className={`px-2 py-1 rounded-md text-sm ${
          current === "no" ? "font-semibold underline" : "opacity-80 hover:opacity-100"
        }`}
        aria-label="Bytt språk til norsk"
      >
        NO
      </button>
      <span className="opacity-40">/</span>
      <button
        type="button"
        onClick={() => go("en")}
        className={`px-2 py-1 rounded-md text-sm ${
          current === "en" ? "font-semibold underline" : "opacity-80 hover:opacity-100"
        }`}
        aria-label="Switch language to English"
      >
        EN
      </button>
    </div>
  );
}