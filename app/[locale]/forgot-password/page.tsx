// app/[locale]/forgot-password/page.tsx
"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { getAuth, sendPasswordResetEmail } from "firebase/auth";
import { useParams } from "next/navigation";

export default function ForgotPasswordPage() {
    const params = useParams<{ locale: string }>();
    const locale = params?.locale || "nb";

    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState("");

    async function onSubmit(e: FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError("");
        setDone(false);

        try {
            const auth = getAuth();
            auth.languageCode = locale;

            await sendPasswordResetEmail(auth, email.trim(), {
                url: `${window.location.origin}/${locale}/login?reset=1`,
                handleCodeInApp: false,
            });

            setDone(true);
        } catch (err: unknown) {
            console.error(err);

            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError("Kunne ikke sende e-post for passordbytte.");
            }
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className="mx-auto max-w-md px-4 py-10">
            <div className="rounded-2xl border bg-white p-6 shadow-sm">
                <h1 className="text-2xl font-semibold">Glemt passord?</h1>
                <p className="mt-2 text-sm text-gray-600">
                    Skriv inn e-postadressen din, så sender vi deg en lenke for å lage nytt passord.
                </p>

                <form onSubmit={onSubmit} className="mt-6 space-y-4">
                    <div>
                        <label className="mb-1 block text-sm font-medium">E-post</label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full rounded-xl border px-3 py-2 outline-none focus:ring"
                            placeholder="navn@epost.no"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-xl bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                        {loading ? "Sender..." : "Send lenke"}
                    </button>
                </form>

                {done && (
                    <p className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-700">
                        Hvis e-postadressen finnes i systemet, er lenken sendt.
                    </p>
                )}

                {error && (
                    <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                        {error}
                    </p>
                )}

                <div className="mt-6 text-sm">
                    <Link href={`/${locale}/login`} className="text-blue-600 hover:underline">
                        Tilbake til innlogging
                    </Link>
                </div>
            </div>
        </main>
    );
}