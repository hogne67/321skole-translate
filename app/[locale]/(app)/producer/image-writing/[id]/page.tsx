import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{
    locale: string;
    id: string;
  }>;
};

export default async function ImageWritingEditRedirectPage({ params }: PageProps) {
  const { locale, id } = await params;
  redirect(`/${locale}/producer/image-writing?edit=${id}`);
}
