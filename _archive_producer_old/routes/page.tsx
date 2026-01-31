// app/producer/routes/page.tsx
import Link from "next/link";

export default function ProducerRoutesPage() {
  return (
    <main>
      <h1>My routes</h1>
      <p>Her skal vi liste rutene dine (Firestore senere).</p>

      <p>
        <Link href="/producer/routes/new">+ Create new route</Link>
      </p>

      <ul>
        <li>(demo) Ålesund Highlights</li>
        <li>(demo) Kystriksvegen – del 1</li>
      </ul>
    </main>
  );
}
