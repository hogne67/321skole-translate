import { formatPythagorasNumber, getPythagorasCopy, type PythagorasTask } from "@/lib/math/pythagoras/worksheet";

type Point = [number, number];
export default function PythagorasFigure({ task, language }: { task: PythagorasTask; language: string }) {
  const copy = getPythagorasCopy(language), check = task.type === "check_triangle";
  const label = (side: "a" | "b" | "c") => `${side} = ${task.missing === side ? "?" : `${formatPythagorasNumber(task[side], language)} ${task.unit}`}`;
  // Deliberately use a neutral sketch for missing lengths, so its proportions cannot reveal an answer.
  const raw: Point[] = check ? [[0, 0], [task.b, 0], [(task.a ** 2 + task.b ** 2 - task.c ** 2) / (2 * task.b), Math.sqrt(Math.max(0, task.a ** 2 - ((task.a ** 2 + task.b ** 2 - task.c ** 2) / (2 * task.b)) ** 2))]] : [[0, 0], [4, 0], [0, 3]];
  const oriented = raw.map(([x, y]): Point => {
    const px = task.mirrored ? -x : x;
    return task.orientation === 1 ? [-y, px] : task.orientation === 2 ? [-px, -y] : task.orientation === 3 ? [y, -px] : [px, y];
  });
  const xs = oriented.map(p => p[0]), ys = oriented.map(p => p[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys), width = Math.max(...xs) - minX, height = Math.max(...ys) - minY;
  const scale = Math.min(140 / width, 108 / height);
  const points = oriented.map(([x, y]): Point => [170 + (x - minX - width / 2) * scale, 88 - (y - minY - height / 2) * scale]);
  const [o, p, q] = points, centroid: Point = [(o[0] + p[0] + q[0]) / 3, (o[1] + p[1] + q[1]) / 3];
  const marker = (end: Point): Point => { const length = Math.hypot(end[0] - o[0], end[1] - o[1]); return [(end[0] - o[0]) / length * 10, (end[1] - o[1]) / length * 10]; };
  const u = marker(p), v = marker(q);
  const edges: { side: "a" | "b" | "c"; from: Point; to: Point }[] = [{ side: "a", from: o, to: q }, { side: "b", from: o, to: p }, { side: "c", from: p, to: q }];
  return <figure className="pythagoras-figure"><svg viewBox="0 0 340 180" role="img" aria-label={`${copy.figure}. ${edges.map(e => label(e.side)).join(". ")}. ${check ? copy.sketch : copy.right}.`}>
    <polygon points={points.map(point => point.join(",")).join(" ")} fill="#e0f2fe" stroke="#334155" strokeWidth="2" strokeLinejoin="round" />
    {!check ? <path data-right-angle="true" d={`M${o[0] + u[0]},${o[1] + u[1]} l${v[0]},${v[1]} l${-u[0]},${-u[1]}`} fill="none" stroke="#0f766e" strokeWidth="1.6" /> : null}
    {edges.map(({ side, from, to }) => {
      const mid: Point = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2], length = Math.hypot(to[0] - from[0], to[1] - from[1]);
      let normal: Point = [-(to[1] - from[1]) / length, (to[0] - from[0]) / length];
      if (normal[0] * (centroid[0] - mid[0]) + normal[1] * (centroid[1] - mid[1]) > 0) normal = [-normal[0], -normal[1]];
      const text = label(side);
      // Keep the whole horizontal label outside the edge, including diagonal edges.
      const offset = Math.abs(normal[0]) * text.length * 4 + Math.abs(normal[1]) * 8 + 8;
      return <text key={side} x={mid[0] + normal[0] * offset} y={mid[1] + normal[1] * offset} textAnchor="middle" dominantBaseline="middle" fill={task.missing === side ? "#0f766e" : "#0f172a"} fontWeight={task.missing === side ? "bold" : "normal"}>{text}</text>;
    })}
  </svg><figcaption>{copy.sketch}</figcaption></figure>;
}
