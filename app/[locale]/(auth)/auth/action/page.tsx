import { Suspense } from "react";
import AuthActionClient from "./AuthActionClient";

function LoadingFallback() {
  return (
    <main style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
      <p>Loading...</p>
    </main>
  );
}

export default function AuthActionPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <AuthActionClient />
    </Suspense>
  );
}
