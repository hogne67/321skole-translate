// components/DashboardIntro.tsx
"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { useUserProfile } from "@/lib/useUserProfile";

type Props = {
  userIsAnon: boolean;

  helloAnon: string;
  helloUser: string;
  guestLabel: string;
  loggedInLabel: string;
  youAre: string;
  youAreAnon?: string;
  activity: string;
  recommendRegister: string;
  remainingLabel: string;

  roleLabelStudent: string;
  roleLabelTeacher: string;
  roleLabelParent: string;
  roleFallback: string;

  planFree: string;
  planBasic: string;
  planPlus: string;
  planPro: string;

  actionSeePlans: string;
  actionRegisterLogin: string;
  actionOpenLibrary: string;
};

type Role = "student" | "teacher" | "parent";

function safeRole(role: unknown): Role {
  if (role === "teacher") return "teacher";
  if (role === "parent") return "parent";
  return "student";
}

function readStringField(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== "object") return null;
  const rec = obj as Record<string, unknown>;
  const v = rec[key];
  return typeof v === "string" ? v : null;
}

function withLocale(locale: string, href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  if (!href.startsWith("/")) return href;

  const seg = href.split("/")[1];
  if (seg === "en" || seg === "no" || seg === "nb" || seg === "pt") return href;

  if (href === "/") return `/${locale}`;
  return `/${locale}${href}`;
}

function interpolate(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}

function renderSimpleRichText(
  template: string,
  values: Record<string, string | number>
): React.ReactNode {
  const withValues = interpolate(template, values);
  const parts = withValues.split(/(<b>|<\/b>)/g);

  const nodes: React.ReactNode[] = [];
  let bold = false;
  let key = 0;

  for (const part of parts) {
    if (part === "<b>") {
      bold = true;
      continue;
    }

    if (part === "</b>") {
      bold = false;
      continue;
    }

    if (!part) continue;

    nodes.push(
      bold ? <b key={key++}>{part}</b> : <span key={key++}>{part}</span>
    );
  }

  return nodes;
}

function getRoleLabel(role: Role, props: Props) {
  if (role === "teacher") return props.roleLabelTeacher;
  if (role === "parent") return props.roleLabelParent;
  return props.roleLabelStudent;
}

export function DashboardIntro(props: Props) {
  const locale = useLocale();
  const { profile } = useUserProfile();

  const name = (readStringField(profile, "displayName") ?? "").trim();

  const role: Role = props.userIsAnon
    ? "student"
    : safeRole(readStringField(profile, "role"));

  const roleLabel = getRoleLabel(role, props) || props.roleFallback;

  const helloText =
    props.userIsAnon || !name
      ? props.helloAnon
      : interpolate(props.helloUser, { name });

  const youAreNode = props.userIsAnon
    ? renderSimpleRichText(props.youAreAnon || props.youAre, {
      state: props.guestLabel,
      role: props.guestLabel,
    })
    : renderSimpleRichText(props.youAre, {
      state: props.loggedInLabel,
      role: roleLabel,
    });

  const activityNode = renderSimpleRichText(props.activity, {});

  return (
    <section
      style={{
        padding: "14px 12px",
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 14,
        background: "rgba(0,0,0,0.02)",
        marginBottom: 14,
      }}
    >
      <h2 style={{ margin: 0, fontSize: 18 }}>{helloText}</h2>

      <p
        style={{
          margin: "8px 0 0",
          opacity: 0.8,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span>{youAreNode}</span>
      </p>

      <p style={{ margin: "8px 0 0", opacity: 0.8 }}>{activityNode}</p>

      {props.userIsAnon ? (
        <div style={{ marginTop: 10 }}>
          <p style={{ margin: 0, opacity: 0.85 }}>{props.recommendRegister}</p>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              marginTop: 10,
            }}
          >
            <Link
              href={withLocale(locale, "/join")}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.15)",
                textDecoration: "none",
              }}
            >
              {props.actionRegisterLogin}
            </Link>

            <Link
              href={withLocale(locale, "/321lessons")}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.15)",
                textDecoration: "none",
              }}
            >
              {props.actionOpenLibrary}
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}
