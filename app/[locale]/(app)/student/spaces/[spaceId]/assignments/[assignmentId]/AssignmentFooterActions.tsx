"use client";

import { Link } from "@/i18n/navigation";

type Props = {
    msg: string | null;

    spaceId: string;

    t: (key: string, values?: Record<string, unknown>) => string;
};

export default function AssignmentFooterActions({
    msg,
    spaceId,
    t,
}: Props) {
    return (
        <section style={{ marginTop: 18 }}>
            {msg ? (
                <div
                    style={{
                        marginBottom: 10,
                        padding: 10,
                        borderRadius: 12,
                        background: "rgba(0,0,0,0.04)",
                    }}
                >
                    {msg}
                </div>
            ) : null}

            <div
                style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                    alignItems: "center",
                }}
            >
                <Link
                    href={`/student/spaces/${spaceId}`}
                    style={{ textDecoration: "none" }}
                >
                    {t("actions.backToSpace")}
                </Link>
            </div>
        </section>
    );
}
