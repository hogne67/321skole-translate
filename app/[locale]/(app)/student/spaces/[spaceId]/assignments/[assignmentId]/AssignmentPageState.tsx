"use client";

import { Link } from "@/i18n/navigation";

type Props = {
    loading: boolean;
    err: string | null;

    lessonExists: boolean;

    spaceId: string;
    returnHref: string | null;
    returnLabel: string;

    t: (key: string, values?: Record<string, unknown>) => string;
};

export default function AssignmentPageState({
    loading,
    err,
    lessonExists,
    spaceId,
    returnHref,
    returnLabel,
    t,
}: Props) {
    const backHref = returnHref ?? `/student/spaces/${spaceId}`;
    const backLabel = returnHref ? returnLabel : t("actions.backToSpace");

    if (loading) {
        return (
            <div style={{ padding: 16 }}>
                {t("common.loading")}
            </div>
        );
    }

    if (err) {
        return (
            <div style={{ padding: 16 }}>
                <div
                    style={{
                        color: "crimson",
                        whiteSpace: "pre-wrap",
                    }}
                >
                    {err}
                </div>

                <div
                    style={{
                        marginTop: 12,
                        display: "flex",
                        gap: 12,
                        flexWrap: "wrap",
                    }}
                >
                    <Link
                        href={backHref}
                        style={{ textDecoration: "none" }}
                    >
                        {backLabel}
                    </Link>

                    <Link
                        href="/join"
                        style={{ textDecoration: "none" }}
                    >
                        {t("actions.backToJoin")}
                    </Link>
                </div>
            </div>
        );
    }

    if (!lessonExists) {
        return (
            <div style={{ padding: 16 }}>
                <div>{t("errors.noData")}</div>

                <div style={{ marginTop: 12 }}>
                    <Link href={backHref}>
                        {backLabel}
                    </Link>
                </div>
            </div>
        );
    }

    return null;
}
