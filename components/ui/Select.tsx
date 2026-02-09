// components/ui/Select.tsx
"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, children, ...props },
  ref
) {
  return (
    <select
      ref={ref}
      className={cn(
        "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none",
        "focus:border-slate-400 focus:ring-2 focus:ring-slate-200",
        "border-solid",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
});