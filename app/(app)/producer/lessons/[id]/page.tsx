// app/lessons/[id]/page.tsx
"use client";

import { useParams } from "next/navigation";
import { useEffect } from "react";

export default function LessonAliasRedirectPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  useEffect(() => {
    if (!id) return;
    // Ruta du faktisk bruker:
    window.location.replace(`/producer/lesson/${id}`);
  }, [id]);

  return null;
}
