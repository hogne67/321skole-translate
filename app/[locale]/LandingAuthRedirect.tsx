"use client";

import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";

export default function LandingAuthRedirect({ locale }: { locale: string }) {
  const router = useRouter();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.replace(`/${locale}/post-login`);
      }
    });

    return () => unsub();
  }, [locale, router]);

  return null;
}
