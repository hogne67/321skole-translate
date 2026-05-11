"use client";

import { Link } from "@/i18n/navigation";

type Props = {
    loading: boolean;
    err: string | null;

    lessonExists: boolean;

    spaceId: string;

    t: (key: string, values?: Record<string, unknown>) => string;
};

export default function AssignmentPageState({
    loading,
    err,
    lessonExists,
    spaceId,
    t,
}: Props) {
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
                        href={`/student/spaces/${spaceId}`}
                        style={{ textDecoration: "none" }}
                    >
                        {t("actions.backToSpace")}
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
                    <Link href={`/student/spaces/${spaceId}`}>
                        {t("actions.backToSpace")}
                    </Link>
                </div>
            </div>
        );
    }

    return null;
}