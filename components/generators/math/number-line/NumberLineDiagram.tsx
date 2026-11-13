"use client";

import { useId } from "react";
import { formatNumberLineValue, getNumberLineCopy, numberLineValue, parseNumberLineAnswer, type NumberLineSettings, type NumberLineTask } from "@/lib/math/number-line/worksheet";

function TickLabel({ task, index, x, form, language }: {
  task: NumberLineTask; index: number; x: number; form: NumberLineSettings["form"]; language: string;
}) {
  const value = numberLineValue(task, index);
  if (form === "fractions" && value.d !== BigInt(1)) {
    const [numerator, denominator] = value.toFraction().split("/");
    const width = Math.max(numerator.length, denominator.length) * 9;
    return <g><text x={x} y="73" textAnchor="middle" fontSize="15">{numerator}</text><path d={`M${x - width / 2} 79H${x + width / 2}`} stroke="currentColor" /><text x={x} y="96" textAnchor="middle" fontSize="15">{denominator}</text></g>;
  }
  return <text x={x} y="82" textAnchor="middle" fontSize="18">{formatNumberLineValue(value, form, language)}</text>;
}

export default function NumberLineDiagram({ task, settings, language, answer, onSelect, answerKey = false }: {
  task: NumberLineTask; settings: NumberLineSettings; language: string; answer?: unknown;
  onSelect?: (value: string) => void; answerKey?: boolean;
}) {
  const id = useId(), copy = getNumberLineCopy(language);
  const format = (index: number) => formatNumberLineValue(numberLineValue(task, index), settings.form, language);
  const description = copy.lineDescription.replace("{start}", format(0)).replace("{end}", format(task.intervals)).replace("{count}", String(task.intervals));
  const showTarget = answerKey || task.type === "read";
  const entered = parseNumberLineAnswer(answer);
  const selected = entered?.sub(task.start).div(task.step);
  const selectedIndex = selected?.d === BigInt(1) && selected.compare(0) >= 0 && selected.compare(task.intervals) <= 0 ? selected.valueOf() : null;
  const x = (index: number) => 32 + index / task.intervals * 576;
  return <div className="number-line-graphic">
    <svg viewBox="0 0 640 110" role="img" aria-labelledby={`${id}-title ${id}-description`}>
      <title id={`${id}-title`}>{description}</title>
      <desc id={`${id}-description`}>{showTarget ? copy.marked.replace("{index}", String(task.targetIndex)) : task.type === "missing" ? copy.missingPosition.replace("{index}", String(task.targetIndex)) : copy.placePrompt.replace("{value}", format(task.targetIndex))}</desc>
      <path d="M18 44H622M18 44L25 39M18 44L25 49M622 44L615 39M622 44L615 49" fill="none" stroke="currentColor" strokeWidth="2" />
      {Array.from({ length: task.intervals + 1 }, (_, index) => {
        const target = index === task.targetIndex;
        const label = answerKey || index === 0 || index === task.intervals || (task.type === "missing" && !target) || (settings.showSupport && index % 2 === 0 && !target);
        return <g key={index}>
          <path d={`M${x(index)} 36V52`} stroke="currentColor" strokeWidth="2" />
          {label ? <TickLabel task={task} index={index} x={x(index)} form={settings.form} language={language} /> : null}
          {task.type === "missing" && target && !answerKey ? <rect x={x(index) - 22} y="63" width="44" height="28" rx="3" fill="white" stroke="#64748b" strokeDasharray="3 2" /> : null}
        </g>;
      })}
      {showTarget ? <g className="number-line-marker"><path d={`M${x(task.targetIndex)} 38L${x(task.targetIndex) - 7} 26H${x(task.targetIndex) + 7}Z`} fill="currentColor" /><text x={x(task.targetIndex)} y="20" textAnchor="middle" fontSize="18" fontWeight="700">A</text></g> : null}
      {task.type === "place" && selectedIndex !== null && !answerKey ? <circle className="number-line-selection" cx={x(selectedIndex)} cy="44" r="7" fill="currentColor" /> : null}
    </svg>
    {onSelect ? <div role="group" aria-label={copy.selectMark}>
      {Array.from({ length: task.intervals + 1 }, (_, index) => <button key={index} type="button" className="number-line-mark-button" style={{ left: `${x(index) / 640 * 100}%` }}
        aria-label={`${copy.mark} ${index}`} aria-pressed={index === selectedIndex} onClick={() => onSelect(numberLineValue(task, index).toFraction())}><span className="sr-only">{copy.mark} {index}</span></button>)}
    </div> : null}
  </div>;
}
