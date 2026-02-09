// components/ui/Button.tsx
"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

const base =
  "inline-flex items-center justify-center rounded-xl font-bold transition active:translate-y-[0.5px] disabled:opacity-70 disabled:cursor-not-allowed";

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-10 px-4 text-sm",
};

const variants: Record<Variant, string> = {
  primary: "border border-slate-900 bg-slate-900 text-white hover:bg-slate-800",
  secondary: "border border-slate-200 bg-white text-slate-900 shadow-sm hover:bg-slate-50",
  ghost: "border border-transparent bg-transparent text-slate-900 hover:bg-slate-50",
  danger: "border border-rose-600 bg-rose-600 text-white hover:bg-rose-700",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "secondary", size = "md", ...props },
  ref
) {
  return (
    <button ref={ref} className={cn(base, sizes[size], variants[variant], className)} {...props} />
  );
});