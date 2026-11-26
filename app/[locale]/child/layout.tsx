// app/[locale]/child/layout.tsx
import type { ReactNode } from "react";
import Image from "next/image";

export default function ChildLayout({
    children,
}: {
    children: ReactNode;
}) {
    return (
        <div className="min-h-screen bg-slate-50">
            <header className="border-b border-slate-200 bg-white">
                <div className="mx-auto max-w-6xl px-4 py-3">
                    <Image
                        src="/images/child-room-top1.png"
                        alt=""
                        width={1152}
                        height={312}
                        className="h-28 w-full rounded-2xl object-cover sm:h-40 lg:h-[280px]"
                        priority
                    />
                </div>
            </header>

            <div className="mx-auto box-border w-full max-w-5xl p-4">{children}</div>
        </div>
    );
}
