import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";

const intlMiddleware = createMiddleware({
  locales: ["en", "nb", "pt"],
  defaultLocale: "en",
  localePrefix: "always",
});

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const plannerMatch = pathname.match(/^\/(en|pt)(\/teacher\/planner(?:\/.*)?|\/teacher\/planner)$/);

  if (plannerMatch) {
    const url = request.nextUrl.clone();
    url.pathname = `/nb${plannerMatch[2]}`;
    return NextResponse.redirect(url);
  }

  return intlMiddleware(request);
}

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
