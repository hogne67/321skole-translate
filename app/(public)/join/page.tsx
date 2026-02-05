// app/(public)/join/page.tsx
import { Suspense } from "react";
import JoinClient from "./JoinClient";

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 16 }}>Loading…</div>}>
      <JoinClient />
    </Suspense>
  );
}
