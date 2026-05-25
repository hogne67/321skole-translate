import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{
    locale: string;
    lessonId: string;
  }>;
};

export default async function LessonRedirectPage({ params }: PageProps) {
  const { locale, lessonId } = await params;
  redirect(`/${locale}/student/lesson/${lessonId}`);
}
