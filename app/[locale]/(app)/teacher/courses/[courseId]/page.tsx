"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { useParams, useSearchParams } from "next/navigation";
import { AcademyGate } from "../AcademyGate";
import {
  normalizeCourseMessage,
  normalizeCourseParticipant,
  normalizeCourseSignupRequest,
  type Course,
  type CourseMessage,
  type CourseParticipant,
  type CourseSessionResource,
  type CourseSignupRequest,
  type ParticipantStatus,
} from "@/lib/courses/types";
import { useUserProfile } from "@/lib/useUserProfile";
import { CourseWorkspaceNav } from "./CourseWorkspaceNav";
import { fetchTeacherCourse } from "./courseClient";

export default function CourseDashboardPage() {
  return (
    <AcademyGate>
      <CourseDashboardContent />
    </AcademyGate>
  );
}

function CourseDashboardContent() {
  const locale = useLocale();
  const params = useParams<{ courseId?: string }>();
  const searchParams = useSearchParams();
  const { user } = useUserProfile();
  const courseId = typeof params?.courseId === "string" ? params.courseId : "";
  const initialSection = searchParams.get("section") || "Overview";
  const [course, setCourse] = useState<Course | null>(null);
  const [activeSection, setActiveSection] = useState(initialSection);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    let cancelled = false;

    async function loadCourse() {
      if (!courseId || !user) {
        setError("Fant ikke kurs.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        const loadedCourse = await fetchTeacherCourse(user, courseId);
        if (!cancelled) setCourse(loadedCourse);
      } catch (err) {
        console.error("Failed to load course", err);
        if (!cancelled) setError("Kurset kunne ikke hentes akkurat nå.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadCourse();

    return () => {
      cancelled = true;
    };
  }, [courseId, user]);

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
        Laster kurs...
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        {error || "Fant ikke kurs."}
      </div>
    );
  }

  const loadedCourse = course;
  const activeNav =
    activeSection === "Participants"
          ? "participants"
      : activeSection === "Payments"
        ? "payments"
      : activeSection === "Submissions"
        ? "submissions"
        : activeSection === "Messages"
          ? "messages"
          : "overview";

  return (
    <main className="mx-auto grid max-w-5xl gap-5">
      <section className="grid gap-3">
        <CourseWorkspaceNav
          locale={locale}
          courseId={loadedCourse.id}
          title={loadedCourse.title}
          status={loadedCourse.status}
          active={activeNav}
        />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="p-5">
          {activeSection === "Overview" ? (
        <Overview course={course} locale={locale} onOpenSection={setActiveSection} />
          ) : activeSection === "Content" ? (
            <ContentResourcesView course={course} />
          ) : activeSection === "Participants" ? (
            <ParticipantsPanel course={loadedCourse} />
          ) : activeSection === "Payments" ? (
            <PaymentsPanel course={loadedCourse} />
          ) : activeSection === "Submissions" ? (
            <CourseSubmissionsPanel course={loadedCourse} />
          ) : activeSection === "Messages" ? (
            <MessagesPanel course={loadedCourse} />
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6">
              <h2 className="m-0 text-lg font-extrabold text-slate-900">{activeSection}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Denne delen er satt av som plassholder i første versjon.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

const EMPTY_PARTICIPANT_FORM = {
  name: "",
  email: "",
  phone: "",
  organization: "",
  note: "",
  status: "enrolled" as ParticipantStatus,
};

const EMPTY_GROUP_FORM = {
  organization: "",
  note: "",
  participantsText: "",
  status: "invited" as ParticipantStatus,
};

type CourseOrderRow = {
  id: string;
  status: string;
  buyerEmail: string;
  buyerRole: string;
  currency: string;
  grossAmountOre: number;
  instructorAmountOre: number;
  applicationFeeAmountOre: number;
  paymentFeeOre: number;
  dailyAiFeeOre: number;
  licenseFeeOre: number;
  participantHasActiveLicense: boolean;
  stripeCheckoutSessionId: string;
  stripePaymentIntentId: string;
  createdAt: string | null;
  paidAt: string | null;
  updatedAt: string | null;
};

function PaymentsPanel({ course }: { course: Course }) {
  const { user } = useUserProfile();
  const [orders, setOrders] = useState<CourseOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadOrders() {
      if (!user) return;

      try {
        setLoading(true);
        setError("");
        const token = await user.getIdToken();
        const res = await fetch(`/api/teacher/courses/${course.id}/orders`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json().catch(() => ({}))) as {
          orders?: CourseOrderRow[];
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || "Could not load orders");
        if (!cancelled) setOrders(Array.isArray(data.orders) ? data.orders : []);
      } catch (err) {
        console.error("Failed to load course orders", err);
        if (!cancelled) setError("Payments could not be loaded right now.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadOrders();

    return () => {
      cancelled = true;
    };
  }, [course.id, user]);

  const paidOrders = orders.filter((order) => order.status === "paid" || order.status === "completed");
  const totalGross = paidOrders.reduce((sum, order) => sum + order.grossAmountOre, 0);
  const totalInstructor = paidOrders.reduce((sum, order) => sum + order.instructorAmountOre, 0);
  const totalFees = paidOrders.reduce((sum, order) => sum + order.applicationFeeAmountOre, 0);
  const currency = orders[0]?.currency || course.sales.currency || "NOK";

  return (
    <div className="grid gap-5">
      <div>
        <h2 className="m-0 text-xl font-black text-slate-950">Payments</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Simple payment control for this course. Amounts are estimates from the checkout ledger.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <PaymentStat label="Paid orders" value={String(paidOrders.length)} />
        <PaymentStat label="Gross paid" value={formatMoney(totalGross, currency)} />
        <PaymentStat label="Instructor estimate" value={formatMoney(totalInstructor, currency)} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <PaymentStat label="Application fee / platform side" value={formatMoney(totalFees, currency)} />
        <PaymentStat label="Total orders" value={String(orders.length)} />
      </div>

      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Loading payments...
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
          No payment orders yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Buyer</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Gross</th>
                <th className="px-4 py-3">Instructor</th>
                <th className="px-4 py-3">Platform/Fee</th>
                <th className="px-4 py-3">Paid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {orders.map((order) => (
                <tr key={order.id}>
                  <td className="px-4 py-3 font-bold text-slate-900">
                    {order.buyerEmail || "Unknown"}
                    {order.participantHasActiveLicense ? (
                      <div className="mt-1 text-xs font-semibold text-slate-500">Had active license</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold capitalize text-slate-700">
                      {order.status || "unknown"}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-bold">{formatMoney(order.grossAmountOre, order.currency)}</td>
                  <td className="px-4 py-3 font-bold">{formatMoney(order.instructorAmountOre, order.currency)}</td>
                  <td className="px-4 py-3 font-bold">{formatMoney(order.applicationFeeAmountOre, order.currency)}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDateTime(order.paidAt || order.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PaymentStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-xl font-black text-slate-950">{value}</div>
    </div>
  );
}

function formatMoney(amountOre: number, currency: string) {
  return new Intl.NumberFormat("nb-NO", {
    style: "currency",
    currency: currency || "NOK",
    maximumFractionDigits: amountOre % 100 === 0 ? 0 : 2,
  }).format((amountOre || 0) / 100);
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function ParticipantsPanel({ course }: { course: Course }) {
  const { user } = useUserProfile();
  const [participants, setParticipants] = useState<CourseParticipant[]>([]);
  const [requests, setRequests] = useState<CourseSignupRequest[]>([]);
  const [submissions, setSubmissions] = useState<CourseSubmissionRow[]>([]);
  const [form, setForm] = useState(EMPTY_PARTICIPANT_FORM);
  const [groupForm, setGroupForm] = useState(EMPTY_GROUP_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadParticipants() {
    if (!user) return;

    try {
      setLoading(true);
      setError("");
      const token = await user.getIdToken();
      const [participantsRes, submissionsRes, requestsRes] = await Promise.all([
        fetch(`/api/teacher/courses/${course.id}/participants`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/teacher/courses/${course.id}/submissions`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/teacher/courses/${course.id}/signup-requests`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const participantsData = (await participantsRes.json().catch(() => ({}))) as {
        participants?: Array<Record<string, unknown> & { id?: string }>;
        error?: string;
      };
      const submissionsData = (await submissionsRes.json().catch(() => ({}))) as {
        submissions?: CourseSubmissionRow[];
        error?: string;
      };
      const requestsData = (await requestsRes.json().catch(() => ({}))) as {
        requests?: Array<Record<string, unknown> & { id?: string }>;
        error?: string;
      };
      if (!participantsRes.ok) throw new Error(participantsData.error || "Could not load participants");
      if (!submissionsRes.ok) throw new Error(submissionsData.error || "Could not load submissions");
      if (!requestsRes.ok) throw new Error(requestsData.error || "Could not load signup requests");

      setParticipants(
        (participantsData.participants ?? []).map((participant) =>
          normalizeCourseParticipant(
            typeof participant.id === "string" ? participant.id : "",
            participant
          )
        )
      );
      setSubmissions(Array.isArray(submissionsData.submissions) ? submissionsData.submissions : []);
      setRequests(
        (requestsData.requests ?? []).map((request) =>
          normalizeCourseSignupRequest(typeof request.id === "string" ? request.id : "", request)
        )
      );
    } catch (err) {
      console.error("Failed to load participants", err);
      setError("Deltakere kunne ikke hentes akkurat nå.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadParticipants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course.id, user]);

  function startEdit(participant: CourseParticipant) {
    setEditingId(participant.id);
    setForm({
      name: participant.name,
      email: participant.email,
      phone: participant.phone,
      organization: participant.organization,
      note: participant.note,
      status: participant.status,
    });
    setShowForm(true);
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_PARTICIPANT_FORM);
    setShowForm(false);
  }

  async function saveParticipant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || saving) return;

    try {
      setSaving(true);
      setError("");
      const token = await user.getIdToken();
      const url = editingId
        ? `/api/teacher/courses/${course.id}/participants/${editingId}`
        : `/api/teacher/courses/${course.id}/participants`;
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not save participant");

      resetForm();
      await loadParticipants();
    } catch (err) {
      console.error("Failed to save participant", err);
      setError("Deltakeren kunne ikke lagres akkurat nå.");
    } finally {
      setSaving(false);
    }
  }

  async function saveGroupParticipants(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || saving) return;

    const parsedParticipants = parseParticipantsText(groupForm.participantsText, groupForm.organization);
    if (parsedParticipants.length === 0) {
      setError("Lim inn minst én deltaker med e-post.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      const token = await user.getIdToken();
      const res = await fetch(`/api/teacher/courses/${course.id}/participants`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          participants: parsedParticipants,
          organization: groupForm.organization,
          note: groupForm.note,
          status: groupForm.status,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not add group");

      setGroupForm(EMPTY_GROUP_FORM);
      setShowGroupForm(false);
      await loadParticipants();
    } catch (err) {
      console.error("Failed to add group participants", err);
      setError("Gruppen kunne ikke legges til akkurat nå.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteParticipant(participant: CourseParticipant) {
    if (!user) return;
    const ok = window.confirm(`Slette ${participant.name}?`);
    if (!ok) return;

    try {
      setError("");
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/teacher/courses/${course.id}/participants/${participant.id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not delete participant");
      await loadParticipants();
    } catch (err) {
      console.error("Failed to delete participant", err);
      setError("Deltakeren kunne ikke slettes akkurat nå.");
    }
  }

  async function updateRequest(requestId: string, action: "contacted" | "accept" | "reject") {
    if (!user || saving) return;

    try {
      setSaving(true);
      setError("");
      const token = await user.getIdToken();
      const res = await fetch(`/api/teacher/courses/${course.id}/signup-requests/${requestId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not update request");

      await loadParticipants();
    } catch (err) {
      console.error("Failed to update signup request", err);
      setError("Forespørselen kunne ikke oppdateres akkurat nå.");
    } finally {
      setSaving(false);
    }
  }

  const totalResourceCount = course.coursePlan.reduce(
    (sum, session) => sum + session.resources.filter((resource) => resource.visibility !== "teacher").length,
    0
  );

  return (
    <div className="grid gap-4">
      <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
          <h2 className="m-0 text-lg font-extrabold text-slate-900">Participants</h2>
          <p className="mt-1 text-sm text-slate-600">
            Manage course participants and signup requests for this course.
          </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setShowGroupForm((value) => !value);
                setShowForm(false);
              }}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-900"
            >
              Add group
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(true);
                setShowGroupForm(false);
                setEditingId(null);
                setForm(EMPTY_PARTICIPANT_FORM);
              }}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-4 text-sm font-bold text-white"
            >
              Add participant
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-2 text-xs font-bold text-slate-700 md:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            Participants: {participants.length}
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
            Signup requests: {requests.length}
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            Course resources: {totalResourceCount}
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            Submissions: {submissions.length}
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {showForm ? (
        <form onSubmit={saveParticipant} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Name">
              <input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                required
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                required
              />
            </Field>
            <Field label="Phone">
              <input
                value={form.phone}
                onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </Field>
            <Field label="School / organization">
              <input
                value={form.organization}
                onChange={(event) => setForm((prev) => ({ ...prev, organization: event.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="For eksempel: Solvang skole"
              />
            </Field>
            <Field label="Status">
              <select
                value={form.status}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    status: event.target.value as ParticipantStatus,
                  }))
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="invited">invited</option>
                <option value="enrolled">enrolled</option>
                <option value="active">active</option>
                <option value="completed">completed</option>
                <option value="cancelled">cancelled</option>
              </select>
            </Field>
          </div>
          <Field label="Note">
            <textarea
              value={form.note}
              onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
              rows={2}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              placeholder="Internt notat, f.eks. KI-kurs for lærere"
            />
          </Field>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={resetForm} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="rounded-lg border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
              {saving ? "Saving..." : editingId ? "Save participant" : "Add participant"}
            </button>
          </div>
        </form>
      ) : null}

      {showGroupForm ? (
        <form onSubmit={saveGroupParticipants} className="grid gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <div>
            <h3 className="m-0 text-base font-extrabold text-emerald-950">Add group / school</h3>
            <p className="mt-1 text-sm text-emerald-900">
              Lim inn én deltaker per linje. Eksempler: “Ola Nordmann, ola@skole.no” eller bare “ola@skole.no”.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="School / organization">
              <input
                value={groupForm.organization}
                onChange={(event) => setGroupForm((prev) => ({ ...prev, organization: event.target.value }))}
                className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm"
                placeholder="For eksempel: Solvang skole"
              />
            </Field>
            <Field label="Status">
              <select
                value={groupForm.status}
                onChange={(event) =>
                  setGroupForm((prev) => ({ ...prev, status: event.target.value as ParticipantStatus }))
                }
                className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm"
              >
                <option value="invited">invited</option>
                <option value="enrolled">enrolled</option>
                <option value="active">active</option>
              </select>
            </Field>
          </div>
          <Field label="Participants">
            <textarea
              value={groupForm.participantsText}
              onChange={(event) => setGroupForm((prev) => ({ ...prev, participantsText: event.target.value }))}
              rows={7}
              className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm"
              placeholder={"Ola Nordmann, ola@skole.no\nKari Lærer <kari@skole.no>\nper@skole.no"}
              required
            />
          </Field>
          <Field label="Shared note">
            <textarea
              value={groupForm.note}
              onChange={(event) => setGroupForm((prev) => ({ ...prev, note: event.target.value }))}
              rows={2}
              className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm"
              placeholder="Internt notat, f.eks. KI-kurs for ungdomsskolelærere"
            />
          </Field>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setGroupForm(EMPTY_GROUP_FORM);
                setShowGroupForm(false);
              }}
              className="rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-bold"
            >
              Cancel
            </button>
            <button type="submit" disabled={saving} className="rounded-lg border border-emerald-800 bg-emerald-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
              {saving ? "Adding..." : "Add group"}
            </button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Laster deltakere...
        </div>
      ) : participants.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
          Ingen deltakere ennå.
        </div>
      ) : (
        <div className="grid gap-3">
          {participants.map((participant) => (
            <div key={participant.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="m-0 text-base font-extrabold text-slate-950">{participant.name}</h3>
                  <p className="m-0 mt-1 text-sm text-slate-700">{participant.email}</p>
                  {participant.phone ? <p className="m-0 mt-1 text-sm text-slate-600">{participant.phone}</p> : null}
                  {participant.organization ? (
                    <p className="m-0 mt-1 text-sm font-semibold text-slate-700">{participant.organization}</p>
                  ) : null}
                  {participant.note ? <p className="m-0 mt-2 text-sm text-slate-600">{participant.note}</p> : null}
                  <p className="m-0 mt-2 text-xs text-slate-500">
                    Created: {participant.createdAt?.toDate().toLocaleString() ?? "-"} · Updated:{" "}
                    {participant.updatedAt?.toDate().toLocaleString() ?? "-"}
                  </p>
                  <ParticipantProgressSummary
                    progress={getParticipantProgress(participant, submissions, totalResourceCount)}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-700">
                    {participant.status}
                  </span>
                  {participant.roleSnapshot ? (
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                      {participant.roleSnapshot}
                    </span>
                  ) : null}
                  <button type="button" onClick={() => startEdit(participant)} className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-bold">
                    Edit
                  </button>
                  <button type="button" onClick={() => void deleteParticipant(participant)} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700">
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <section className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="m-0 text-base font-extrabold text-slate-950">Signup requests</h3>
            <p className="mt-1 text-sm text-slate-600">
              Interesseforespørsler fra offentlig kursside.
            </p>
          </div>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600">
            {requests.length}
          </span>
        </div>
        {requests.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
            Ingen forespørsler ennå.
          </div>
        ) : (
          <div className="grid gap-2">
            {requests.map((request) => (
              <div key={request.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-extrabold text-slate-950">{request.name}</div>
                    <div className="mt-1 text-sm text-slate-700">{request.email}</div>
                    {request.phone ? <div className="mt-1 text-sm text-slate-600">{request.phone}</div> : null}
                    {request.message ? (
                      <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                        {request.message}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700">
                      {request.status}
                    </span>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void updateRequest(request.id, "contacted")}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-bold disabled:opacity-60"
                    >
                      Contacted
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void updateRequest(request.id, "accept")}
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 disabled:opacity-60"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void updateRequest(request.id, "reject")}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700 disabled:opacity-60"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

type CourseSubmissionRow = {
  id: string;
  uid: string;
  participantName: string;
  participantEmail: string;
  participantOrganization: string;
  lessonId: string;
  publishedLessonId: string;
  courseSessionNumber: number | null;
  courseSessionTitle: string;
  courseResourceId: string;
  courseResourceTitle: string;
  status: string;
  source: string;
  kind: string;
  feedback: string;
  instructorFeedback: string;
  reviewStatus: string;
  updatedAt: string;
  createdAt: string;
};

type ParticipantProgress = {
  submittedCount: number;
  approvedCount: number;
  needsWorkCount: number;
  totalResourceCount: number;
  lastActivityAt: string;
};

function getParticipantProgress(
  participant: CourseParticipant,
  submissions: CourseSubmissionRow[],
  totalResourceCount: number
): ParticipantProgress {
  const participantEmail = participant.email.toLowerCase();
  const participantSubmissions = submissions.filter((submission) => {
    if (participant.participantUid && submission.uid === participant.participantUid) return true;
    return submission.participantEmail.toLowerCase() === participantEmail;
  });
  const latestByResource = new Map<string, CourseSubmissionRow>();

  for (const submission of participantSubmissions) {
    const resourceId = submission.courseResourceId || submission.lessonId || submission.id;
    const current = latestByResource.get(resourceId);
    if (!current || submission.updatedAt.localeCompare(current.updatedAt) > 0) {
      latestByResource.set(resourceId, submission);
    }
  }

  const latestSubmissions = Array.from(latestByResource.values());
  return {
    submittedCount: latestSubmissions.length,
    approvedCount: latestSubmissions.filter((submission) => submission.reviewStatus === "approved").length,
    needsWorkCount: latestSubmissions.filter((submission) => submission.reviewStatus === "needs_work").length,
    totalResourceCount,
    lastActivityAt: latestSubmissions
      .map((submission) => submission.updatedAt)
      .filter(Boolean)
      .sort()
      .at(-1) ?? "",
  };
}

function ParticipantProgressSummary({ progress }: { progress: ParticipantProgress }) {
  const percent =
    progress.totalResourceCount === 0
      ? 0
      : Math.round((progress.submittedCount / progress.totalResourceCount) * 100);

  return (
    <div className="mt-3 grid gap-2 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-black uppercase tracking-wide text-slate-500">
          Course progress
        </span>
        <span className="text-xs font-bold text-slate-700">{percent}%</span>
      </div>
      <div className="flex flex-wrap gap-2 text-xs font-bold text-slate-700">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
          {progress.submittedCount}/{progress.totalResourceCount} delivered
        </span>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-800">
          {progress.approvedCount} approved
        </span>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-900">
          {progress.needsWorkCount} needs work
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-slate-900" style={{ width: `${percent}%` }} />
      </div>
      <div className="text-xs text-slate-500">
        Last activity: {formatMaybeIsoDate(progress.lastActivityAt)}
      </div>
    </div>
  );
}

type CourseSubmissionDetail = {
  id: string;
  uid: string;
  lessonId: string;
  publishedLessonId: string;
  courseSessionNumber: number | null;
  courseResourceId: string;
  status: string;
  answers: Record<string, unknown>;
  feedback: string;
  instructorFeedback: string;
  reviewStatus: string;
};

type SubmissionFilter = "all" | "unreviewed" | "needs_work" | "approved";

const SUBMISSION_FILTERS: Array<{ id: SubmissionFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "unreviewed", label: "Awaiting review" },
  { id: "needs_work", label: "Needs work" },
  { id: "approved", label: "Approved" },
];

function CourseSubmissionsPanel({ course }: { course: Course }) {
  const locale = useLocale();
  const { user } = useUserProfile();
  const [submissions, setSubmissions] = useState<CourseSubmissionRow[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<CourseSubmissionDetail | null>(null);
  const [instructorFeedbackDraft, setInstructorFeedbackDraft] = useState("");
  const [reviewStatusDraft, setReviewStatusDraft] = useState("none");
  const [submissionFilter, setSubmissionFilter] = useState<SubmissionFilter>("all");
  const [loading, setLoading] = useState(true);
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadSubmissions() {
    if (!user) return;

    try {
      setLoading(true);
      setError("");
      const token = await user.getIdToken();
      const res = await fetch(`/api/teacher/courses/${course.id}/submissions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as {
        submissions?: CourseSubmissionRow[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Could not load submissions");
      setSubmissions(Array.isArray(data.submissions) ? data.submissions : []);
    } catch (err) {
      console.error("Failed to load course submissions", err);
      setError("Besvarelser kunne ikke hentes akkurat nå.");
    } finally {
      setLoading(false);
    }
  }

  async function openSubmission(submissionId: string) {
    if (!user) return;

    try {
      setDetailLoadingId(submissionId);
      setError("");
      const token = await user.getIdToken();
      const res = await fetch(`/api/teacher/courses/${course.id}/submissions/${submissionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as {
        submission?: CourseSubmissionDetail;
        error?: string;
      };
      if (!res.ok || !data.submission) throw new Error(data.error || "Could not load submission");
      setSelectedSubmission(data.submission);
      setInstructorFeedbackDraft(data.submission.instructorFeedback || "");
      setReviewStatusDraft(data.submission.reviewStatus || "none");
    } catch (err) {
      console.error("Failed to load course submission", err);
      setError("Besvarelsen kunne ikke åpnes akkurat nå.");
    } finally {
      setDetailLoadingId(null);
    }
  }

  async function saveInstructorFeedback() {
    if (!user || !selectedSubmission || feedbackSaving) return;

    try {
      setFeedbackSaving(true);
      setError("");
      const token = await user.getIdToken();
      const res = await fetch(`/api/teacher/courses/${course.id}/submissions/${selectedSubmission.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          instructorFeedback: instructorFeedbackDraft,
          reviewStatus: reviewStatusDraft,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not save feedback");

      setSelectedSubmission((prev) =>
        prev ? { ...prev, instructorFeedback: instructorFeedbackDraft, reviewStatus: reviewStatusDraft } : prev
      );
      await loadSubmissions();
    } catch (err) {
      console.error("Failed to save instructor feedback", err);
      setError("Instruktørfeedback kunne ikke lagres akkurat nå.");
    } finally {
      setFeedbackSaving(false);
    }
  }

  useEffect(() => {
    void loadSubmissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course.id, user]);

  const submissionCounts = {
    all: submissions.length,
    unreviewed: submissions.filter((submission) => !submission.reviewStatus || submission.reviewStatus === "none").length,
    needs_work: submissions.filter((submission) => submission.reviewStatus === "needs_work").length,
    approved: submissions.filter((submission) => submission.reviewStatus === "approved").length,
  };
  const filteredSubmissions = submissions.filter((submission) => {
    if (submissionFilter === "all") return true;
    if (submissionFilter === "unreviewed") return !submission.reviewStatus || submission.reviewStatus === "none";
    return submission.reviewStatus === submissionFilter;
  });

  return (
    <div className="grid gap-4">
      <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-lg font-extrabold text-slate-900">Submissions</h2>
            <p className="mt-1 text-sm text-slate-600">
              Review participant work submitted from course resources.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadSubmissions()}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-900"
          >
            Refresh
          </button>
        </div>
        <div className="mt-4 grid gap-2 text-xs font-bold text-slate-700 md:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            Total: {submissionCounts.all}
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            Awaiting review: {submissionCounts.unreviewed}
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
            Needs work: {submissionCounts.needs_work}
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">
            Approved: {submissionCounts.approved}
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {submissions.length > 0 ? (
        <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap gap-2">
            {SUBMISSION_FILTERS.map((filter) => {
              const active = submissionFilter === filter.id;
              return (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setSubmissionFilter(filter.id)}
                  className={`rounded-full border px-3 py-2 text-xs font-bold ${
                    active
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {filter.label} ({submissionCounts[filter.id]})
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Laster besvarelser...
        </div>
      ) : submissions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
          Ingen kursbesvarelser ennå. Når deltakere åpner oppgaver fra kursrommet og lagrer eller leverer,
          dukker de opp her.
        </div>
      ) : filteredSubmissions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
          Ingen besvarelser i dette filteret.
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredSubmissions.map((submission) => (
            <article key={submission.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="m-0 text-base font-extrabold text-slate-950">
                    {submission.courseResourceTitle || submission.lessonId || "Lesson"}
                  </h3>
                  <p className="m-0 mt-1 text-sm text-slate-600">
                    Deltaker: {submission.participantName || submission.participantEmail || submission.uid || "-"}
                  </p>
                  {submission.participantOrganization ? (
                    <p className="m-0 mt-1 text-sm font-semibold text-slate-600">
                      {submission.participantOrganization}
                    </p>
                  ) : null}
                  <p className="m-0 mt-1 text-sm text-slate-600">
                    Samling: {submission.courseSessionNumber ?? "-"}
                    {submission.courseSessionTitle ? ` · ${submission.courseSessionTitle}` : ""}
                  </p>
                  <p className="m-0 mt-2 text-xs text-slate-500">
                    Updated: {formatMaybeIsoDate(submission.updatedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-700">
                    {submission.status}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-700">
                    {submission.feedback ? "feedback" : "no feedback"}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-700">
                    {formatReviewStatus(submission.reviewStatus)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void openSubmission(submission.id)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-bold text-slate-900"
                  >
                    {detailLoadingId === submission.id ? "Opening..." : "View"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {selectedSubmission ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
          <div className="max-h-[82vh] w-full max-w-3xl overflow-auto rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="m-0 text-lg font-extrabold text-slate-950">Submission</h3>
                <p className="mt-1 text-sm text-slate-600">
                  {selectedSubmission.lessonId ? `Lesson: ${selectedSubmission.lessonId}` : "Manual course task"} · Status: {selectedSubmission.status}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedSubmission.publishedLessonId || selectedSubmission.lessonId ? (
                  <Link
                    href={`/${locale}/lesson/${selectedSubmission.publishedLessonId || selectedSubmission.lessonId}`}
                    target="_blank"
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm font-bold text-slate-900 no-underline"
                  >
                    Open task
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={() => setSelectedSubmission(null)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm font-bold text-slate-900"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <h4 className="m-0 text-sm font-extrabold text-slate-900">Answers</h4>
                <AnswerList answers={selectedSubmission.answers} />
              </section>

              <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <h4 className="m-0 text-sm font-extrabold text-slate-900">Feedback</h4>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {selectedSubmission.feedback || "Ingen feedback lagret ennå."}
                </p>
              </section>

              <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <h4 className="m-0 text-sm font-extrabold text-emerald-950">Instructor feedback</h4>
                <textarea
                  value={instructorFeedbackDraft}
                  onChange={(event) => setInstructorFeedbackDraft(event.target.value)}
                  rows={5}
                  maxLength={5000}
                  className="mt-2 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm leading-6 text-slate-800"
                  placeholder="Skriv en kort tilbakemelding eller et internt oppfølgingsnotat."
                />
                <div className="mt-3 grid gap-2 text-sm font-bold text-emerald-950">
                  <span>Status</span>
                  <select
                    value={reviewStatusDraft}
                    onChange={(event) => setReviewStatusDraft(event.target.value)}
                    className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-800"
                  >
                    <option value="none">No status</option>
                    <option value="needs_work">Needs work</option>
                    <option value="approved">Approved</option>
                  </select>
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => void saveInstructorFeedback()}
                    disabled={feedbackSaving}
                    className="rounded-lg border border-emerald-800 bg-emerald-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                  >
                    {feedbackSaving ? "Saving..." : "Save instructor feedback"}
                  </button>
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AnswerList({ answers }: { answers: Record<string, unknown> }) {
  const entries = Object.entries(answers).filter(([, value]) => !isEmptyAnswer(value));

  if (entries.length === 0) {
    return <p className="mt-2 text-sm text-slate-600">Ingen svar lagret ennå.</p>;
  }

  return (
    <div className="mt-3 grid gap-2">
      {entries.map(([key, value], index) => (
        <div key={key} className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="text-xs font-black uppercase tracking-wide text-slate-500">
            Answer {index + 1}
          </div>
          <div className="mt-1 text-xs font-semibold text-slate-500">{key}</div>
          <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">
            {formatAnswerValue(value)}
          </div>
        </div>
      ))}
    </div>
  );
}

function isEmptyAnswer(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function formatAnswerValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(formatAnswerValue).join(", ");
  if (value && typeof value === "object") return JSON.stringify(value, null, 2);
  return "";
}

const EMPTY_MESSAGE_FORM = {
  subject: "",
  body: "",
  recipients: "all",
};

function MessagesPanel({ course }: { course: Course }) {
  const { user } = useUserProfile();
  const [messages, setMessages] = useState<CourseMessage[]>([]);
  const [form, setForm] = useState(EMPTY_MESSAGE_FORM);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadMessages() {
    if (!user) return;

    try {
      setLoading(true);
      setError("");
      const token = await user.getIdToken();
      const res = await fetch(`/api/teacher/courses/${course.id}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as {
        messages?: Array<Record<string, unknown> & { id?: string }>;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Could not load messages");

      setMessages(
        (data.messages ?? []).map((message) =>
          normalizeCourseMessage(typeof message.id === "string" ? message.id : "", message)
        )
      );
    } catch (err) {
      console.error("Failed to load messages", err);
      setError("Meldinger kunne ikke hentes akkurat nå.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course.id, user]);

  async function saveMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || saving) return;

    try {
      setSaving(true);
      setError("");
      const token = await user.getIdToken();
      const res = await fetch(`/api/teacher/courses/${course.id}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not send message");

      setForm(EMPTY_MESSAGE_FORM);
      setShowForm(false);
      await loadMessages();
    } catch (err) {
      console.error("Failed to save message", err);
      setError(err instanceof Error ? err.message : "Meldingen kunne ikke sendes akkurat nå.");
    } finally {
      setSaving(false);
    }
  }

  const sentCount = messages.filter((message) => message.status === "sent").length;
  const failedCount = messages.filter((message) => message.status === "failed").length;
  const draftCount = messages.filter((message) => message.status === "draft").length;

  return (
    <div className="grid gap-4">
      <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-lg font-extrabold text-slate-900">Messages</h2>
            <p className="mt-1 text-sm text-slate-600">
              Send course messages and keep a simple message history.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-4 text-sm font-bold text-white"
          >
            New message
          </button>
        </div>
        <div className="mt-4 grid gap-2 text-xs font-bold text-slate-700 md:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            Messages: {messages.length}
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
            Sent: {sentCount}
          </div>
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-900">
            Failed: {failedCount}
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            Drafts: {draftCount}
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {showForm ? (
        <form onSubmit={saveMessage} className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <Field label="Subject">
            <input
              value={form.subject}
              onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              required
            />
          </Field>
          <Field label="Body">
            <textarea
              value={form.body}
              onChange={(event) => setForm((prev) => ({ ...prev, body: event.target.value }))}
              rows={5}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              maxLength={5000}
              required
            />
          </Field>
          <Field label="Recipients">
            <select
              value={form.recipients}
              onChange={(event) => setForm((prev) => ({ ...prev, recipients: event.target.value }))}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="all">all participants</option>
              <option value="active_enrolled">enrolled/active participants</option>
              <option value="signup_new">signup requests with status new</option>
              <option value="signup_contacted">signup requests with status contacted</option>
            </select>
          </Field>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="rounded-lg border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
              {saving ? "Sending..." : "Send email"}
            </button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Laster meldinger...
        </div>
      ) : messages.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
          Ingen meldinger ennå.
        </div>
      ) : (
        <div className="grid gap-3">
          {messages.map((message) => (
            <div key={message.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="m-0 text-base font-extrabold text-slate-950">{message.subject}</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{message.body}</p>
                  <p className="m-0 mt-2 text-xs text-slate-500">
                    {message.recipientsCount} recipients · {message.createdAt?.toDate().toLocaleString() ?? "-"}
                  </p>
                  {message.errorMessage ? (
                    <p className="m-0 mt-2 text-xs font-semibold text-rose-700">
                      {message.errorMessage}
                    </p>
                  ) : null}
                </div>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-700">
                  {message.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ContentResourcesView({ course }: { course: Course }) {
  const sessionsWithResources = course.coursePlan.filter((session) => session.resources.length > 0);
  const resourceCount = sessionsWithResources.reduce((sum, session) => sum + session.resources.length, 0);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-lg font-extrabold text-slate-900">Content</h2>
          <p className="mt-1 text-sm text-slate-600">
            {resourceCount} ressurser fordelt på {sessionsWithResources.length} samlinger.
          </p>
        </div>
      </div>

      {resourceCount === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
          Ingen ressurser er lagt til ennå. Bruk Sessions for å legge til fra My Content, Library eller egne lenker.
        </div>
      ) : (
        <div className="grid gap-3">
          {sessionsWithResources.map((session) => (
            <section key={session.sessionNumber} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-black uppercase tracking-wide text-slate-500">
                Session {session.sessionNumber}
              </div>
              <h3 className="m-0 mt-1 text-base font-extrabold text-slate-950">
                {session.title || "Uten tittel"}
              </h3>
              <div className="mt-3 grid gap-2">
                {session.resources.map((resource) => (
                  <ResourceSummary key={resource.id} resource={resource} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ResourceSummary({ resource }: { resource: CourseSessionResource }) {
  const sourceLabel =
    resource.sourceType === "library"
      ? "Library"
      : resource.sourceType === "myContent"
        ? "My Content"
        : resource.type;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-extrabold text-slate-900">{resource.title || resource.type}</div>
          {resource.description ? (
            <div className="mt-1 whitespace-pre-wrap text-slate-600">{resource.description}</div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
            {sourceLabel}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
            {formatResourceVisibility(resource.visibility)}
          </span>
        </div>
      </div>
      {resource.url ? (
        <a
          href={resource.url}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex text-sm font-bold text-slate-900 underline"
        >
          Open resource
        </a>
      ) : null}
    </div>
  );
}

function formatResourceVisibility(visibility: CourseSessionResource["visibility"]): string {
  if (visibility === "teacher") return "Teacher only";
  if (visibility === "public") return "Public preview";
  return "Participants";
}

type CourseActionSummary = {
  participantCount: number | null;
  awaitingReviewCount: number | null;
  needsWorkCount: number | null;
  newSignupCount: number | null;
  paidOrderCount: number | null;
};

function getCourseSaleReadiness(course: Course) {
  const missing: string[] = [];
  if (course.status !== "published" && course.status !== "active") missing.push("publish course");
  if (course.sales.saleStatus !== "ready") missing.push("set sale status to ready");
  if (course.sales.priceAmountOre <= 0) missing.push("set price");
  if (course.sales.taxProfile.deliveryType !== "live_instruction") missing.push("live instruction delivery");
  if (course.sales.taxProfile.vatTreatment !== "vat_exempt_education") missing.push("VAT treatment");

  return { ready: missing.length === 0, missing };
}

function Overview({
  course,
  locale,
  onOpenSection,
}: {
  course: Course;
  locale: string;
  onOpenSection: (section: string) => void;
}) {
  const { user } = useUserProfile();
  const [summary, setSummary] = useState<CourseActionSummary>({
    participantCount: null,
    awaitingReviewCount: null,
    needsWorkCount: null,
    newSignupCount: null,
    paidOrderCount: null,
  });
  const nextSession = getNextSession(course);
  const saleReadiness = getCourseSaleReadiness(course);

  useEffect(() => {
    let cancelled = false;

    async function loadActionSummary() {
      if (!user) return;

      try {
        const token = await user.getIdToken();
        const [participantsRes, submissionsRes, requestsRes, ordersRes] = await Promise.all([
          fetch(`/api/teacher/courses/${course.id}/participants`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`/api/teacher/courses/${course.id}/submissions`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`/api/teacher/courses/${course.id}/signup-requests`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`/api/teacher/courses/${course.id}/orders`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        const participantsData = (await participantsRes.json().catch(() => ({}))) as {
          participants?: unknown[];
        };
        const submissionsData = (await submissionsRes.json().catch(() => ({}))) as {
          submissions?: CourseSubmissionRow[];
        };
        const requestsData = (await requestsRes.json().catch(() => ({}))) as {
          requests?: Array<{
            id?: string;
            name?: string;
            email?: string;
            status?: string;
            createdAt?: string;
          }>;
        };
        const ordersData = (await ordersRes.json().catch(() => ({}))) as {
          orders?: CourseOrderRow[];
        };
        const submissions = Array.isArray(submissionsData.submissions) ? submissionsData.submissions : [];
        const requests = Array.isArray(requestsData.requests) ? requestsData.requests : [];
        const orders = Array.isArray(ordersData.orders) ? ordersData.orders : [];

        if (!cancelled) {
          setSummary({
            participantCount: Array.isArray(participantsData.participants) ? participantsData.participants.length : 0,
            awaitingReviewCount: submissions.filter(
              (submission) => !submission.reviewStatus || submission.reviewStatus === "none"
            ).length,
            needsWorkCount: submissions.filter((submission) => submission.reviewStatus === "needs_work").length,
            newSignupCount: requests.filter((request) => request.status === "new").length,
            paidOrderCount: orders.filter((order) => order.status === "paid" || order.status === "completed").length,
          });
        }
      } catch {
        if (!cancelled) {
          setSummary({
            participantCount: 0,
            awaitingReviewCount: 0,
            needsWorkCount: 0,
            newSignupCount: 0,
            paidOrderCount: 0,
          });
        }
      }
    }

    void loadActionSummary();

    return () => {
      cancelled = true;
    };
  }, [course.id, user]);

  return (
    <div className="grid gap-4">
      <h2 className="m-0 text-lg font-extrabold text-slate-900">Overview</h2>
      <section
        className={`rounded-lg border p-4 ${
          saleReadiness.ready
            ? "border-emerald-200 bg-emerald-50 text-emerald-950"
            : "border-amber-200 bg-amber-50 text-amber-950"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="m-0 text-base font-black">
              {saleReadiness.ready ? "Course sale is ready" : "Course sale needs attention"}
            </h3>
            <p className="mt-1 text-sm leading-6">
              {saleReadiness.ready
                ? "The public page can show Buy course when Stripe Connect is connected."
                : `Missing: ${saleReadiness.missing.join(", ")}`}
            </p>
          </div>
          <Link
            href={`/${locale}/teacher/courses/${course.id}/marketing`}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-white/60 bg-white px-3 text-sm font-bold text-slate-950 no-underline hover:bg-slate-50"
          >
            Sales setup
          </Link>
        </div>
      </section>
      <div className="grid gap-3 md:grid-cols-5">
        <OverviewActionCard
          label="Awaiting review"
          value={summary.awaitingReviewCount}
          tone="slate"
          onClick={() => onOpenSection("Submissions")}
        />
        <OverviewActionCard
          label="Needs work"
          value={summary.needsWorkCount}
          tone="amber"
          onClick={() => onOpenSection("Submissions")}
        />
        <OverviewActionCard
          label="New signup requests"
          value={summary.newSignupCount}
          tone="emerald"
          onClick={() => onOpenSection("Participants")}
        />
        <OverviewActionCard
          label="Participants"
          value={summary.participantCount}
          tone="slate"
          onClick={() => onOpenSection("Participants")}
        />
        <OverviewActionCard
          label="Paid orders"
          value={summary.paidOrderCount}
          tone="emerald"
          onClick={() => onOpenSection("Payments")}
        />
      </div>
      <NextSessionOverview
        nextSession={nextSession}
        sessionRoomHref={
          nextSession
            ? `/${locale}/teacher/courses/${course.id}/sessions/${nextSession.sessionNumber}`
            : ""
        }
        onOpenSessions={() => onOpenSection("Sessions")}
        onOpenMessages={() => onOpenSection("Messages")}
      />
    </div>
  );
}

function NextSessionOverview({
  nextSession,
  sessionRoomHref,
  onOpenSessions,
  onOpenMessages,
}: {
  nextSession: Course["coursePlan"][number] | null;
  sessionRoomHref: string;
  onOpenSessions: () => void;
  onOpenMessages: () => void;
}) {
  if (!nextSession) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5">
        <h3 className="m-0 text-base font-extrabold text-slate-950">Next session</h3>
        <p className="mt-2 text-sm text-slate-600">
          Ingen planlagt samling ennå.
        </p>
        <button
          type="button"
          onClick={onOpenSessions}
          className="mt-3 inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-900"
        >
          Open sessions
        </button>
      </div>
    );
  }

  const participantResources = nextSession.resources.filter(
    (resource) => resource.visibility !== "teacher"
  );
  const teacherOnlyResources = nextSession.resources.length - participantResources.length;

  return (
    <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-wide text-emerald-800">
            Next session
          </div>
          <h3 className="m-0 mt-2 text-lg font-black text-emerald-950">
            {nextSession.title || `Session ${nextSession.sessionNumber}`}
          </h3>
          <p className="mt-1 text-sm font-semibold text-emerald-900">
            {formatSessionDate(nextSession.startsAt)} · {nextSession.durationMinutes || 120} min
          </p>
        </div>
        <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-bold text-emerald-900">
          {nextSession.status}
        </span>
      </div>

      {nextSession.description ? (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-emerald-950">
          {nextSession.description}
        </p>
      ) : null}

      <div className="mt-4 grid gap-2 text-xs font-bold text-emerald-950 md:grid-cols-3">
        <div className="rounded-lg border border-emerald-200 bg-white p-3">
          Participant resources: {participantResources.length}
        </div>
        <div className="rounded-lg border border-emerald-200 bg-white p-3">
          Teacher only: {teacherOnlyResources}
        </div>
        <div className="rounded-lg border border-emerald-200 bg-white p-3">
          Meeting link: {nextSession.meetingUrl ? "ready" : "missing"}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {nextSession ? (
          <Link
            href={sessionRoomHref}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-emerald-800 bg-emerald-800 px-3 text-sm font-bold text-white no-underline"
          >
            Open meeting
          </Link>
        ) : null}
        <button
          type="button"
          onClick={onOpenSessions}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-emerald-300 bg-white px-3 text-sm font-bold text-emerald-950"
        >
          Edit session
        </button>
        <button
          type="button"
          onClick={onOpenMessages}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-emerald-300 bg-white px-3 text-sm font-bold text-emerald-950"
        >
          Message participants
        </button>
      </div>
    </section>
  );
}

function OverviewActionCard({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: number | null;
  tone: "slate" | "amber" | "emerald";
  onClick: () => void;
}) {
  const toneClass =
    tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-950"
      : tone === "emerald"
        ? "border-emerald-200 bg-emerald-50 text-emerald-950"
        : "border-slate-200 bg-slate-50 text-slate-950";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${toneClass}`}
    >
      <div className="text-xs font-black uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-2 text-2xl font-black">{value === null ? "-" : value}</div>
    </button>
  );
}

function getNextSession(course: Course) {
  const now = Date.now();
  const planned = course.coursePlan
    .filter((session) => session.status === "planned")
    .sort((a, b) => {
      const aTime = a.startsAt ? new Date(a.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.startsAt ? new Date(b.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });

  return (
    planned.find((session) => !session.startsAt || new Date(session.startsAt).getTime() >= now) ??
    planned[0] ??
    null
  );
}

function formatSessionDate(value: string): string {
  if (!value) return "Dato ikke satt";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatMaybeIsoDate(value: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatReviewStatus(value: string): string {
  if (value === "approved") return "Approved";
  if (value === "needs_work") return "Needs work";
  return "No status";
}

function parseParticipantsText(text: string, organization: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const emailMatch = line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      const email = emailMatch?.[0]?.toLowerCase() ?? "";
      const name = email
        ? line
            .replace(email, "")
            .replace(/[<>,;]/g, " ")
            .replace(/\s+/g, " ")
            .trim()
        : "";

      return {
        name: name || email.split("@")[0] || "",
        email,
        phone: "",
        organization,
      };
    })
    .filter((item) => item.email);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-bold text-slate-800">
      <span>{label}</span>
      {children}
    </label>
  );
}
