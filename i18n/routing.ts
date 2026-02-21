// i18n/routing.ts
import {defineRouting} from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "no"],
  defaultLocale: "en",
  localePrefix: "always"
});

export type AppLocale = (typeof routing.locales)[number];