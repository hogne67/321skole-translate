type PartnerDashboardCardProps = {
  title: string;
  text: string;
  extraText: string;
};

export function PartnerDashboardCard({
  title,
  text,
  extraText,
}: PartnerDashboardCardProps) {
  return (
    <section
      style={{
        position: "relative",
        overflow: "hidden",
        border: "1px solid rgba(15,23,42,0.10)",
        borderRadius: 8,
        background:
          "linear-gradient(135deg, rgba(255,255,255,1), rgba(241,245,249,0.96))",
        boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
        padding: 16,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "0 auto 0 0",
          width: 4,
          background: "linear-gradient(180deg, #0f766e, #475569)",
        }}
      />
      <div style={{ paddingLeft: 8 }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            borderRadius: 999,
            border: "1px solid rgba(15,118,110,0.18)",
            background: "rgba(15,118,110,0.06)",
            color: "#0f766e",
            padding: "4px 8px",
            fontSize: 12,
            fontWeight: 800,
          }}
        >
          321school Partner
        </div>

        <h2
          style={{
            margin: "10px 0 0",
            fontSize: 19,
            lineHeight: 1.25,
            letterSpacing: 0,
            color: "#0f172a",
          }}
        >
          {title}
        </h2>

        <p style={{ margin: "8px 0 0", color: "#475569", lineHeight: 1.55 }}>
          {text}
        </p>
        <p
          style={{
            margin: "8px 0 0",
            color: "#334155",
            lineHeight: 1.55,
            fontWeight: 650,
          }}
        >
          {extraText}
        </p>
      </div>
    </section>
  );
}
