import LearningPosterGenerator from "@/components/learning-posters/LearningPosterGenerator";
export default async function LearningPostersPage({ searchParams }: { searchParams: Promise<{ lessonId?: string; posterId?: string; mode?: string }> }) {
  const params = await searchParams;
  const mode = params.mode === "manual" ? "manual" : "content";
  // Starting a new poster must not reuse the work area of a previously opened one.
  return <LearningPosterGenerator key={JSON.stringify([params.lessonId || "", params.posterId || "", mode])} initialLessonId={params.lessonId} initialPosterId={params.posterId} initialMode={mode} />;
}
