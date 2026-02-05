// app/Providers.tsx
"use client";

import React from "react";
import { ModeProvider } from "@/components/ModeProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <ModeProvider>{children}</ModeProvider>;
}
