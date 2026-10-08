import { Suspense } from "react";
import OpenAIConnectionClient from "./OpenAIConnectionClient";

export default function OpenAIConnectionPage() {
  return <Suspense fallback={<p>Loading connection…</p>}><OpenAIConnectionClient /></Suspense>;
}
