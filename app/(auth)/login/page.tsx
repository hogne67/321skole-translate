// app/(auth)/login/page.tsx
import { Suspense } from "react";
import LoginClient from "./LoginClient";

export default function LoginPage() {
  return (
    <Suspense fallback={<main style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}><p>Laster…</p></main>}>
      <LoginClient />
    </Suspense>
  );
}
