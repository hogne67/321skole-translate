import { CoursesMarketplaceView, generateMetadata } from "../../../../courses/page";

type PageProps = {
  params: Promise<{
    locale: string;
  }>;
};

export { generateMetadata };

export default async function AcademyMarketplacePage({ params }: PageProps) {
  const { locale } = await params;
  return <CoursesMarketplaceView locale={locale} insideApp />;
}
