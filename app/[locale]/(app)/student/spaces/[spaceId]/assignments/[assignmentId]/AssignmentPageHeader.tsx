"use client";

type Props = {
    mainTitle: string;
    metaLine: string;
};

export default function AssignmentPageHeader({
    mainTitle,
    metaLine,
}: Props) {
    return (
        <header
            style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
            }}
        >
            <div>
                <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>
                    {mainTitle}
                </h1>

                {metaLine ? (
                    <div style={{ marginTop: 4, opacity: 0.75 }}>
                        {metaLine}
                    </div>
                ) : null}
            </div>
        </header>
    );
}
