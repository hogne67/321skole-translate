import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getMathGeneratorCopy, MATH_GENERATORS } from "@/lib/math/generators";

function TaskSample({ id }: { id: typeof MATH_GENERATORS[number]["id"] }) {
  if (id === "equations") return <div aria-hidden="true" className="flex h-20 items-center gap-2 text-xl font-bold text-slate-900"><span>2x + 3 = 11</span></div>;
  if (id === "percentage") return <div aria-hidden="true" className="flex h-20 items-center gap-2 text-xl font-bold text-slate-900"><span className="grid gap-1 text-center"><span className="h-5 w-10 border border-dashed border-slate-400" /><span className="border-t-2 border-slate-900" /><span className="h-5 w-10 border border-dashed border-slate-400" /></span><span>× 100 =</span><span className="h-7 w-10 border border-dashed border-slate-400" /><span>%</span></div>;
  if (id === "comparison") return <div aria-hidden="true" className="flex h-20 items-center gap-3 text-xl font-bold text-slate-900"><span className="grid text-center"><span className="border-b-2 border-slate-900">1</span><span>2</span></span><span className="h-8 w-8 border border-dashed border-slate-400" /><span>50 %</span></div>;
  if (id === "measurement") return <div aria-hidden="true" className="flex h-20 items-center gap-2 text-xl font-bold text-slate-900"><span>300 cm =</span><span className="h-8 w-10 border border-dashed border-slate-400" /><span>m</span></div>;
  if (id === "geometry") return <svg viewBox="0 0 180 80" className="h-20 w-44" aria-hidden="true"><rect x="10" y="15" width="52" height="52" fill="#d1fae5" stroke="#047857" strokeWidth="2" /><path d="M90 67L128 13L165 67Z" fill="#e0f2fe" stroke="#0284c7" strokeWidth="2" /></svg>;
  if (id === "fractions") return <svg viewBox="0 0 180 80" className="h-20 w-44" aria-hidden="true"><rect x="10" y="22" width="160" height="36" fill="white" stroke="#334155" /><rect x="10" y="22" width="120" height="36" fill="#10b981" stroke="#334155" />{[50, 90, 130].map(x => <path key={x} d={`M${x} 22V58`} stroke="#334155" />)}</svg>;
  if (id === "fractionCalculation") return <div aria-hidden="true" className="flex h-20 items-center gap-3 text-xl font-bold text-slate-900"><span className="grid text-center"><span className="border-b-2 border-slate-900">1</span><span>4</span></span><span>+</span><span className="grid text-center"><span className="border-b-2 border-slate-900">2</span><span>4</span></span><span>=</span><span className="grid gap-1"><span className="h-5 w-7 border border-dashed border-slate-400" /><span className="h-5 w-7 border border-dashed border-slate-400" /></span></div>;
  return <div aria-hidden="true" className="flex h-20 items-center gap-2 text-xl font-bold text-slate-900"><span>24 + 18 =</span><span className="h-8 w-10 border border-dashed border-slate-400" /></div>;
}

export default function MathGeneratorOverview({ locale, isGuest = false }: { locale: string; isGuest?: boolean }) {
  const copy = getMathGeneratorCopy(locale);
  return <main className="mx-auto max-w-5xl px-4 py-8 text-slate-900">
    <h1 className="mb-6 text-2xl font-extrabold">{copy.title}</h1>
    <div className="grid gap-4 sm:grid-cols-2">
      {MATH_GENERATORS.map(item => {
        const href = `/${locale}/producer/math/${item.path}`;
        return <Link key={item.id} href={isGuest ? `/${locale}/login?next=${encodeURIComponent(href)}` : href} className="group min-w-0 rounded-lg border border-slate-200 bg-white p-5 text-slate-900 no-underline transition hover:border-teal-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600">
          <TaskSample id={item.id} />
          <div className="mt-3 flex items-center justify-between gap-3"><h2 className="m-0 text-lg font-bold">{copy[item.id]}</h2><ArrowRight size={20} aria-hidden="true" className="shrink-0 text-teal-700" /></div>
          <p className="mb-0 mt-2 text-sm leading-6 text-slate-600">{copy[`${item.id}Description`]}</p>
        </Link>;
      })}
    </div>
  </main>;
}
