"use client";

import { useId } from "react";
import { getClockCopy } from "@/lib/math/clock/worksheet";

export default function ClockDiagram({ hour = null, minute = null, showSupport = false, language }: {
  hour?: number | null; minute?: number | null; showSupport?: boolean; language: string;
}) {
  const id = useId(), copy = getClockCopy(language);
  const description = [hour === null ? "" : copy.hourDescription.replace("{hour}", String(hour % 12 || 12)), minute === null ? "" : copy.minuteDescription.replace("{minute}", String(minute))].filter(Boolean).join(" ");
  return <svg className="clock-diagram" viewBox="0 0 220 220" role="img" aria-labelledby={`${id}-title ${id}-desc`}>
    <title id={`${id}-title`}>{hour === null && minute === null ? copy.blankClock : copy.clock}</title><desc id={`${id}-desc`}>{description}</desc>
    <circle cx="110" cy="110" r="90" fill="white" stroke="currentColor" strokeWidth="2" />
    {Array.from({ length: 60 }, (_, i) => <line key={i} x1="110" y1="22" x2="110" y2={i % 5 === 0 ? 32 : 26} transform={`rotate(${i * 6} 110 110)`} stroke="currentColor" strokeWidth={i % 5 === 0 ? 2 : 1} />)}
    {Array.from({ length: 12 }, (_, i) => { const angle = (i + 1) * Math.PI / 6; return <text key={i} x={110 + Math.sin(angle) * 69} y={110 - Math.cos(angle) * 69} textAnchor="middle" dominantBaseline="central" fontSize="17">{i + 1}</text>; })}
    {showSupport ? Array.from({ length: 12 }, (_, i) => { const angle = i * Math.PI / 6; return <text className="clock-minute-label" key={i} x={110 + Math.sin(angle) * 102} y={110 - Math.cos(angle) * 102} textAnchor="middle" dominantBaseline="central" fontSize="9">{i * 5}</text>; }) : null}
    {hour !== null ? <line data-hand="hour" x1="110" y1="116" x2="110" y2="64" transform={`rotate(${hour % 12 * 30 + (minute ?? 0) / 2} 110 110)`} stroke="currentColor" strokeWidth="5" strokeLinecap="round" /> : null}
    {minute !== null ? <line data-hand="minute" x1="110" y1="120" x2="110" y2="44" transform={`rotate(${minute * 6} 110 110)`} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /> : null}
    <circle cx="110" cy="110" r="4" fill="currentColor" />
  </svg>;
}
