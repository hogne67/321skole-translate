import SectionShell from "@/components/SectionShell";

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return (
    <SectionShell
      title="Parent"
      subtitle="Følg progresjon og få oversikt."
      items={[
        { href: "/parent", label: "Oversikt" },
        // Legg til senere:
        // { href: "/parent/kids", label: "Barn" },
        // { href: "/parent/progress", label: "Progresjon" },
      ]}
    >
      {children}
    </SectionShell>
  );
}
