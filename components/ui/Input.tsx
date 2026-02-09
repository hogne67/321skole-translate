// components/ui/Input.tsx
"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={cn(
        // Important: border + ring + consistent padding
        "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none",
        "focus:border-slate-400 focus:ring-2 focus:ring-slate-200",
        // Tailwind preflight sometimes sets border-width; this ensures visible border
        "border-solid",
        className
      )}
      {...props}
    />
  );
});