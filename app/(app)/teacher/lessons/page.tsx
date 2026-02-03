"use client";

import Link from "next/link";
import AuthGate from "@/components/AuthGate";

export default function TeacherLessonsPage() {
  return (
    <AuthGate requireRole="teacher" requireApprovedTeacher>
      <div style={{ maxWidth: 920, margin: "0 auto", padding: 16 }}>
        <h1 style={{ margin: 0 }}>My lessons</h1>
        <p style={{ opacity: 0.8, marginTop: 8 }}>
          I den nye strukturen ligger innhold under <b>Creator</b>.
        </p>
        <p style={{ opacity: 0.8 }}>
          Gå til <Link href="/creator/lessons">Creator → My lessons</Link>.
        </p>
      </div>
    </AuthGate>
  );
}
