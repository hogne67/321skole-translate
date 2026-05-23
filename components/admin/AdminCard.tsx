"use client";

export default function AdminCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`adminCard ${className}`}>
      {children}

      <style jsx>{`
        .adminCard {
          border: 1px solid var(--admin-border, #e5e7eb);
          border-radius: var(--admin-radius, 10px);
          background: var(--admin-surface, #ffffff);
          box-shadow: var(--admin-shadow, 0 1px 2px rgba(15, 23, 42, 0.05));
        }
      `}</style>
    </section>
  );
}
