import TopNav from "@/components/TopNav";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <TopNav />
      {children}
    </div>
  );
}
