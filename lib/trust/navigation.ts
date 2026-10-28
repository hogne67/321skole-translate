import { translated as t } from "./schoolFacts";

export function trustNavigation(locale: string) {
  return [
    { href: "/school/trust", label: t(locale, ["Oversikt", "Overview", "Visão geral"]) },
    { href: "/school/privacy", label: t(locale, ["Skolepersonvern", "School privacy", "Privacidade escolar"]) },
    { href: "/school/dpa", label: t(locale, ["DBA og bilag", "DPA and annexes", "Acordo e anexos"]) },
    { href: "/school/subprocessors", label: t(locale, ["Leverandører", "Providers", "Fornecedores"]) },
    { href: "/school/feide", label: t(locale, ["Kommunerapport", "Municipal report", "Relatório municipal"]) },
    { href: "/school/data-rights", label: t(locale, ["Innsyn og sletting", "Access and deletion", "Acesso e exclusão"]) },
    { href: "/school/ai-guidelines", label: t(locale, ["KI", "AI", "IA"]) },
    { href: "/privacy", label: t(locale, ["Generelt personvern", "General privacy", "Privacidade geral"]) },
  ];
}
