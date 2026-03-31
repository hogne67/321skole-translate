import { getRequestConfig } from "next-intl/server";

type AppLocale = "en" | "nb" | "pt";

function normalizeLocale(locale?: string | null): AppLocale {
  if (locale === "no") return "nb";
  if (locale === "en" || locale === "nb" || locale === "pt") return locale;
  return "en";
}

export default getRequestConfig(async ({ requestLocale }) => {
  const locale = normalizeLocale(await requestLocale);

  return {
    locale,
    messages: (await import(`../messages/${locale}/index`)).default,
  };
});