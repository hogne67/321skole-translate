"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AuthGate from "@/components/AuthGate";

export default function TeacherNewLessonRedirect() {
  return (
    <AuthGate requireRole="teacher" requireApprovedTeacher>
      <Inner />
    </AuthGate>
  );
}

function Inner() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/creator/lessons/new"); // eller "/producer/texts/new"
  }, [router]);

  return <div style={{ padding: 16, opacity: 0.8 }}>Åpner…</div>;
}
