import Link from "next/link";
import { headers } from "next/headers";

export default async function NorwayLegacyNotice() {
    const h = await headers();
    const host = h.get("host")?.toLowerCase() ?? "";

    const isNorwayDomain =
        host === "321skole.no" || host === "www.321skole.no";

    if (!isNorwayDomain) return null;

    return (
        <section className="mx-auto -mt-2 mb-6 max-w-6xl px-4">
            <div className="rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 shadow-sm backdrop-blur">
                <p className="text-sm font-semibold text-slate-900">
                    Leter du etter de gamle norske sidene?
                </p>
                <p className="mt-1 text-sm text-slate-700">
                    De ligger nå på{" "}
                    <Link
                        href="https://321start.no"
                        className="font-semibold text-blue-700 underline underline-offset-2"
                    >
                        321start.no
                    </Link>
                    .
                </p>
            </div>
        </section>
    );
}