// app/[locale]/layout.tsx
import React from "react";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import PageTracker from "@/components/PageTracker";

const SUPPORTED_LOCALES = ["en", "nb", "pt"] as const;
type Locale = (typeof SUPPORTED_LOCALES)[number];

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  if (!SUPPORTED_LOCALES.includes(locale as Locale)) return {};

  return {
    manifest: `/${locale}/manifest.webmanifest`,
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!SUPPORTED_LOCALES.includes(locale as Locale)) notFound();

  const messages = await getMessages({ locale });

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <PageTracker />
      {children}
    </NextIntlClientProvider>
  );
}
