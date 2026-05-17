// app/[locale]/child/layout.tsx
import type { ReactNode } from "react";

export default function ChildLayout({
    children,
}: {
    children: ReactNode;
}) {
    return (
        <div className="min-h-screen bg-slate-50">
            <header className="border-b border-slate-200 bg-white">
                <div className="mx-auto max-w-6xl px-4 py-3">
                    <img
                        src="/images/child-room-top1.png"
                        alt=""
                        className="h-30 w-full object-cover rounded-2xl sm:h-39"
                    />
                </div>
            </header>

            <main className="mx-auto w-full max-w-5xl p-4">{children}</main>
        </div>
    );
}