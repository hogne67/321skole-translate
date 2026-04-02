import type { FigureSpec } from "@/lib/math/geometry/types";

export default function GeometryFigure({
  figure,
  className = "",
}: {
  figure?: FigureSpec;
  className?: string;
}) {
  if (!figure) return null;

  const svgClass = className || "h-36 w-full max-w-[260px]";

  if (figure.kind === "rectangle") {
    const width = figure.widthCm ?? 8;
    const height = figure.heightCm ?? 5;

    return (
      <svg viewBox="0 0 240 150" className={svgClass}>
        <rect
          x="40"
          y="28"
          width="160"
          height="90"
          rx="4"
          fill="white"
          stroke="#334155"
          strokeWidth="2"
        />
        <text x="120" y="20" textAnchor="middle" fontSize="11" fill="#334155">
          {width} cm
        </text>
        <text x="222" y="76" textAnchor="middle" fontSize="11" fill="#334155">
          {height} cm
        </text>
      </svg>
    );
  }

  if (figure.kind === "square") {
    const side = figure.sideCm ?? 6;

    return (
      <svg viewBox="0 0 180 160" className={className || "h-36 w-full max-w-[220px]"}>
        <rect
          x="40"
          y="30"
          width="90"
          height="90"
          rx="4"
          fill="white"
          stroke="#334155"
          strokeWidth="2"
        />
        <text x="85" y="20" textAnchor="middle" fontSize="11" fill="#334155">
          {side} cm
        </text>
        <text x="155" y="78" textAnchor="middle" fontSize="11" fill="#334155">
          {side} cm
        </text>
      </svg>
    );
  }

  if (figure.kind === "parallelogram") {
    const base = figure.baseCm ?? 10;
    const side = figure.sideCm ?? 5;
    const height = figure.heightCm ?? 4;

    return (
      <svg viewBox="0 0 260 160" className={className || "h-36 w-full max-w-[280px]"}>
        <polygon
          points="55,120 95,40 215,40 175,120"
          fill="white"
          stroke="#334155"
          strokeWidth="2"
        />
        <line
          x1="95"
          y1="40"
          x2="95"
          y2="120"
          stroke="#94a3b8"
          strokeDasharray="5 5"
          strokeWidth="2"
        />
        <text x="125" y="136" textAnchor="middle" fontSize="11" fill="#334155">
          {base} cm
        </text>
        <text x="42" y="86" textAnchor="middle" fontSize="11" fill="#334155">
          {side} cm
        </text>
        <text x="125" y="86" textAnchor="end" fontSize="11" fill="#334155">
          {height} cm
        </text>
      </svg>
    );
  }

  if (figure.kind === "rhombus") {
    const side = figure.sideCm ?? 6;
    const height = figure.heightCm ?? 4;

    return (
      <svg viewBox="0 0 260 170" className={className || "h-36 w-full max-w-[280px]"}>
        <polygon
          points="70,120 110,50 190,50 150,120"
          fill="white"
          stroke="#334155"
          strokeWidth="2"
        />
        <line
          x1="110"
          y1="50"
          x2="110"
          y2="120"
          stroke="#94a3b8"
          strokeDasharray="5 5"
          strokeWidth="2"
        />
        <text x="130" y="42" textAnchor="middle" fontSize="11" fill="#334155">
          {side} cm
        </text>
        <text x="58" y="88" textAnchor="middle" fontSize="11" fill="#334155">
          {side} cm
        </text>
        <text x="143" y="86" textAnchor="end" fontSize="11" fill="#334155">
          {height} cm
        </text>
      </svg>
    );
  }

  if (figure.kind === "trapezoid") {
    const base = figure.baseCm ?? 12;
    const top = figure.topCm ?? 8;
    const height = figure.heightCm ?? 4;
    const sideLeft = figure.sideLeftCm ?? 5;
    const sideRight = figure.sideRightCm ?? 5;

    return (
      <svg viewBox="0 0 250 170" className={className || "h-36 w-full max-w-[270px]"}>
        <polygon
          points="45,122 80,44 170,44 205,122"
          fill="white"
          stroke="#334155"
          strokeWidth="2"
        />
        <line
          x1="80"
          y1="44"
          x2="80"
          y2="122"
          stroke="#94a3b8"
          strokeDasharray="5 5"
          strokeWidth="2"
        />
        <text x="125" y="34" textAnchor="middle" fontSize="11" fill="#334155">
          {top} cm
        </text>
        <text x="125" y="143" textAnchor="middle" fontSize="11" fill="#334155">
          {base} cm
        </text>
        <text x="28" y="86" textAnchor="middle" fontSize="11" fill="#334155">
          {sideLeft} cm
        </text>
        <text x="222" y="86" textAnchor="middle" fontSize="11" fill="#334155">
          {sideRight} cm
        </text>
        <text x="120" y="105" textAnchor="end" fontSize="11" fill="#334155">
          {height} cm
        </text>
      </svg>
    );
  }

  if (figure.kind === "triangle_right") {
    const base = figure.baseCm ?? 6;
    const leftSide = figure.sideBcm ?? 8;
    const hyp = figure.sideCcm ?? 10;

    return (
      <svg viewBox="0 0 240 170" className={className || "h-36 w-full max-w-[250px]"}>
        <polygon
          points="45,130 45,50 165,130"
          fill="white"
          stroke="#334155"
          strokeWidth="2"
        />
        <line
          x1="45"
          y1="50"
          x2="45"
          y2="130"
          stroke="#94a3b8"
          strokeDasharray="5 5"
          strokeWidth="2"
        />
        <text x="100" y="146" textAnchor="middle" fontSize="11" fill="#334155">
          {base} cm
        </text>
        <text x="20" y="94" textAnchor="middle" fontSize="11" fill="#334155">
          {leftSide} cm
        </text>
        <text x="122" y="86" textAnchor="middle" fontSize="11" fill="#334155">
          {hyp} cm
        </text>
      </svg>
    );
  }

  if (figure.kind === "triangle_isosceles") {
    const base = figure.baseCm ?? 8;
    const leftSide = figure.sideBcm ?? 5;
    const rightSide = figure.sideCcm ?? 5;
    const height = figure.heightCm ?? 4;

    return (
      <svg viewBox="0 0 240 170" className={className || "h-36 w-full max-w-[250px]"}>
        <polygon
          points="45,130 105,40 165,130"
          fill="white"
          stroke="#334155"
          strokeWidth="2"
        />
        <line
          x1="105"
          y1="40"
          x2="105"
          y2="130"
          stroke="#94a3b8"
          strokeDasharray="5 5"
          strokeWidth="2"
        />
        <text x="105" y="146" textAnchor="middle" fontSize="11" fill="#334155">
          {base} cm
        </text>
        <text x="50" y="88" textAnchor="middle" fontSize="11" fill="#334155">
          {leftSide} cm
        </text>
        <text x="160" y="88" textAnchor="middle" fontSize="11" fill="#334155">
          {rightSide} cm
        </text>
        <text x="135" y="110" textAnchor="end" fontSize="11" fill="#334155">
          {height} cm
        </text>
      </svg>
    );
  }

  if (figure.kind === "triangle_equilateral") {
    const side = figure.sideCm ?? figure.sideAcm ?? 6;
    const height = figure.heightCm ?? 5.2;

    return (
      <svg viewBox="0 0 240 170" className={className || "h-36 w-full max-w-[250px]"}>
        <polygon
          points="45,130 105,40 165,130"
          fill="white"
          stroke="#334155"
          strokeWidth="2"
        />
        <line
          x1="105"
          y1="40"
          x2="105"
          y2="130"
          stroke="#94a3b8"
          strokeDasharray="5 5"
          strokeWidth="2"
        />
        <text x="105" y="146" textAnchor="middle" fontSize="11" fill="#334155">
          {side} cm
        </text>
        <text x="50" y="88" textAnchor="middle" fontSize="11" fill="#334155">
          {side} cm
        </text>
        <text x="160" y="88" textAnchor="middle" fontSize="11" fill="#334155">
          {side} cm
        </text>
        <text x="144" y="115" textAnchor="end" fontSize="11" fill="#334155">
          {height} cm
        </text>
      </svg>
    );
  }

  const radius = figure.radiusCm ?? 5;

  return (
    <svg viewBox="0 0 220 170" className={className || "h-36 w-full max-w-[240px]"}>
      <circle
        cx="110"
        cy="85"
        r="50"
        fill="white"
        stroke="#334155"
        strokeWidth="2"
      />
      <line
        x1="110"
        y1="85"
        x2="160"
        y2="85"
        stroke="#94a3b8"
        strokeDasharray="5 5"
        strokeWidth="2"
      />
      <text x="135" y="76" textAnchor="middle" fontSize="11" fill="#334155">
        {radius} cm
      </text>
    </svg>
  );
}