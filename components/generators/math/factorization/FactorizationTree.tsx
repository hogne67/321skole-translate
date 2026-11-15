"use client";

import { factorTreeLayout, getFactorizationCopy, MAX_FACTOR_TREE_DEPTH, MAX_FACTOR_TREE_INPUTS, parseFactorizationInteger, removeFactorTreeBranch, splitFactorTree } from "@/lib/math/factorization/worksheet";

export default function FactorizationTree({ number, nodes, language, label, printMode = false, readOnly = false, answerKey = false, onChange }: { number: number; nodes: Record<string, string>; language: string; label: string; printMode?: boolean; readOnly?: boolean; answerKey?: boolean; onChange?: (nodes: Record<string, string>) => void }) {
  const copy = getFactorizationCopy(language), layout = factorTreeLayout(nodes), byPath = new Map(layout.points.map(point => [point.path, point]));
  return <div className="factor-tree">
    <div className="factor-tree-scroll" role="region" aria-label={`${label}: ${copy.tree}`} tabIndex={printMode ? undefined : 0}><svg className="factor-tree-diagram" style={{ minWidth: !printMode && layout.width > 360 ? Math.min(layout.width, 560) : undefined }} viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label={`${label}: ${copy.tree}`}>
      <title>{`${copy.tree}: ${number}`}</title>
      {layout.points.filter(point => point.path !== "r").map(point => { const parent = byPath.get(point.path.slice(0, -1))!; return <line key={point.path} x1={parent.x} y1={parent.y + 17} x2={point.x} y2={point.y - 17} stroke="#64748b" strokeWidth="2" />; })}
      {layout.points.map(point => <g key={point.path} className={answerKey && point.leaf ? "factor-tree-prime" : ""}>
        <circle cx={point.x} cy={point.y} r={20} fill="white" stroke="#334155" strokeWidth={answerKey && point.leaf ? 3 : 1.5} />
        <text x={point.x} y={point.y + 5} textAnchor="middle" fontSize="15" textLength={point.path !== "r" && (nodes[point.path]?.length ?? 0) > 4 ? 34 : undefined} lengthAdjust="spacingAndGlyphs" fill="#0f172a" fontWeight={point.path === "r" ? 700 : 500}>{point.path === "r" ? number : nodes[point.path] || "□"}</text>
        {!answerKey && !printMode && point.label ? <text x={point.x + 25} y={point.y + 4} fontSize="12" fill="#475569">{point.label}</text> : null}
      </g>)}
    </svg></div>
    {printMode && !answerKey ? <><p className="factorization-hint">{copy.paperTreeHelp}</p><div className="factor-tree-paper-space" /></> : null}
    {!printMode && !answerKey ? <><p className="factorization-hint">{copy.treeHelp}</p><div className="factor-tree-fields">{layout.points.filter(point => point.path !== "r").map(point => {
      const hasChildren = byPath.has(point.path + "0"), integer = parseFactorizationInteger(nodes[point.path]), limit = point.path.length > MAX_FACTOR_TREE_DEPTH || Object.keys(nodes).length + 2 > MAX_FACTOR_TREE_INPUTS;
      return <div className="factor-tree-field" key={point.path}><label><span>{point.label}</span><input type="text" inputMode="numeric" autoComplete="off" maxLength={12} aria-label={`${label}: ${copy.factor} ${point.label}`} value={nodes[point.path] ?? ""} readOnly={readOnly} onChange={event => onChange?.({ ...nodes, [point.path]: event.target.value })} /></label>
        {!readOnly ? <button type="button" disabled={!hasChildren && (integer === null || integer < 2 || limit)} title={limit && !hasChildren ? copy.treeLimit : undefined} aria-label={`${hasChildren ? copy.remove : copy.split}: ${point.label}`} onClick={() => onChange?.(hasChildren ? removeFactorTreeBranch(nodes, point.path) : splitFactorTree(nodes, point.path))}>{hasChildren ? copy.remove : copy.split}</button> : null}
      </div>;
    })}</div></> : null}
  </div>;
}
