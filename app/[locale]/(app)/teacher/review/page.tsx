"use client";

import Link from "next/link";
import AuthGate from "@/components/AuthGate";

export default function TeacherReviewPage() {
  return (
    <AuthGate requireRole="teacher" requireApprovedTeacher>
      <div style={{ maxWidth: 920, margin: "0 auto", padding: 16 }}>
        <h1 style={{ margin: 0 }}>Review</h1>
        <p style={{ opacity: 0.8, marginTop: 8 }}>
          Her kommer vurderingskø (innleveringer med status <code>new</code>).
        </p>
        <p style={{ opacity: 0.8 }}>
          Foreløpig: gå til <Link href="/teacher/spaces">Spaces</Link> og åpne en lesson der.
        </p>
      </div>
    </AuthGate>
  );
}
