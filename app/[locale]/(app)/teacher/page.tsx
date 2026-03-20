// app/(app)/teacher/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { DashboardIntro } from "@/components/DashboardIntro";
import { db } from "@/lib/firebase";
import { getBucketLimit, type AppRole, type PlanKey } from "@/lib/featureAccess";
import {
  archiveStudentFromTeacherSpaces,
  getTeacherStudentCount,
  getTeacherStudentsOverview,
  removeStudentFromTeacherSpaces,
  type TeacherStudentOverviewItem,
} from "@/lib/teacherStudentLimit";
import { useUsage } from "@/lib/useUsage";
import { useUserProfile } from "@/lib/useUserProfile";

function safeRole(role?: string): AppRole {
  if (role === "teacher") return "teacher";
  if (role === "student") return "student";
  if (role === "parent") return "parent";
  if (role === "creator") return "creator";
  if (role === "admin") return "admin";
  return "teacher";
}

function safePlan(plan?: string): PlanKey {
  if (plan === "basic") return "basic";
  if (plan === "plus") return "plus";
  if (plan === "pro") return "pro";
  return "free";
}

function withLocale(locale: string, href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  if (!href.startsWith("/")) return href;

  const seg = href.split("/")[1];
  if (seg === "en" || seg === "no" || seg === "pt") return href;

  if (href === "/") return `/${locale}`;
  return `/${locale}${href}`;
}

function percent(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((used / limit) * 100)));
}

function getStatusText(used: number, limit: number): string {
  if (limit <= 0) return "Unavailable";
  const p = percent(used, limit);
  if (p >= 100) return "Limit reached";
  if (p >= 85) return "Almost full";
  if (p >= 60) return "Getting busy";
  return "Good";
}

function getProgressTone(used: number, limit: number): {
  badgeBg: string;
  badgeColor: string;
  badgeBorder: string;
  fill: string;
} {
  const p = percent(used, limit);

  if (p >= 100) {
    return {
      badgeBg: "#fef2f2",
      badgeColor: "#b91c1c",
      badgeBorder: "#fecaca",
      fill: "#dc2626",
    };
  }

  if (p >= 85) {
    return {
      badgeBg: "#fff7ed",
      badgeColor: "#c2410c",
      badgeBorder: "#fdba74",
      fill: "#f97316",
    };
  }

  if (p >= 60) {
    return {
      badgeBg: "#fffbeb",
      badgeColor: "#a16207",
      badgeBorder: "#fde68a",
      fill: "#eab308",
    };
  }

  return {
    badgeBg: "#ecfdf5",
    badgeColor: "#047857",
    badgeBorder: "#a7f3d0",
    fill: "#10b981",
  };
}

type StatCardProps = {
  title: string;
  used: number;
  limit: number;
  accent?: "blue" | "emerald" | "violet" | "slate";
};

function StatCard({ title, used, limit, accent = "slate" }: StatCardProps) {
  const p = percent(used, limit);
  const status = getStatusText(used, limit);
  const tone = getProgressTone(used, limit);

  const topGlow =
    accent === "blue"
      ? "linear-gradient(135deg, rgba(59,130,246,0.14), rgba(147,197,253,0.04))"
      : accent === "emerald"
      ? "linear-gradient(135deg, rgba(16,185,129,0.14), rgba(110,231,183,0.04))"
      : accent === "violet"
      ? "linear-gradient(135deg, rgba(139,92,246,0.14), rgba(196,181,253,0.04))"
      : "linear-gradient(135deg, rgba(148,163,184,0.14), rgba(226,232,240,0.04))";

  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        border: "1px solid #e5e7eb",
        borderRadius: 18,
        background: "#ffffff",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        padding: 16,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: topGlow,
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "relative" }}>
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{title}</div>

          <span
            style={{
              borderRadius: 999,
              padding: "5px 9px",
              fontSize: 12,
              fontWeight: 700,
              background: tone.badgeBg,
              color: tone.badgeColor,
              border: `1px solid ${tone.badgeBorder}`,
            }}
          >
            {status}
          </span>
        </div>

        <div
          style={{
            marginTop: 14,
            display: "flex",
            alignItems: "end",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div style={{ fontSize: 28, fontWeight: 800, color: "#111827", lineHeight: 1 }}>
            {used}
            <span style={{ fontSize: 16, fontWeight: 600, color: "#64748b", marginLeft: 6 }}>
              / {limit}
            </span>
          </div>

          <div style={{ fontSize: 12, color: "#64748b" }}>{p}% used</div>
        </div>

        <div
          style={{
            marginTop: 12,
            height: 10,
            borderRadius: 999,
            background: "#eef2f7",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${p}%`,
              height: "100%",
              borderRadius: 999,
              background: tone.fill,
              transition: "width 200ms ease",
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default function TeacherPage() {
  const locale = useLocale();
  const { user, loading } = useUserProfile();
  const { usage, loading: usageLoading } = useUsage(user?.uid);

  const [studentsUsed, setStudentsUsed] = useState(0);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentItems, setStudentItems] = useState<TeacherStudentOverviewItem[]>([]);
  const [studentItemsLoading, setStudentItemsLoading] = useState(true);
  const [studentSearch, setStudentSearch] = useState("");
  const [busyStudentUid, setBusyStudentUid] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [studentsOpen, setStudentsOpen] = useState(false);

  const isAnon = Boolean(user?.isAnonymous);

  const roleValue = (user as { role?: string } | null)?.role;
  const planValue = (user as { plan?: string } | null)?.plan;

  const role = safeRole(roleValue);
  const plan = safePlan(planValue);

  async function reloadStudents(currentUid?: string) {
    if (!currentUid || !db) {
      setStudentsUsed(0);
      setStudentItems([]);
      setStudentsLoading(false);
      setStudentItemsLoading(false);
      return;
    }

    try {
      setStudentsLoading(true);
      setStudentItemsLoading(true);

      const [count, items] = await Promise.all([
        getTeacherStudentCount(db, currentUid),
        getTeacherStudentsOverview(db, currentUid),
      ]);

      setStudentsUsed(count);
      setStudentItems(items);
    } catch (error) {
      console.error("Failed to load teacher students", error);
      setStudentsUsed(0);
      setStudentItems([]);
    } finally {
      setStudentsLoading(false);
      setStudentItemsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadStudents() {
      if (!user?.uid || !db) {
        if (!cancelled) {
          setStudentsUsed(0);
          setStudentItems([]);
          setStudentsLoading(false);
          setStudentItemsLoading(false);
        }
        return;
      }

      try {
        setStudentsLoading(true);
        setStudentItemsLoading(true);

        const [count, items] = await Promise.all([
          getTeacherStudentCount(db, user.uid),
          getTeacherStudentsOverview(db, user.uid),
        ]);

        if (!cancelled) {
          setStudentsUsed(count);
          setStudentItems(items);
        }
      } catch (error) {
        console.error("Failed to load teacher students", error);
        if (!cancelled) {
          setStudentsUsed(0);
          setStudentItems([]);
        }
      } finally {
        if (!cancelled) {
          setStudentsLoading(false);
          setStudentItemsLoading(false);
        }
      }
    }

    loadStudents();

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return studentItems;

    return studentItems.filter((item) => {
      const name = item.displayName.toLowerCase();
      const spaces = item.spaces.map((space) => space.title.toLowerCase()).join(" ");
      return name.includes(q) || spaces.includes(q);
    });
  }, [studentItems, studentSearch]);

  async function handleArchiveStudent(student: TeacherStudentOverviewItem) {
    if (!user?.uid || !db) return;

    const ok = window.confirm(
      `Set ${student.displayName} to inactive in all your spaces?`
    );
    if (!ok) return;

    setBusyStudentUid(student.uid);
    setActionError(null);

    try {
      await archiveStudentFromTeacherSpaces({
        db,
        teacherUid: user.uid,
        studentUid: student.uid,
      });

      await reloadStudents(user.uid);
    } catch (error) {
      console.error("Failed to archive student", error);
      setActionError("Could not set this student to inactive.");
    } finally {
      setBusyStudentUid(null);
    }
  }

  async function handleRemoveStudent(student: TeacherStudentOverviewItem) {
    if (!user?.uid || !db) return;

    const ok = window.confirm(
      `Remove ${student.displayName} from all your spaces? This cannot be undone.`
    );
    if (!ok) return;

    setBusyStudentUid(student.uid);
    setActionError(null);

    try {
      await removeStudentFromTeacherSpaces({
        db,
        teacherUid: user.uid,
        studentUid: student.uid,
      });

      await reloadStudents(user.uid);
    } catch (error) {
      console.error("Failed to remove student", error);
      setActionError("Could not remove this student.");
    } finally {
      setBusyStudentUid(null);
    }
  }

  if (loading || usageLoading || studentsLoading || studentItemsLoading) return null;

  const generatorsUsed = usage["premium_generators"] ?? 0;
  const generatorsLimit = getBucketLimit(role, plan, "premium_generators");

  const imagesUsed = usage["image_generation"] ?? 0;
  const imagesLimit = getBucketLimit(role, plan, "image_generation");

  const feedbackUsed = usage["ai_feedback"] ?? 0;
  const feedbackLimit = getBucketLimit(role, plan, "ai_feedback");

  const studentsLimit = getBucketLimit(role, plan, "members");
  const studentsPercent = percent(studentsUsed, studentsLimit);
  const studentsTone = getProgressTone(studentsUsed, studentsLimit);

  return (
    <main style={{ maxWidth: 980, margin: "10px auto", padding: 10 }}>
      <DashboardIntro userIsAnon={isAnon} />

      <section
        style={{
          marginTop: 20,
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
        }}
      >
        <StatCard title="Students" used={studentsUsed} limit={studentsLimit} accent="blue" />
        <StatCard
          title="Premium generators"
          used={generatorsUsed}
          limit={generatorsLimit}
          accent="violet"
        />
        <StatCard
          title="Image generation"
          used={imagesUsed}
          limit={imagesLimit}
          accent="emerald"
        />
        <StatCard
          title="AI feedback"
          used={feedbackUsed}
          limit={feedbackLimit}
          accent="slate"
        />
      </section>

      <section
        style={{
          marginTop: 24,
          border: "1px solid #dbeafe",
          borderRadius: 22,
          background:
            "linear-gradient(180deg, rgba(239,246,255,0.9) 0%, rgba(255,255,255,1) 120px)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: 18 }}>
          <div
            style={{
              display: "flex",
              gap: 14,
              flexWrap: "wrap",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  border: "1px solid #bfdbfe",
                  background: "#eff6ff",
                  color: "#1d4ed8",
                  borderRadius: 999,
                  padding: "6px 10px",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                Student overview
              </div>

              <h2
                style={{
                  margin: "10px 0 0",
                  fontSize: 24,
                  fontWeight: 800,
                  color: "#0f172a",
                }}
              >
                My students
              </h2>

              <p
                style={{
                  margin: "8px 0 0",
                  fontSize: 14,
                  color: "#475569",
                  maxWidth: 720,
                  lineHeight: 1.5,
                }}
              >
                Total unique students across your spaces. A student can be in several spaces,
                but only counts once here. You can search, review and manage them from this panel.
              </p>
            </div>

            <div
              style={{
                minWidth: 220,
                border: "1px solid #bfdbfe",
                background: "#ffffff",
                borderRadius: 18,
                padding: 14,
                boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "end",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1, color: "#111827" }}>
                  {studentsUsed}
                  <span style={{ fontSize: 16, fontWeight: 700, color: "#64748b", marginLeft: 6 }}>
                    / {studentsLimit}
                  </span>
                </div>

                <span
                  style={{
                    borderRadius: 999,
                    padding: "5px 9px",
                    fontSize: 12,
                    fontWeight: 700,
                    background: studentsTone.badgeBg,
                    color: studentsTone.badgeColor,
                    border: `1px solid ${studentsTone.badgeBorder}`,
                  }}
                >
                  {getStatusText(studentsUsed, studentsLimit)}
                </span>
              </div>

              <div
                style={{
                  marginTop: 12,
                  height: 10,
                  borderRadius: 999,
                  overflow: "hidden",
                  background: "#dbeafe",
                }}
              >
                <div
                  style={{
                    width: `${studentsPercent}%`,
                    height: "100%",
                    background: studentsTone.fill,
                    borderRadius: 999,
                    transition: "width 200ms ease",
                  }}
                />
              </div>

              <div style={{ marginTop: 10, fontSize: 12, color: "#64748b" }}>
                {studentsPercent}% of your student capacity is in use
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: 18,
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <button
              type="button"
              onClick={() => setStudentsOpen((prev) => !prev)}
              style={{
                border: "1px solid #93c5fd",
                background: studentsOpen ? "#2563eb" : "#ffffff",
                color: studentsOpen ? "#ffffff" : "#1d4ed8",
                borderRadius: 12,
                padding: "10px 14px",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
              }}
            >
              {studentsOpen ? "Hide students" : "Show students"}
            </button>

            <div style={{ fontSize: 13, color: "#64748b" }}>
              {filteredStudents.length} shown · {studentItems.length} total
            </div>
          </div>

          {studentsOpen && (
            <div
              style={{
                marginTop: 16,
                border: "1px solid #dbeafe",
                borderRadius: 18,
                background: "#ffffff",
                padding: 14,
              }}
            >
              <div>
                <label
                  htmlFor="student-search"
                  style={{ display: "block", fontSize: 14, fontWeight: 700, marginBottom: 8 }}
                >
                  Search students
                </label>

                <input
                  id="student-search"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Search by name or space"
                  style={{
                    width: "100%",
                    border: "1px solid #d1d5db",
                    borderRadius: 12,
                    padding: "10px 12px",
                    fontSize: 14,
                    outline: "none",
                    background: "#ffffff",
                  }}
                />
              </div>

              {actionError && (
                <div
                  style={{
                    marginTop: 14,
                    border: "1px solid #fecaca",
                    background: "#fef2f2",
                    color: "#b91c1c",
                    borderRadius: 12,
                    padding: "10px 12px",
                    fontSize: 14,
                  }}
                >
                  {actionError}
                </div>
              )}

              <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
                {filteredStudents.length === 0 ? (
                  <div
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 14,
                      padding: 16,
                      background: "#f8fafc",
                      color: "#64748b",
                      fontSize: 14,
                    }}
                  >
                    No students found.
                  </div>
                ) : (
                  filteredStudents.map((student) => {
                    const isBusy = busyStudentUid === student.uid;

                    return (
                      <div
                        key={student.uid}
                        style={{
                          border: "1px solid #e5e7eb",
                          borderRadius: 16,
                          padding: 14,
                          background: "#ffffff",
                          boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            gap: 12,
                            flexWrap: "wrap",
                            alignItems: "center",
                            justifyContent: "space-between",
                          }}
                        >
                          <div style={{ minWidth: 0, flex: "1 1 420px" }}>
                            <div
                              style={{
                                display: "flex",
                                gap: 8,
                                flexWrap: "wrap",
                                alignItems: "center",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 16,
                                  fontWeight: 800,
                                  color: "#111827",
                                  wordBreak: "break-word",
                                }}
                              >
                                {student.displayName}
                              </div>

                              <span
                                style={{
                                  borderRadius: 999,
                                  padding: "4px 8px",
                                  fontSize: 12,
                                  fontWeight: 700,
                                  background: student.isAnon ? "#fff7ed" : "#ecfdf5",
                                  color: student.isAnon ? "#c2410c" : "#047857",
                                  border: `1px solid ${student.isAnon ? "#fdba74" : "#a7f3d0"}`,
                                }}
                              >
                                {student.isAnon ? "Anonymous" : "Registered"}
                              </span>

                              <span
                                style={{
                                  borderRadius: 999,
                                  padding: "4px 8px",
                                  fontSize: 12,
                                  fontWeight: 700,
                                  background: "#f1f5f9",
                                  color: "#334155",
                                  border: "1px solid #cbd5e1",
                                }}
                              >
                                {student.spaces.length} {student.spaces.length === 1 ? "space" : "spaces"}
                              </span>
                            </div>

                            <div
                              style={{
                                marginTop: 8,
                                fontSize: 13,
                                color: "#64748b",
                                wordBreak: "break-word",
                              }}
                            >
                              UID: {student.uid}
                            </div>
                          </div>

                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            <button
                              type="button"
                              onClick={() => handleArchiveStudent(student)}
                              disabled={isBusy}
                              style={{
                                border: "1px solid #cbd5e1",
                                background: "#f8fafc",
                                color: "#334155",
                                borderRadius: 10,
                                padding: "8px 12px",
                                fontSize: 13,
                                fontWeight: 700,
                                cursor: isBusy ? "not-allowed" : "pointer",
                                opacity: isBusy ? 0.6 : 1,
                              }}
                            >
                              {isBusy ? "Working..." : "Set inactive"}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleRemoveStudent(student)}
                              disabled={isBusy}
                              style={{
                                border: "1px solid #fecaca",
                                background: "#fef2f2",
                                color: "#b91c1c",
                                borderRadius: 10,
                                padding: "8px 12px",
                                fontSize: 13,
                                fontWeight: 700,
                                cursor: isBusy ? "not-allowed" : "pointer",
                                opacity: isBusy ? 0.6 : 1,
                              }}
                            >
                              {isBusy ? "Working..." : "Remove"}
                            </button>
                          </div>
                        </div>

                        <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {student.spaces.map((space) => (
                            <Link
                              key={`${student.uid}_${space.spaceId}`}
                              href={withLocale(locale, `/teacher/spaces/${space.spaceId}/members`)}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                border: "1px solid #d1d5db",
                                borderRadius: 999,
                                padding: "8px 10px",
                                fontSize: 13,
                                fontWeight: 700,
                                color: "#111827",
                                textDecoration: "none",
                                background: "#ffffff",
                              }}
                            >
                              {space.title}
                            </Link>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}