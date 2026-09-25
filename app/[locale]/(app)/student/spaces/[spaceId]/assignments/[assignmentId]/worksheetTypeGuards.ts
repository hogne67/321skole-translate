import type { MathWorksheet } from "@/lib/math/geometry/types";
import type { FractionWorksheet } from "@/lib/math/fractions/types";
import type { ArithmeticWorksheet } from "@/lib/math/arithmetic/types";

export function isMathWorksheet(value: unknown): value is MathWorksheet {
    if (!value || typeof value !== "object") return false;

    const v = value as {
        tasks?: unknown;
        title?: unknown;
        selectedShapes?: unknown;
        showFormulas?: unknown;
    };

    return (
        Array.isArray(v.tasks) &&
        typeof v.title === "string" &&
        (Array.isArray(v.selectedShapes) || typeof v.showFormulas === "boolean")
    );
}

export function isFractionWorksheet(value: unknown): value is FractionWorksheet {
    if (!value || typeof value !== "object") return false;

    const v = value as {
        tasks?: unknown;
        title?: unknown;
        selectedShapes?: unknown;
        operation?: unknown;
        layout?: unknown;
    };

    return (
        Array.isArray(v.tasks) &&
        typeof v.title === "string" &&
        !Array.isArray(v.selectedShapes) &&
        typeof v.operation !== "string" &&
        typeof v.layout !== "string"
    );
}

export function isArithmeticWorksheet(value: unknown): value is ArithmeticWorksheet {
    if (!value || typeof value !== "object") return false;

    const v = value as {
        tasks?: unknown;
        title?: unknown;
        operation?: unknown;
        layout?: unknown;
        numberRange?: unknown;
    };

    return (
        Array.isArray(v.tasks) &&
        typeof v.title === "string" &&
        typeof v.operation === "string" &&
        typeof v.layout === "string" &&
        typeof v.numberRange === "object" &&
        v.numberRange !== null
    );
}
