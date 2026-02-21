import createMiddleware from "next-intl/middleware";

export default createMiddleware({
  locales: ["en", "no"],
  defaultLocale: "en",
  localePrefix: "always", // enklest nå: /en/... og /no/...
});

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};