// app/[locale]/(app)/student/spaces/[spaceId]/board/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import { db, auth } from "@/lib/firebase";
import { doc, onSnapshot, setDoc, serverTimestamp, type Firestore } from "firebase/firestore";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useUserProfile } from "@/lib/useUserProfile";
import { useTranslations } from "next-intl";

function requireDb(x: Firestore | null | undefined): Firestore {
  if (!x) throw new Error("Firestore is not initialized (db is null).");
  return x;
}

type BoardState = {
  active?: boolean;
  sessionId?: string;
  mode?: string;
  endsAt?: number | null;
  clearedAt?: number | null;
  data?: { title?: string; prompt?: string };
};

type UserProfileLike = {
  displayName?: string | null;
};

function safeString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export default function StudentBoardPage() {
  const t = useTranslations("student.board");

  const params = useParams<{ spaceId: string }>();
  const spaceId = params?.spaceId;

  const [user, setUser] = useState<User | null>(null);
  const profile = useUserProfile() as UserProfileLike | null;

  const [state, setState] = useState<BoardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [groupName, setGroupName] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("boardGroupName") ?? "";
  });

  const [text, setText] = useState("");
  const [sent, setSent] = useState<string | null>(null);

  const dbx = useMemo(() => requireDb(db), []);
  const stateRef = useMemo(
    () => (spaceId ? doc(dbx, "spaces", spaceId, "board", "state") : null),
    [dbx, spaceId]
  );

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!stateRef) return;

    setLoading(true);
    const unsub = onSnapshot(
      stateRef,
      (snap) => {
        const data = (snap.data() as BoardState | undefined) ?? null;
        setState(data);
        setErr(null);
        setLoading(false);
      },
      (e) => {
        setErr(e?.message ?? t("errors.fetchBoardFailed"));
        setLoading(false);
      }
    );

    return () => unsub();
  }, [stateRef, t]);

  // lagre gruppenavn lokalt
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("boardGroupName", groupName);
    }
  }, [groupName]);

  const active = state?.active === true;
  const sessionId = safeString(state?.sessionId);
  const uid = user?.uid ?? null;

  // Når lærer starter ny runde (ny sessionId): nullstill UI
  useEffect(() => {
    setSent(null);
    setText("");
  }, [sessionId]);

  async function send() {
    if (!spaceId || !sessionId || !uid) return;

    const displayName =
      safeString(profile?.displayName) ||
      safeString(user?.displayName) ||
      safeString(groupName) ||
      t("fallbackStudentName");

    const responseId = `${sessionId}_${uid}`;
    const ref = doc(dbx, "spaces", spaceId, "boardResponses", responseId);

    await setDoc(
      ref,
      {
        sessionId,
        uid,
        displayName,
        groupName: safeString(groupName),
        text: safeString(text) ?? "",
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );

    setSent(t("sent"));
    setText("");
  }

  const title = safeString(state?.data?.title) ?? t("fallbackQuestionTitle");
  const prompt = safeString(state?.data?.prompt) ?? "";

  return (
    <AuthGate>
      <div className="mx-auto max-w-3xl p-4">
        <div className="mb-3">
          <h1 className="text-xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>

        {err && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {err}
          </div>
        )}

        <div className="rounded-xl border bg-background p-4 shadow-sm">
          {loading ? (
            <div className="text-sm text-muted-foreground">{t("loading")}</div>
          ) : !active ? (
            <div className="text-sm text-muted-foreground">{t("inactive")}</div>
          ) : (
            <>
              <div className="text-base font-semibold">{title}</div>
              <div className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{prompt}</div>

              <Countdown endsAt={state?.endsAt} />

              <div className="mt-4 grid gap-2">
                <label className="text-sm font-medium">{t("groupName.label")}</label>
                <input
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  placeholder={t("groupName.placeholder")}
                />
              </div>

              <div className="mt-3">
                <label className="mb-1 block text-sm font-medium">{t("answer.label")}</label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="min-h-[110px] w-full rounded-lg border px-3 py-2 text-sm"
                  placeholder={t("answer.placeholder")}
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="text-sm text-muted-foreground">{sent ?? ""}</div>
                  <button
                    onClick={send}
                    disabled={!uid || !sessionId || !safeString(text)}
                    className="rounded-lg bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {t("answer.send")}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </AuthGate>
  );
}

function Countdown({ endsAt }: { endsAt: unknown }) {
  const t = useTranslations("student.board.countdown");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tmr = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(tmr);
  }, []);

  const endsAtMs = typeof endsAt === "number" ? endsAt : null;
  if (!endsAtMs) return null;

  const remaining = Math.max(0, endsAtMs - now);
  const seconds = Math.ceil(remaining / 1000);

  return (
    <div className="mt-3 flex items-center justify-between rounded-lg bg-muted px-3 py-2">
      <div className="text-sm font-medium">{t("label")}</div>
      <div className="text-sm tabular-nums">{t("seconds", { seconds })}</div>
    </div>
  );
}