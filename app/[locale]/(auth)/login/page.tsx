import { Suspense } from "react";
import { useTranslations } from "next-intl";
import LoginClient from "./LoginClient";

function LoadingFallback() {
  const t = useTranslations("common");

  return (
    <main style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
      <p>{t("loading")}</p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <LoginClient />
    </Suspense>
  );
}