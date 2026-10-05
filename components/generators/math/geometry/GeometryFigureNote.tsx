import { getGeometryFigureNote } from "@/lib/math/geometry/measurements";
import type { FigureSpec, WorksheetLanguage } from "@/lib/math/geometry/types";

export default function GeometryFigureNote({ figure, language }: {
  figure?: FigureSpec;
  language: WorksheetLanguage;
}) {
  const note = getGeometryFigureNote(figure, language);
  return note ? <p className="figure-meta-text text-xs text-slate-600">{note}</p> : null;
}
