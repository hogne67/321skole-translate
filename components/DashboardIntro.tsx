// components/DashboardIntro.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { useUserProfile } from "@/lib/useUserProfile";
import { auth } from "@/lib/firebase";
import { authedPost } from "@/lib/authedPost";
import { getStudentAccessMode } from "@/lib/studentAccessMode";

type Props = {
  userIsAnon: boolean;
  guestRole?: Role;

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
  actionRegisterHref?: string;
  actionOpenLibrary: string;
  rightSlot?: React.ReactNode;
};

type Role = "student" | "teacher" | "parent";
type RequestedRole = Role | "student_self_study";

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

function roleRequestCopy(locale: string) {
  if (locale === "nb" || locale === "no") {
    return {
      open: "Endre rolle",
      intro: "Send en kort forespørsel, så hjelper vi deg å bytte rolle uten at innhold eller abonnement blir feil.",
      selectLabel: "Jeg vil bytte til",
      selfStudyRole: "Selvstuderende elev",
      noteLabel: "Kort beskjed",
      notePlaceholder: "Skriv gjerne hvorfor du vil bytte rolle.",
      send: "Send forespørsel",
      sending: "Sender...",
      cancel: "Avbryt",
      success: "Forespørselen er sendt. Vi følger den opp manuelt.",
      selfStudySuccess: "Egenstudie er åpnet for kontoen din.",
      error: "Kunne ikke sende forespørselen akkurat nå.",
    };
  }

  if (locale === "pt") {
    return {
      open: "Alterar perfil",
      intro: "Envie uma solicitação curta, e ajudaremos a mudar o perfil sem afetar conteúdo ou assinatura.",
      selectLabel: "Quero mudar para",
      selfStudyRole: "Aluno em estudo individual",
      noteLabel: "Mensagem curta",
      notePlaceholder: "Conte brevemente por que deseja mudar de perfil.",
      send: "Enviar solicitação",
      sending: "Enviando...",
      cancel: "Cancelar",
      success: "Solicitação enviada. Vamos acompanhar manualmente.",
      selfStudySuccess: "O estudo individual foi ativado para sua conta.",
      error: "Não foi possível enviar a solicitação agora.",
    };
  }

  return {
    open: "Change role",
    intro: "Send a short request and we will help change your role without breaking content or subscriptions.",
    selectLabel: "I want to change to",
    selfStudyRole: "Self-study student",
    noteLabel: "Short message",
    notePlaceholder: "Briefly tell us why you want to change role.",
    send: "Send request",
    sending: "Sending...",
    cancel: "Cancel",
    success: "Request sent. We will follow it up manually.",
    selfStudySuccess: "Self study is now open for your account.",
    error: "Could not send the request right now.",
  };
}

export function DashboardIntro(props: Props) {
  const locale = useLocale();
  const { profile } = useUserProfile();
  const [roleRequestOpen, setRoleRequestOpen] = useState(false);
  const [requestedRole, setRequestedRole] = useState<RequestedRole>("teacher");
  const [requestNote, setRequestNote] = useState("");
  const [requestStatus, setRequestStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const name = (readStringField(profile, "displayName") ?? "").trim();

  const role: Role = props.userIsAnon
    ? props.guestRole ?? "student"
    : safeRole(readStringField(profile, "role"));

  const roleLabel = getRoleLabel(role, props) || props.roleFallback;
  const studentAccessMode = getStudentAccessMode(profile, {
    isAnonymous: props.userIsAnon,
  });
  const copy = useMemo(() => roleRequestCopy(locale), [locale]);
  const roleOptions = useMemo(
    () => {
      const base = (["student", "teacher", "parent"] as Role[])
        .filter((option) => option !== role)
        .map((value) => ({ value: value as RequestedRole, label: getRoleLabel(value, props) || value }));

      if (role === "student" && studentAccessMode !== "self_study") {
        return [{ value: "student_self_study" as const, label: copy.selfStudyRole }, ...base];
      }

      return base;
    },
    [copy.selfStudyRole, props, role, studentAccessMode]
  );

  const helloText =
    props.userIsAnon || !name
      ? props.helloAnon
      : interpolate(props.helloUser, { name });

  const youAreNode = props.userIsAnon
    ? renderSimpleRichText(props.youAreAnon || props.youAre, {
      state: props.guestLabel,
      role: roleLabel,
    })
    : renderSimpleRichText(props.youAre, {
      state: props.loggedInLabel,
      role: roleLabel,
    });

  const activityNode = props.activity.trim()
    ? renderSimpleRichText(props.activity, {})
    : null;

  async function sendRoleRequest() {
    const user = auth.currentUser;
    if (!user) return;

    setRequestStatus("sending");

    try {
      if (requestedRole === "student_self_study") {
        await authedPost("/api/student/access-mode", {
          studentAccessMode: "self_study",
        });
        setRequestStatus("sent");
        setRequestNote("");
        window.location.reload();
        return;
      }

      const token = await user.getIdToken();
      const targetLabel = getRoleLabel(requestedRole, props) || requestedRole;
      const currentLabel = roleLabel || role;
      const note = requestNote.trim();
      const message = [
        `Role change request`,
        `Current role: ${currentLabel} (${role})`,
        `Requested role: ${targetLabel} (${requestedRole})`,
        note ? `Message: ${note}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const response = await fetch("/api/support-tickets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          category: "other",
          message,
          locale,
          page: typeof window !== "undefined" ? window.location.pathname : "",
        }),
      });

      if (!response.ok) throw new Error("role_request_failed");

      setRequestStatus("sent");
      setRequestNote("");
    } catch {
      setRequestStatus("error");
    }
  }

  return (
    <section
      style={{
        padding: "clamp(10px, 3vw, 14px) clamp(10px, 3.2vw, 12px)",
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 12,
        background: "rgba(0,0,0,0.02)",
        marginBottom: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0, flex: "1 1 320px" }}>
          <h2 style={{ margin: 0, fontSize: "clamp(17px, 5vw, 18px)", lineHeight: 1.18 }}>{helloText}</h2>

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
            {!props.userIsAnon ? (
              <button
                type="button"
                onClick={() => {
                  setRoleRequestOpen((open) => !open);
                  setRequestStatus("idle");
                  const firstOtherRole = (["student", "teacher", "parent"] as Role[]).find(
                    (option) => option !== role
                  );
                  if (role === "student" && studentAccessMode !== "self_study") {
                    setRequestedRole("student_self_study");
                  } else if (firstOtherRole) {
                    setRequestedRole(firstOtherRole);
                  }
                }}
                style={{
                  border: "1px solid rgba(37,99,235,0.22)",
                  borderRadius: 999,
                  background: "rgba(37,99,235,0.06)",
                  color: "#1d4ed8",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 800,
                  padding: "4px 8px",
                }}
              >
                {copy.open}
              </button>
            ) : null}
          </p>

          {activityNode ? (
            <p style={{ margin: "8px 0 0", opacity: 0.8, lineHeight: 1.45 }}>{activityNode}</p>
          ) : null}
        </div>

        {props.rightSlot ? (
          <div style={{ flex: "0 1 340px", display: "flex", justifyContent: "flex-end" }}>
            {props.rightSlot}
          </div>
        ) : null}
      </div>

      {!props.userIsAnon && roleRequestOpen ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(37,99,235,0.16)",
            background: "rgba(255,255,255,0.72)",
            display: "grid",
            gap: 10,
          }}
        >
          <p style={{ margin: 0, color: "#475569", fontSize: 13, lineHeight: 1.45 }}>
            {copy.intro}
          </p>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              alignItems: "end",
            }}
          >
            <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 800, flex: "0 1 220px" }}>
              {copy.selectLabel}
              <select
                value={requestedRole}
                onChange={(event) => setRequestedRole(event.target.value as RequestedRole)}
                style={{
                  minHeight: 38,
                  borderRadius: 10,
                  border: "1px solid rgba(15,23,42,0.16)",
                  padding: "8px 10px",
                  background: "white",
                }}
              >
                {roleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 800, flex: "1 1 260px" }}>
              {copy.noteLabel}
              <input
                value={requestNote}
                onChange={(event) => setRequestNote(event.target.value)}
                placeholder={copy.notePlaceholder}
                style={{
                  minHeight: 38,
                  borderRadius: 10,
                  border: "1px solid rgba(15,23,42,0.16)",
                  padding: "8px 10px",
                  background: "white",
                }}
              />
            </label>

            <button
              type="button"
              onClick={sendRoleRequest}
              disabled={requestStatus === "sending"}
              style={{
                minHeight: 38,
                border: 0,
                borderRadius: 10,
                background: "#0f766e",
                color: "white",
                cursor: requestStatus === "sending" ? "not-allowed" : "pointer",
                fontWeight: 900,
                padding: "8px 12px",
                opacity: requestStatus === "sending" ? 0.7 : 1,
              }}
            >
              {requestStatus === "sending" ? copy.sending : copy.send}
            </button>

            <button
              type="button"
              onClick={() => setRoleRequestOpen(false)}
              style={{
                minHeight: 38,
                borderRadius: 10,
                border: "1px solid rgba(15,23,42,0.14)",
                background: "white",
                cursor: "pointer",
                fontWeight: 800,
                padding: "8px 12px",
              }}
            >
              {copy.cancel}
            </button>
          </div>

          {requestStatus === "sent" ? (
            <p style={{ margin: 0, color: "#0f766e", fontSize: 13, fontWeight: 800 }}>
              {requestedRole === "student_self_study" ? copy.selfStudySuccess : copy.success}
            </p>
          ) : null}

          {requestStatus === "error" ? (
            <p style={{ margin: 0, color: "#b91c1c", fontSize: 13, fontWeight: 800 }}>
              {copy.error}
            </p>
          ) : null}
        </div>
      ) : null}

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
              href={withLocale(locale, props.actionRegisterHref ?? "/join")}
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
