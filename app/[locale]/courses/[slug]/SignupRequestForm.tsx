"use client";

import { FormEvent, useState } from "react";

export function SignupRequestForm({
  slug,
  compact = false,
}: {
  slug: string;
  compact?: boolean;
}) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
    website: "",
  });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    try {
      setSaving(true);
      setError("");
      setStatus("");

      const res = await fetch(`/api/courses/${encodeURIComponent(slug)}/signup-requests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) throw new Error(data.error || "Could not save request");

      setForm({ name: "", email: "", phone: "", message: "", website: "" });
      setStatus("Takk. Forespørselen er sendt.");
    } catch (err) {
      console.error("Failed to submit signup request", err);
      setError("Forespørselen kunne ikke sendes akkurat nå.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div>
        <h2 className="m-0 text-lg font-black text-slate-950">
          {compact ? "Contact instructor" : "Meld interesse"}
        </h2>
        {compact ? (
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Use this if you have questions before buying or need a manual follow-up.
          </p>
        ) : null}
      </div>
      <div className="hidden">
        <label>
          Website
          <input
            value={form.website}
            onChange={(event) => setForm((prev) => ({ ...prev, website: event.target.value }))}
            tabIndex={-1}
            autoComplete="off"
          />
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Name">
          <input
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            maxLength={120}
            required
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            value={form.email}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            maxLength={180}
            required
          />
        </Field>
        <Field label="Phone">
          <input
            value={form.phone}
            onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            maxLength={60}
          />
        </Field>
      </div>
      <Field label="Message">
        <textarea
          value={form.message}
          onChange={(event) => setForm((prev) => ({ ...prev, message: event.target.value }))}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          maxLength={1000}
          rows={compact ? 3 : 4}
        />
      </Field>
      {error ? <div className="text-sm font-bold text-rose-700">{error}</div> : null}
      {status ? <div className="text-sm font-bold text-emerald-700">{status}</div> : null}
      <button
        type="submit"
        disabled={saving}
        className="inline-flex h-11 w-fit items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-5 text-sm font-black text-white disabled:opacity-60"
      >
        {saving ? "Sending..." : compact ? "Send request" : "Request a place"}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-bold text-slate-800">
      <span>{label}</span>
      {children}
    </label>
  );
}
