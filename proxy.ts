import createMiddleware from "next-intl/middleware";

export default createMiddleware({
  locales: ["en", "no", "pt"],
  defaultLocale: "en",
  localePrefix: "always",
});

export const config = {
  matcher: [
    // Kjør middleware på alt, unntatt:
    // - /api
    // - /_next
    // - filer med extension (.*\..*)
    // - /space (første segment)
    // - /321lessons (første segment)
    "/((?!api|_next|.*\\..*|space(?:/|$)|321lessons(?:/|$)).*)",
  ],
};