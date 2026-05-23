"use client";

import Link from "next/link";
import { getAuth, getIdToken } from "firebase/auth";
import { useLocale } from "next-intl";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";

import AdminSection from "@/components/admin/AdminSection";
import AdminStatCard from "@/components/admin/AdminStatCard";
import AdminStatusBadge, { type AdminTone } from "@/components/admin/AdminStatusBadge";

type PartnerApplication = {
  id?: string;
  uid?: string;
  email?: string;
  name?: string;
  city?: string;
  country?: string;
  languages?: string[];
  currentRole?: string;
  status?: string;
  createdAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
};

type PartnerUserProfile = {
  id?: string;
  uid?: string;
  email?: string;
  displayName?: string;
  role?: string;
  partnerAccess?: boolean;
  partnerStatus?: string;
  partnerLevel?: string;
  partnerRegion?: string;
  partnerLanguages?: string[];
  partnerApprovedAt?: string;
  partnerApprovedBy?: string;
  partnerStatusUpdatedAt?: string;
  partnerStatusUpdatedBy?: string;
  partnerFollowUpStatus?: string;
  partnerFollowUpStatusUpdatedAt?: string;
  partnerFollowUpStatusUpdatedBy?: string;
  partnerAdminNotes?: string;
};

type PartnerDetailResponse = {
  ok?: boolean;
  error?: string;
  partnerId?: string;
  applicationId?: string | null;
  uid?: string | null;
  application?: PartnerApplication | null;
  userProfile?: PartnerUserProfile | null;
  adminNotes?: string;
  communications?: PartnerCommunication[];
  reviewedReplyCount?: number;
};

type PartnerAccessStatus = "active" | "disabled";
type PartnerFollowUpStatus = "needs_follow_up" | "waiting" | "done";

type PartnerCommunication = {
  id?: string;
  message?: string;
  type?: string;
  visibility?: string;
  createdBy?: string;
  createdAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
};

type TimelineItem = {
  key: string;
  title: string;
  text: string;
  date?: string | null;
  meta?: string;
  tone?: "green" | "blue" | "amber" | "slate";
};

function statusTone(status?: string): AdminTone {
  if (status === "approved" || status === "active") return "green";
  if (status === "pending") return "amber";
  return "slate";
}

function followUpTone(status?: string): AdminTone {
  if (status === "done") return "green";
  if (status === "waiting") return "blue";
  if (status === "needs_follow_up") return "amber";
  return "slate";
}

function cleanValue(value?: string | null): string {
  if (!value) return "-";
  return value.replaceAll("_", " ");
}

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-GB");
}

export default function AdminPartnerDetailPage() {
  const locale = useLocale();
  const params = useParams<{ partnerId?: string }>();
  const partnerId = useMemo(() => {
    const raw = params?.partnerId;
    return typeof raw === "string" ? raw : "";
  }, [params]);

  const [detail, setDetail] = useState<PartnerDetailResponse | null>(null);
  const [notes, setNotes] = useState("");
  const [communicationMessage, setCommunicationMessage] = useState("");
  const [communicationVisibility, setCommunicationVisibility] =
    useState<"admin_internal" | "partner_visible">("admin_internal");
  const [accessStatus, setAccessStatus] = useState<PartnerAccessStatus>("disabled");
  const [followUpStatus, setFollowUpStatus] =
    useState<PartnerFollowUpStatus>("needs_follow_up");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingFollowUpStatus, setSavingFollowUpStatus] = useState(false);
  const [savingCommunication, setSavingCommunication] = useState(false);
  const [markingReviewed, setMarkingReviewed] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadPartner = useCallback(async () => {
    if (!partnerId) {
      setLoading(false);
      setError("Missing partner ID");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error("Not signed in");

      const token = await getIdToken(user, true);
      const response = await fetch(`/api/admin/partners/${encodeURIComponent(partnerId)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = (await response.json().catch(() => ({}))) as PartnerDetailResponse;

      if (!response.ok || !data.ok) {
        throw new Error(data.error || `Could not load partner (${response.status})`);
      }

      setDetail(data);
      setNotes(data.adminNotes ?? "");
      setAccessStatus(data.userProfile?.partnerStatus === "active" ? "active" : "disabled");
      setFollowUpStatus(
        data.userProfile?.partnerFollowUpStatus === "waiting" ||
          data.userProfile?.partnerFollowUpStatus === "done"
          ? data.userProfile.partnerFollowUpStatus
          : "needs_follow_up"
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [partnerId]);

  useEffect(() => {
    void loadPartner();
  }, [loadPartner]);

  async function saveNotes() {
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error("Not signed in");

      const token = await getIdToken(user, true);
      const response = await fetch(`/api/admin/partners/${encodeURIComponent(partnerId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ adminNotes: notes }),
      });
      const data = (await response.json().catch(() => ({}))) as PartnerDetailResponse;

      if (!response.ok || !data.ok) {
        throw new Error(data.error || `Could not save notes (${response.status})`);
      }

      setMessage("Partner notes saved.");
      await loadPartner();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function saveAccessStatus() {
    const confirmed =
      accessStatus === "active"
        ? window.confirm("Activate partner access for this user?")
        : window.confirm("Disable partner access for this user?");

    if (!confirmed) return;

    setSavingStatus(true);
    setError("");
    setMessage("");

    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error("Not signed in");

      const token = await getIdToken(user, true);
      const response = await fetch(`/api/admin/partners/${encodeURIComponent(partnerId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ partnerStatus: accessStatus }),
      });
      const data = (await response.json().catch(() => ({}))) as PartnerDetailResponse;

      if (!response.ok || !data.ok) {
        throw new Error(data.error || `Could not save partner status (${response.status})`);
      }

      setMessage("Partner access status saved.");
      await loadPartner();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingStatus(false);
    }
  }

  async function saveFollowUpStatus() {
    setSavingFollowUpStatus(true);
    setError("");
    setMessage("");

    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error("Not signed in");

      const token = await getIdToken(user, true);
      const response = await fetch(`/api/admin/partners/${encodeURIComponent(partnerId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ partnerFollowUpStatus: followUpStatus }),
      });
      const data = (await response.json().catch(() => ({}))) as PartnerDetailResponse;

      if (!response.ok || !data.ok) {
        throw new Error(data.error || `Could not save follow-up status (${response.status})`);
      }

      setMessage("Follow-up status saved.");
      await loadPartner();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingFollowUpStatus(false);
    }
  }

  async function addCommunicationEntry() {
    setSavingCommunication(true);
    setError("");
    setMessage("");

    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error("Not signed in");

      const token = await getIdToken(user, true);
      const response = await fetch(`/api/admin/partners/${encodeURIComponent(partnerId)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: communicationMessage, visibility: communicationVisibility }),
      });
      const data = (await response.json().catch(() => ({}))) as PartnerDetailResponse;

      if (!response.ok || !data.ok) {
        throw new Error(data.error || `Could not add communication (${response.status})`);
      }

      setCommunicationMessage("");
      setMessage("Communication entry added.");
      await loadPartner();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingCommunication(false);
    }
  }

  async function markRepliesReviewed() {
    setMarkingReviewed(true);
    setError("");
    setMessage("");

    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error("Not signed in");

      const token = await getIdToken(user, true);
      const response = await fetch(`/api/admin/partners/${encodeURIComponent(partnerId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ markPartnerRepliesReviewed: true }),
      });
      const data = (await response.json().catch(() => ({}))) as PartnerDetailResponse;

      if (!response.ok || !data.ok) {
        throw new Error(data.error || `Could not mark replies reviewed (${response.status})`);
      }

      setMessage(`${data.reviewedReplyCount ?? 0} partner replies marked as reviewed.`);
      await loadPartner();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setMarkingReviewed(false);
    }
  }

  const application = detail?.application ?? null;
  const userProfile = detail?.userProfile ?? null;
  const partnerName =
    userProfile?.displayName || application?.name || userProfile?.email || application?.email || partnerId;
  const partnerStatus = userProfile?.partnerStatus || application?.status || "unknown";
  const currentFollowUpStatus = userProfile?.partnerFollowUpStatus || "needs_follow_up";
  const applicationStatus = application?.status || "-";
  const region = userProfile?.partnerRegion || [application?.city, application?.country].filter(Boolean).join(", ");
  const languages = userProfile?.partnerLanguages?.length
    ? userProfile.partnerLanguages
    : application?.languages ?? [];
  const communications = useMemo(() => detail?.communications ?? [], [detail?.communications]);
  const partnerReplies = communications.filter((entry) => entry.type === "partner_reply");
  const unreviewedPartnerReplies = partnerReplies.filter((entry) => !entry.reviewedAt);
  const latestPartnerReplyAt = partnerReplies
    .map((entry) => entry.createdAt ?? "")
    .sort((a, b) => b.localeCompare(a))[0];
  const timelineItems = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];

    if (application?.createdAt) {
      items.push({
        key: "application-created",
        title: "Application submitted",
        text: application.currentRole
          ? `Role: ${cleanValue(application.currentRole)}`
          : "Partner application was submitted.",
        date: application.createdAt,
        meta: application.email || application.name || undefined,
        tone: "blue",
      });
    }

    if (application?.reviewedAt) {
      items.push({
        key: "application-reviewed",
        title: "Application reviewed",
        text: `Status: ${cleanValue(application.status)}`,
        date: application.reviewedAt,
        meta: application.reviewedBy ? `Reviewed by ${application.reviewedBy}` : undefined,
        tone: statusTone(application.status) as TimelineItem["tone"],
      });
    }

    if (userProfile?.partnerApprovedAt) {
      items.push({
        key: "partner-approved",
        title: "Partner access approved",
        text: `Partner status: ${cleanValue(userProfile.partnerStatus)}`,
        date: userProfile.partnerApprovedAt,
        meta: userProfile.partnerApprovedBy ? `Approved by ${userProfile.partnerApprovedBy}` : undefined,
        tone: "green",
      });
    }

    if (userProfile?.partnerStatusUpdatedAt) {
      items.push({
        key: "partner-status-updated",
        title: "Partner status updated",
        text: `Current status: ${cleanValue(userProfile.partnerStatus)}`,
        date: userProfile.partnerStatusUpdatedAt,
        meta:
          typeof userProfile.partnerStatusUpdatedBy === "string"
            ? `Updated by ${userProfile.partnerStatusUpdatedBy}`
            : undefined,
        tone: statusTone(userProfile.partnerStatus) as TimelineItem["tone"],
      });
    }

    if (userProfile?.partnerFollowUpStatusUpdatedAt) {
      items.push({
        key: "partner-follow-up-status-updated",
        title: "Follow-up status updated",
        text: `Follow-up: ${cleanValue(userProfile.partnerFollowUpStatus)}`,
        date: userProfile.partnerFollowUpStatusUpdatedAt,
        meta:
          typeof userProfile.partnerFollowUpStatusUpdatedBy === "string"
            ? `Updated by ${userProfile.partnerFollowUpStatusUpdatedBy}`
            : undefined,
        tone: followUpTone(userProfile.partnerFollowUpStatus) as TimelineItem["tone"],
      });
    }

    for (const entry of communications) {
      const title =
        entry.type === "partner_reply"
          ? "Partner reply"
          : entry.type === "admin_broadcast"
            ? "Broadcast received"
            : entry.visibility === "partner_visible"
              ? "Admin message"
              : "Internal admin note";

      items.push({
        key: entry.id ?? `${entry.type}-${entry.createdAt}-${entry.message}`,
        title,
        text: entry.message || "-",
        date: entry.createdAt,
        meta:
          entry.type === "partner_reply" && !entry.reviewedAt
            ? "Needs review"
            : cleanValue(entry.visibility || "admin_internal"),
        tone:
          entry.type === "partner_reply" && !entry.reviewedAt
            ? "amber"
            : entry.visibility === "partner_visible"
              ? "green"
              : "slate",
      });
    }

    return items.sort((a, b) => String(b.date ?? "").localeCompare(String(a.date ?? "")));
  }, [application, communications, userProfile]);

  return (
    <main style={styles.page}>
      <section style={styles.header}>
        <div>
          <div style={styles.kicker}>PARTNER DETAIL</div>
          <h1 style={styles.h1}>{partnerName}</h1>
          <p style={styles.lead}>Partner profile, application data, access status, and internal notes.</p>
        </div>

        <div style={styles.actions}>
          <button onClick={loadPartner} disabled={loading || saving} style={styles.secondaryButton}>
            {loading ? "Loading..." : "Refresh"}
          </button>
          <Link href={`/${locale}/admin/partners`} style={styles.linkButton}>
            Back to partners
          </Link>
        </div>
      </section>

      {error ? <section style={styles.error}>Error: {error}</section> : null}
      {message ? <section style={styles.success}>{message}</section> : null}

      {loading ? <section style={styles.empty}>Loading partner...</section> : null}

      {!loading && detail ? (
        <>
          <section style={styles.statsGrid}>
            <AdminStatCard
              title="Partner status"
              value={cleanValue(partnerStatus)}
              text={userProfile?.partnerAccess ? "Partner access is active." : "Partner access is not active."}
              tone={statusTone(partnerStatus)}
            />
            <AdminStatCard
              title="Application"
              value={cleanValue(applicationStatus)}
              text={application ? "Application record found." : "No application record found."}
              tone={statusTone(applicationStatus)}
            />
            <AdminStatCard
              title="Region"
              value={region || "-"}
              text="Location from application or user profile."
              tone="blue"
            />
            <AdminStatCard
              title="Languages"
              value={String(languages.length)}
              text={languages.length ? languages.join(", ") : "No languages registered."}
              tone="slate"
            />
            <AdminStatCard
              title="Needs review"
              value={String(unreviewedPartnerReplies.length)}
              text={
                unreviewedPartnerReplies.length > 0
                  ? "Partner replies waiting for your review."
                  : "All partner replies are reviewed."
              }
              tone={unreviewedPartnerReplies.length > 0 ? "amber" : "green"}
            />
            <AdminStatCard
              title="Partner replies"
              value={String(partnerReplies.length)}
              text={
                latestPartnerReplyAt
                  ? `Latest reply: ${formatDate(latestPartnerReplyAt)}`
                  : "No replies from this partner yet."
              }
              tone="blue"
            />
            <AdminStatCard
              title="Follow-up"
              value={cleanValue(currentFollowUpStatus)}
              text={
                userProfile?.partnerFollowUpStatusUpdatedAt
                  ? `Updated: ${formatDate(userProfile.partnerFollowUpStatusUpdatedAt)}`
                  : "Internal admin workflow status."
              }
              tone={followUpTone(currentFollowUpStatus)}
            />
          </section>

          <section style={styles.twoColumn}>
            <AdminSection title="Profile" description="Current partner fields stored on the user profile.">
              <section style={styles.card}>
                <dl style={styles.details}>
                  <DetailItem label="UID" value={detail.uid || userProfile?.uid || "-"} />
                  <DetailItem label="Name" value={userProfile?.displayName || "-"} />
                  <DetailItem label="Email" value={userProfile?.email || "-"} />
                  <DetailItem label="App role" value={cleanValue(userProfile?.role)} />
                  <DetailItem label="Partner level" value={cleanValue(userProfile?.partnerLevel)} />
                  <DetailItem label="Approved" value={formatDate(userProfile?.partnerApprovedAt)} />
                  <DetailItem label="Approved by" value={userProfile?.partnerApprovedBy || "-"} />
                  <DetailItem label="Access" value={userProfile?.partnerAccess ? "Active" : "Not active"} />
                </dl>
              </section>
            </AdminSection>

            <AdminSection
              title="Access control"
              description="Activate or disable partner access on the user profile."
            >
              <section style={styles.card}>
                {userProfile ? (
                  <>
                    <label style={styles.label}>
                      Partner access status
                      <select
                        value={accessStatus}
                        onChange={(event) =>
                          setAccessStatus(event.target.value as PartnerAccessStatus)
                        }
                        style={styles.select}
                      >
                        <option value="active">Active</option>
                        <option value="disabled">Disabled</option>
                      </select>
                    </label>
                    <p style={styles.helpText}>
                      Active gives partner access. Disabled removes partner access without deleting
                      notes or application history.
                    </p>
                    <button
                      onClick={saveAccessStatus}
                      disabled={savingStatus || loading}
                      style={styles.primaryButton}
                    >
                      {savingStatus ? "Saving..." : "Save status"}
                    </button>
                  </>
                ) : (
                  <p style={styles.muted}>
                    No user profile was found, so access status cannot be changed yet.
                  </p>
                )}
              </section>
            </AdminSection>

            <AdminSection
              title="Follow-up status"
              description="Internal admin workflow status for this partner."
            >
              <section style={styles.card}>
                {userProfile ? (
                  <>
                    <div style={styles.followUpHeader}>
                      <AdminStatusBadge tone={followUpTone(currentFollowUpStatus)}>
                        {cleanValue(currentFollowUpStatus)}
                      </AdminStatusBadge>
                      <span style={styles.followUpUpdated}>
                        {userProfile.partnerFollowUpStatusUpdatedAt
                          ? `Updated ${formatDate(userProfile.partnerFollowUpStatusUpdatedAt)}`
                          : "Not updated yet"}
                      </span>
                    </div>
                    <label style={styles.label}>
                      Follow-up status
                      <select
                        value={followUpStatus}
                        onChange={(event) =>
                          setFollowUpStatus(event.target.value as PartnerFollowUpStatus)
                        }
                        style={styles.select}
                      >
                        <option value="needs_follow_up">Needs follow-up</option>
                        <option value="waiting">Waiting</option>
                        <option value="done">Done</option>
                      </select>
                    </label>
                    <p style={styles.helpText}>
                      This is only for your admin workflow. It does not affect partner access.
                    </p>
                    <button
                      onClick={saveFollowUpStatus}
                      disabled={savingFollowUpStatus || loading}
                      style={styles.primaryButton}
                    >
                      {savingFollowUpStatus ? "Saving..." : "Save follow-up"}
                    </button>
                  </>
                ) : (
                  <p style={styles.muted}>
                    No user profile was found, so follow-up status cannot be changed yet.
                  </p>
                )}
              </section>
            </AdminSection>

            <AdminSection title="Application" description="Original partner application details.">
              <section style={styles.card}>
                {application ? (
                  <dl style={styles.details}>
                    <DetailItem label="Application ID" value={detail.applicationId || "-"} />
                    <DetailItem label="Name" value={application.name || "-"} />
                    <DetailItem label="Email" value={application.email || "-"} />
                    <DetailItem label="Current role" value={cleanValue(application.currentRole)} />
                    <DetailItem label="City" value={application.city || "-"} />
                    <DetailItem label="Country" value={application.country || "-"} />
                    <DetailItem label="Created" value={formatDate(application.createdAt)} />
                    <DetailItem label="Reviewed" value={formatDate(application.reviewedAt)} />
                    <DetailItem label="Reviewed by" value={application.reviewedBy || "-"} />
                  </dl>
                ) : (
                  <p style={styles.muted}>No application record was found for this partner.</p>
                )}
              </section>
            </AdminSection>
          </section>

          <AdminSection
            title="Internal notes"
            description="Private admin notes. These are not shown to the partner."
          >
            <section style={styles.card}>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                maxLength={4000}
                placeholder="Add context, strengths, follow-up ideas, communication history..."
                style={styles.textarea}
              />
              <div style={styles.noteActions}>
                <span style={styles.count}>{notes.length} / 4000</span>
                <button onClick={saveNotes} disabled={saving || loading} style={styles.primaryButton}>
                  {saving ? "Saving..." : "Save notes"}
                </button>
              </div>
            </section>
          </AdminSection>

          <AdminSection
            title="Timeline"
            description="A simple overview of the partner relationship, from application to latest follow-up."
          >
            <section style={styles.card}>
              {timelineItems.length === 0 ? (
                <div style={styles.emptyCompact}>No timeline events yet.</div>
              ) : null}

              <div style={styles.timelineList}>
                {timelineItems.map((item) => (
                  <article key={item.key} style={styles.timelineItem}>
                    <div style={styles.timelineMarkerWrap}>
                      <span
                        style={{
                          ...styles.timelineMarker,
                          ...(item.tone === "green"
                            ? styles.timelineMarkerGreen
                            : item.tone === "amber"
                              ? styles.timelineMarkerAmber
                              : item.tone === "blue"
                                ? styles.timelineMarkerBlue
                                : styles.timelineMarkerSlate),
                        }}
                      />
                    </div>
                    <div style={styles.timelineContent}>
                      <div style={styles.timelineHeader}>
                        <strong>{item.title}</strong>
                        <span>{formatDate(item.date)}</span>
                      </div>
                      <p style={styles.timelineText}>{item.text}</p>
                      {item.meta ? <div style={styles.timelineMeta}>{item.meta}</div> : null}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </AdminSection>

          <AdminSection
            title="Communication log"
            description="Admin-only log for follow-up, message drafts, and contact history."
          >
            <section style={styles.card}>
              <div style={styles.reviewRow}>
                <div>
                  <strong>{unreviewedPartnerReplies.length} replies need review</strong>
                  <p style={styles.reviewText}>
                    Mark partner replies reviewed when you have read and handled them.
                  </p>
                </div>
                <button
                  onClick={markRepliesReviewed}
                  disabled={markingReviewed || unreviewedPartnerReplies.length === 0}
                  style={styles.secondaryButton}
                >
                  {markingReviewed ? "Marking..." : "Mark replies reviewed"}
                </button>
              </div>

              <textarea
                value={communicationMessage}
                onChange={(event) => setCommunicationMessage(event.target.value)}
                maxLength={4000}
                placeholder="Add a follow-up note, message draft, or contact summary..."
                style={styles.textarea}
              />
              <label style={styles.label}>
                Visibility
                <select
                  value={communicationVisibility}
                  onChange={(event) =>
                    setCommunicationVisibility(
                      event.target.value === "partner_visible"
                        ? "partner_visible"
                        : "admin_internal"
                    )
                  }
                  style={styles.select}
                >
                  <option value="admin_internal">Admin internal</option>
                  <option value="partner_visible">Visible to partner</option>
                </select>
              </label>
              <div style={styles.noteActions}>
                <span style={styles.count}>{communicationMessage.length} / 4000</span>
                <button
                  onClick={addCommunicationEntry}
                  disabled={savingCommunication || loading || !communicationMessage.trim()}
                  style={styles.primaryButton}
                >
                  {savingCommunication ? "Adding..." : "Add to log"}
                </button>
              </div>

              <div style={styles.communicationList}>
                {communications.length === 0 ? (
                  <div style={styles.emptyCompact}>No communication entries yet.</div>
                ) : null}

                {communications.map((entry) => (
                  <article
                    key={entry.id ?? entry.createdAt ?? entry.message}
                    style={
                      entry.type === "partner_reply"
                        ? { ...styles.logItem, ...styles.partnerReplyLogItem }
                        : styles.logItem
                    }
                  >
                    <div style={styles.logMeta}>
                      <span>{cleanValue(entry.type || "admin note")}</span>
                      <span>{formatDate(entry.createdAt)}</span>
                    </div>
                    <p style={styles.logMessage}>{entry.message || "-"}</p>
                    <div style={styles.logFooter}>
                      Visibility: {cleanValue(entry.visibility || "admin_internal")}
                      {entry.type === "partner_reply" ? (
                        <>
                          {" · "}
                          {entry.reviewedAt ? `Reviewed ${formatDate(entry.reviewedAt)}` : "Needs review"}
                        </>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </AdminSection>
        </>
      ) : null}
    </main>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt style={styles.detailLabel}>{label}</dt>
      <dd style={styles.detailValue}>{value}</dd>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    display: "grid",
    gap: 16,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    flexWrap: "wrap",
    border: "1px solid var(--admin-border, #e5e7eb)",
    borderRadius: "var(--admin-radius, 10px)",
    padding: 18,
    background: "var(--admin-surface, #ffffff)",
    boxShadow: "var(--admin-shadow, 0 1px 2px rgba(15, 23, 42, 0.05))",
  },
  kicker: {
    fontSize: 12,
    fontWeight: 900,
    color: "#2563eb",
  },
  h1: {
    margin: "4px 0 0",
    fontSize: 26,
    letterSpacing: 0,
  },
  lead: {
    margin: "8px 0 0",
    color: "var(--admin-muted, #64748b)",
  },
  actions: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
  },
  twoColumn: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))",
    gap: 16,
  },
  card: {
    border: "1px solid var(--admin-border, #e5e7eb)",
    borderRadius: "var(--admin-radius, 10px)",
    padding: 16,
    background: "var(--admin-surface, #ffffff)",
    boxShadow: "var(--admin-shadow, 0 1px 2px rgba(15, 23, 42, 0.05))",
  },
  details: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 12,
    margin: 0,
  },
  detailLabel: {
    color: "var(--admin-muted, #64748b)",
    fontSize: 13,
    fontWeight: 700,
  },
  detailValue: {
    margin: "5px 0 0",
    color: "#0f172a",
    fontSize: 15,
    fontWeight: 800,
    wordBreak: "break-word",
  },
  textarea: {
    width: "100%",
    minHeight: 180,
    resize: "vertical",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    lineHeight: 1.5,
  },
  label: {
    display: "grid",
    gap: 7,
    color: "#0f172a",
    fontSize: 14,
    fontWeight: 800,
  },
  select: {
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: "10px 12px",
    background: "#ffffff",
    color: "#0f172a",
    fontSize: 15,
  },
  helpText: {
    margin: "10px 0 14px",
    color: "var(--admin-muted, #64748b)",
    lineHeight: 1.5,
    fontSize: 14,
  },
  followUpHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
    marginBottom: 14,
  },
  followUpUpdated: {
    color: "var(--admin-muted, #64748b)",
    fontSize: 13,
    fontWeight: 700,
  },
  noteActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 12,
  },
  reviewRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    border: "1px solid #fde68a",
    borderRadius: 8,
    padding: 12,
    background: "#fffbeb",
    marginBottom: 14,
  },
  reviewText: {
    margin: "4px 0 0",
    color: "#92400e",
    lineHeight: 1.45,
    fontSize: 14,
  },
  communicationList: {
    display: "grid",
    gap: 10,
    marginTop: 16,
  },
  timelineList: {
    display: "grid",
    gap: 0,
  },
  timelineItem: {
    display: "grid",
    gridTemplateColumns: "24px 1fr",
    gap: 10,
    padding: "0 0 14px",
  },
  timelineMarkerWrap: {
    display: "flex",
    justifyContent: "center",
    paddingTop: 4,
    borderLeft: "1px solid #e2e8f0",
    marginLeft: 6,
  },
  timelineMarker: {
    width: 11,
    height: 11,
    borderRadius: 999,
    display: "block",
    marginLeft: -6,
    border: "2px solid #ffffff",
    boxShadow: "0 0 0 1px #cbd5e1",
  },
  timelineMarkerGreen: {
    background: "#16a34a",
    boxShadow: "0 0 0 1px #86efac",
  },
  timelineMarkerAmber: {
    background: "#d97706",
    boxShadow: "0 0 0 1px #fcd34d",
  },
  timelineMarkerBlue: {
    background: "#2563eb",
    boxShadow: "0 0 0 1px #93c5fd",
  },
  timelineMarkerSlate: {
    background: "#64748b",
    boxShadow: "0 0 0 1px #cbd5e1",
  },
  timelineContent: {
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: 12,
    background: "#f8fafc",
  },
  timelineHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
    color: "#0f172a",
    fontSize: 14,
  },
  timelineText: {
    margin: "8px 0 0",
    color: "#0f172a",
    lineHeight: 1.55,
    whiteSpace: "pre-wrap",
  },
  timelineMeta: {
    marginTop: 8,
    color: "#64748b",
    fontSize: 12,
    fontWeight: 800,
  },
  logItem: {
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: 12,
    background: "#f8fafc",
  },
  partnerReplyLogItem: {
    border: "1px solid #bfdbfe",
    background: "#eff6ff",
  },
  logMeta: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
    color: "#64748b",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
  },
  logMessage: {
    margin: "8px 0 0",
    color: "#0f172a",
    lineHeight: 1.55,
    whiteSpace: "pre-wrap",
  },
  logFooter: {
    marginTop: 8,
    color: "#64748b",
    fontSize: 12,
  },
  count: {
    color: "var(--admin-muted, #64748b)",
    fontSize: 14,
  },
  muted: {
    margin: 0,
    color: "var(--admin-muted, #64748b)",
    lineHeight: 1.5,
  },
  primaryButton: {
    border: "1px solid #2563eb",
    borderRadius: 8,
    padding: "10px 14px",
    background: "#2563eb",
    color: "#ffffff",
    fontWeight: 800,
    cursor: "pointer",
  },
  secondaryButton: {
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: "10px 14px",
    background: "#ffffff",
    color: "#111827",
    fontWeight: 800,
    cursor: "pointer",
  },
  linkButton: {
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: "10px 14px",
    background: "#ffffff",
    color: "#111827",
    fontWeight: 800,
    textDecoration: "none",
  },
  empty: {
    border: "1px solid var(--admin-border, #e5e7eb)",
    borderRadius: "var(--admin-radius, 10px)",
    padding: 18,
    background: "var(--admin-surface, #ffffff)",
    color: "var(--admin-muted, #64748b)",
  },
  emptyCompact: {
    border: "1px solid #e2e8f0",
    borderRadius: 8,
    padding: 12,
    background: "#f8fafc",
    color: "var(--admin-muted, #64748b)",
  },
  success: {
    border: "1px solid #a7f3d0",
    borderRadius: 8,
    padding: 12,
    background: "#ecfdf5",
    color: "#047857",
  },
  error: {
    border: "1px solid #fecaca",
    borderRadius: 8,
    padding: 12,
    background: "#fef2f2",
    color: "#b91c1c",
  },
};
