import Image from "next/image";
import Link from "next/link";
import { translated as t } from "@/lib/trust/schoolFacts";
import { trustNavigation } from "@/lib/trust/navigation";

export function TrustNavigation({ locale, currentPath }: { locale: string; currentPath: string }) {
  const isOverview = currentPath === "/school/trust";
  return (
    <header className="no-print border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={`/${locale}/school/trust`} className="flex items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-sky-700">
            <Image src="/logo321ny.png" alt="321school" width={38} height={38} priority className="h-9 w-auto object-contain" />
            <span className="text-lg font-black">321school <span className="font-medium text-slate-600">Trust Center</span></span>
          </Link>
          <Link href={`/${locale}${isOverview ? "/skoler" : "/school/trust"}`} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-sky-700">
            {isOverview ? t(locale, ["Til skolesiden", "School information", "Informações escolares"]) : t(locale, ["Tilbake til Trust Center", "Back to Trust Center", "Voltar à Central de confiança"])}
          </Link>
        </div>
        <nav aria-label={t(locale, ["Dokumenter i Trust Center", "Trust Center documents", "Documentos da Central de confiança"])} className="mt-4 flex flex-wrap gap-2">
          {trustNavigation(locale).map(item => (
            <Link key={item.href} href={`/${locale}${item.href}`} aria-current={currentPath === item.href ? "page" : undefined}
              className={`rounded-lg px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-sky-700 ${currentPath === item.href ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-700 hover:bg-slate-100"}`}>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
