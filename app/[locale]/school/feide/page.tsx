import Image from "next/image";
import Link from "next/link";
import { getLocale } from "next-intl/server";
import { FeideDocumentationClient } from "./FeideDocumentationClient";

function localizedPath(locale: string, path: string) {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `/${locale}${clean}`;
}

export default async function SchoolFeideDocumentationPage() {
  const locale = (await getLocale()) as string;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href={localizedPath(locale, "/")} className="flex items-center gap-3">
            <Image src="/logo321ny.png" alt="321school" width={38} height={38} priority className="h-9 w-auto object-contain" />
            <span className="text-lg font-black">321school</span>
          </Link>
          <Link href={localizedPath(locale, "/school/trust")} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50">
            Tilbake til Trust Center
          </Link>
        </div>
      </header>

      <FeideDocumentationClient locale={locale} />
    </main>
  );
}
