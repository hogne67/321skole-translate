import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getMathGeneratorCopy, MATH_GENERATORS } from "@/lib/math/generators";

function TaskSample({ id }: { id: typeof MATH_GENERATORS[number]["id"] }) {
  if (id === "sequences") return <svg viewBox="0 0 180 80" className="h-20 w-44" aria-hidden="true"><text x="8" y="47" fontSize="22" fill="#0f172a">3, 6, 9,</text><rect x="108" y="24" width="28" height="30" fill="#d1fae5" stroke="#0f766e" strokeDasharray="3 2" /><text x="116" y="47" fontSize="22" fill="#0f766e">?</text></svg>;
  if (id === "scale") return <svg viewBox="0 0 180 80" className="h-20 w-44" aria-hidden="true"><rect x="12" y="35" width="40" height="25" fill="#e0f2fe" stroke="#334155" /><rect x="100" y="10" width="64" height="40" fill="#d1fae5" stroke="#334155" /><path d="M62 40H89M82 34L89 40L82 46" fill="none" stroke="#0f766e" strokeWidth="2" /><text x="55" y="76" fontSize="16" fill="#0f766e">1 : 100</text></svg>;
  if (id === "pythagoras") return <svg viewBox="0 0 180 80" className="h-20 w-44" aria-hidden="true"><path d="M20 10V65H120Z" fill="#e0f2fe" stroke="#334155" strokeWidth="2" /><path d="M20 55H30V65" fill="none" stroke="#0f766e" strokeWidth="2" /><text x="44" y="35" fontSize="18" fill="#0f766e">c = ?</text><text x="50" y="79" fontSize="13">a² + b² = c²</text></svg>;
  if (id === "volume") return <svg viewBox="0 0 180 80" className="h-20 w-44" aria-hidden="true"><path d="M25 30L85 30L85 72L25 72Z" fill="#e0f2fe" stroke="#334155" /><path d="M25 30L48 10L108 10L85 30Z" fill="#d1fae5" stroke="#334155" /><path d="M85 30L108 10L108 52L85 72Z" fill="#bfdbfe" stroke="#334155" /><text x="122" y="49" fontSize="20" fill="#0f766e">cm³</text></svg>;
  if (id === "algebra") return <div aria-hidden="true" className="flex h-20 items-center gap-2 text-xl font-bold text-slate-900"><span>2a + a + b · b = 3a + b²</span></div>;
  if (id === "powers") return <div aria-hidden="true" className="flex h-20 items-center gap-2 text-2xl font-bold text-slate-900"><span>2³ = 2 × 2 × 2 = 8</span></div>;
  if (id === "factorization") return <div aria-hidden="true" className="flex h-20 items-center gap-2 text-lg font-bold text-slate-900"><span>36 = 2 × 2 × 3 × 3</span></div>;
  if (id === "placeValue") return <div aria-hidden="true" className="flex h-20 items-center gap-2 text-lg font-bold text-slate-900"><span>342 = 300 + 40 + 2</span></div>;
  if (id === "wordProblems") return <svg viewBox="0 0 180 80" className="h-20 w-44" aria-hidden="true"><rect x="12" y="8" width="145" height="65" rx="5" fill="#f0fdfa" stroke="#0f766e" /><path d="M26 24H140M26 35H120M26 46H88" stroke="#94a3b8" strokeWidth="3" /><text x="27" y="65" fontSize="16" fill="#0f766e">+ − × ÷</text></svg>;
  if (id === "coordinates") return <svg viewBox="0 0 180 80" className="h-20 w-44" aria-hidden="true"><path d="M40 5V75M10 40H165M65 10V72M90 10V72M115 10V72M140 10V72M10 20H165M10 60H165" fill="none" stroke="#cbd5e1" /><path d="M40 5V75M10 40H165" fill="none" stroke="#334155" strokeWidth="2" /><circle cx="90" cy="20" r="4" fill="#0f766e" /><circle cx="90" cy="60" r="4" fill="white" stroke="#0f766e" strokeWidth="2" /><text x="99" y="16" fontSize="15" fill="#0f766e">A</text></svg>;
  if (id === "statistics") return <svg viewBox="0 0 180 80" className="h-20 w-44" aria-hidden="true"><path d="M15 8V67H166" fill="none" stroke="#334155" strokeWidth="2" /><path d="M35 67V38H60V67M80 67V16H105V67M125 67V29H150V67" fill="#ccfbf1" stroke="#0f766e" strokeWidth="2" /></svg>;
  if (id === "clock") return <svg viewBox="0 0 180 80" className="h-20 w-44" aria-hidden="true"><circle cx="52" cy="40" r="32" fill="#ecfdf5" stroke="#0f766e" strokeWidth="2" /><path d="M52 16V20M76 40H72M52 64V60M28 40H32M52 40L42 30M52 40V19" fill="none" stroke="#334155" strokeWidth="3" strokeLinecap="round" /><circle cx="52" cy="40" r="3" fill="#334155" /><text x="98" y="47" fontSize="22" fontWeight="600" fill="#0f766e">10:00</text></svg>;
  if (id === "numberLine") return <svg viewBox="0 0 180 80" className="h-20 w-44" aria-hidden="true"><path d="M10 44H170M20 35V53M55 35V53M90 35V53M125 35V53M160 35V53" stroke="#334155" strokeWidth="2" /><path d="M90 38L84 25H96Z" fill="#0f766e" /><text x="20" y="70" textAnchor="middle" fontSize="15">0</text><text x="160" y="70" textAnchor="middle" fontSize="15">10</text><text x="90" y="20" textAnchor="middle" fontSize="15" fill="#0f766e">A</text></svg>;
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
