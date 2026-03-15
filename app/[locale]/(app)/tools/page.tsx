// app/[locale]/(app)/tools/page.tsx
"use client";

import Link from "next/link";
import { useLocale } from "next-intl";

type ToolBadge = "NEW" | "POPULAR" | "BETA";

type Tool = {
  href: string;
  title: string;
  description: string;
  icon: string;
  badge?: ToolBadge;
  gradient: string;
};

const tools: Tool[] = [
  {
    href: "/tools/translate",
    title: "Translator",
    description: "Translate words, sentences and short texts between languages.",
    icon: "🌍",
    badge: "POPULAR",
    gradient: "from-sky-50 to-white",
  },
  {
    href: "/tools/generator",
    title: "Reading generator",
    description: "Create a short reading text with auto-corrected questions.",
    icon: "📖",
    badge: "NEW",
    gradient: "from-violet-50 to-white",
  },
  {
    href: "/tools/vocab",
    title: "Glossary generator",
    description: "Build vocabulary lists from a topic or text.",
    icon: "🧠",
    badge: "BETA",
    gradient: "from-emerald-50 to-white",
  },
  {
  href: "/tools/sentence-fixer",
  title: "Sentence fixer",
  description: "Fix grammar and make sentences clearer.",
  icon: "✏️",
  badge: "NEW",
  gradient: "from-rose-50 to-white",
},
{
  href: "/tools/speaking-topic",
  title: "Speaking topics",
  description: "Generate a topic and follow-up questions for speaking practice.",
  icon: "🎲",
  badge: "NEW",
  gradient: "from-amber-50 to-white",
},
];

function badgeClass(badge?: ToolBadge) {
  if (badge === "NEW") return "bg-slate-900 text-white";
  if (badge === "POPULAR") return "bg-amber-100 text-amber-800 border border-amber-200";
  if (badge === "BETA") return "bg-indigo-100 text-indigo-700 border border-indigo-200";
  return "bg-slate-100 text-slate-700";
}

export default function ToolsPage() {
  const locale = useLocale();

  return (
    <main className="relative mx-auto max-w-6xl px-4 py-10">

      {/* background glow */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-[-200px] top-[-120px] h-[420px] w-[420px] rounded-full bg-sky-200/30 blur-3xl" />
        <div className="absolute right-[-200px] top-[120px] h-[420px] w-[420px] rounded-full bg-violet-200/30 blur-3xl" />
      </div>

      {/* hero */}
      <section className="rounded-3xl border border-slate-200 bg-white/70 backdrop-blur p-8 shadow-sm">
        <div className="max-w-2xl">
          <div className="mb-2 text-xs font-extrabold uppercase tracking-widest text-slate-500">
            321 Tools
          </div>

          <h1 className="text-3xl font-black tracking-tight text-slate-900">
            Small tools for learning, practice and play
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-600">
            Quick helpers for language learning. Some tools are simple, others
            may grow into full learning apps.
          </p>
        </div>
      </section>

      {/* cards */}
      <section className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {tools.map((tool) => (
          <Link
            key={tool.href}
            href={`/${locale}${tool.href}`}
            className={`group relative flex min-h-[230px] flex-col justify-between overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br ${tool.gradient} p-6 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-xl`}
          >

            {/* glow hover */}
            <div className="absolute inset-0 opacity-0 transition group-hover:opacity-100">
              <div className="absolute -top-10 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-white/40 blur-3xl" />
            </div>

            <div className="flex items-start justify-between gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-white/80 text-3xl shadow-sm">
                {tool.icon}
              </div>

              {tool.badge && (
                <span
                  className={`inline-flex h-7 items-center rounded-full px-3 text-[11px] font-extrabold tracking-wide ${badgeClass(
                    tool.badge
                  )}`}
                >
                  {tool.badge}
                </span>
              )}
            </div>

            <div className="mt-5">
              <h2 className="text-lg font-extrabold text-slate-900">
                {tool.title}
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-600">
                {tool.description}
              </p>
            </div>

            <div className="mt-6 flex items-center justify-between text-sm font-bold text-slate-800">
              <span>Open tool</span>
              <span className="transition group-hover:translate-x-1">→</span>
            </div>
          </Link>
        ))}
      </section>
    </main>
  );
}