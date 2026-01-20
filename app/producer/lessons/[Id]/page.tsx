import { redirect } from "next/navigation";

export default function ProducerLessonAlias({ params }: { params: { id: string } }) {
  // Bytt til den ruta du faktisk har:
  redirect(`/producer/lesson/${params.id}`);
}
