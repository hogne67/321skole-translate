// app/[locale]/forgot-password/page.tsx
"use client";

import { FormEvent, useRef, useState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/lib/email/passwordResetClient";
import { passwordResetCopy } from "@/lib/email/passwordResetEmail";
import { useParams } from "next/navigation";

export default function ForgotPasswordPage() {
    const params = useParams<{ locale: string }>();
    const locale = params?.locale || "nb";
    const copy = passwordResetCopy(locale);

    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState("");
    const inFlight = useRef(false);

    async function onSubmit(e: FormEvent) {
        e.preventDefault();
        if (inFlight.current) return;
        inFlight.current = true;
        setLoading(true);
        setError("");
        setDone(false);

        try {
            await requestPasswordReset(email, locale);

            setDone(true);
        } catch {
            setError(copy.failed);
        } finally {
            inFlight.current = false;
            setLoading(false);
        }
    }

    return (
        <main className="mx-auto max-w-md px-4 py-10">
            <div className="rounded-2xl border bg-white p-6 shadow-sm">
                <h1 className="text-2xl font-semibold">{copy.title}</h1>
                <p className="mt-2 text-sm text-gray-600">
                    {copy.formIntro}
                </p>

                <form onSubmit={onSubmit} className="mt-6 space-y-4">
                    <div>
                        <label htmlFor="reset-email" className="mb-1 block text-sm font-medium">{copy.emailLabel}</label>
                        <input
                            type="email"
                            id="reset-email"
                            autoComplete="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full rounded-xl border px-3 py-2 outline-none focus:ring"
                            placeholder={copy.emailPlaceholder}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-xl bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                        {loading ? copy.sending : copy.sendLink}
                    </button>
                </form>

                {done && (
                    <p role="status" className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-700">
                        {copy.requestReceived}
                    </p>
                )}

                {error && (
                    <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                        {error}
                    </p>
                )}

                <div className="mt-6 text-sm">
                    <Link href={`/${locale}/login`} className="text-blue-600 hover:underline">
                        {copy.back}
                    </Link>
                </div>
            </div>
        </main>
    );
}
