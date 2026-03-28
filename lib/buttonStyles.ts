// lib/buttonStyles.ts
export type ButtonVariant = "primary" | "secondary" | "danger" | "success" | "nav" | "navActive" | "navTools";

export function buttonClass(variant: ButtonVariant = "secondary") {
  if (variant === "primary") {
    return "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-extrabold bg-emerald-600 text-white hover:bg-emerald-500 active:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50";
  }

  if (variant === "danger") {
    return "inline-flex items-center justify-center rounded-xl border border-red-200 px-4 py-2 text-sm font-extrabold bg-red-50 text-red-700 hover:bg-red-100 active:bg-red-200 disabled:cursor-not-allowed disabled:opacity-50";
  }

  if (variant === "success") {
    return "inline-flex items-center justify-center rounded-xl border border-green-200 px-4 py-2 text-sm font-extrabold bg-green-50 text-green-800 hover:bg-green-100 active:bg-green-200 disabled:cursor-not-allowed disabled:opacity-50";
  }

  if (variant === "navTools") {
    return "inline-flex whitespace-nowrap rounded-full border border-emerald-700 bg-emerald-600 px-3 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-500";
  }

  if (variant === "navActive") {
    return "inline-flex whitespace-nowrap rounded-full border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-bold text-white";
  }

  if (variant === "nav") {
    return "inline-flex whitespace-nowrap rounded-full border border-black/15 bg-white px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50";
  }

  return "inline-flex items-center justify-center rounded-xl border border-slate-300 px-4 py-2 text-sm font-extrabold bg-white text-slate-800 hover:bg-slate-50 active:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50";
}