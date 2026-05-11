"use client";

import GeometryWorksheetPracticeView from "@/components/generators/math/geometry/GeometryWorksheetPracticeView";
import type { MathWorksheet } from "@/lib/math/geometry/types";
import type {
    GeometryAnswersByTaskId,
    GeometryAutoResult,
} from "@/lib/math/geometry/submissionTypes";

type Props = {
    worksheet: MathWorksheet;
    answersMap: GeometryAnswersByTaskId;
    auto: GeometryAutoResult | null;
    tGeometry: (key: string, values?: Record<string, unknown>) => string;
    tBrand: (key: string, values?: Record<string, unknown>) => string;
};

export default function GeometrySubmissionView({
    worksheet,
    answersMap,
    auto,
    tGeometry,
    tBrand,
}: Props) {
    return (
        <div className="grid gap-4">
            <div className="rounded-xl border border-slate-300 bg-white p-3">
                <GeometryWorksheetPracticeView
                    worksheet={worksheet}
                    t={tGeometry}
                    tBrand={tBrand}
                    answersByTaskId={answersMap}
                    onAnswerChange={() => {
                        // read-only teacher view
                    }}
                    showExpectedAnswers={true}
                    showIdentityFields={false}
                    showFigureMeta={true}
                    includeHints={true}
                    auto={auto}
                    showInlineFeedback={!!auto}
                />
            </div>
        </div>
    );
}