import { CoursesMarketplaceView, generateMetadata } from "../../../../courses/page";

type PageProps = {
  params: Promise<{
    locale: string;
  }>;
  searchParams?: Promise<{
    q?: string;
  }>;
};

export { generateMetadata };

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export default async function AcademyMarketplacePage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const sp = searchParams ? await searchParams : {};
  return <CoursesMarketplaceView locale={locale} insideApp q={safeString(sp?.q)} />;
}
