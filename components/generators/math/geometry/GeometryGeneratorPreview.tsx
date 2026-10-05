"use client";

import { useTranslations } from "next-intl";
import GeometryWorksheetView from "./GeometryWorksheetView";
import type { MathWorksheet } from "@/lib/math/geometry/types";
import "./geometryGenerator.css";

export default function GeometryGeneratorPreview({ worksheet, includeHints }: {
  worksheet: MathWorksheet | null;
  includeHints: boolean;
}) {
  const t = useTranslations("mathGeometry");
  const tPrint = useTranslations("mathGeometryPrint");
  const tBrand = useTranslations("brandLogo");
  return worksheet ? (
    <GeometryWorksheetView
      worksheet={worksheet}
      answerSpace={worksheet.answerSpace ?? "medium"}
      includeHints={includeHints}
      t={(key) => key === "worksheet" ? tPrint("worksheet") : t(key)}
      tBrand={tBrand}
      showIdentityFields
      showFigureMeta={false}
    />
  ) : (
    <div className="grid min-h-[560px] place-items-center border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
      <h2 className="text-xl font-black text-slate-950">{t("generator.emptyTitle")}</h2>
    </div>
  );
}
