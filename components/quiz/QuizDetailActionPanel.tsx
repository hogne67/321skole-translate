"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getAuth, onAuthStateChanged, type User } from "firebase/auth";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

type QuizDetailActionPanelProps = {
  locale: string;
  quizId: string;
};

const COPY = {
  nb: {
    title: "Bruk denne quizen",
    text: "Legg quizen til i Mitt innhold for å starte, redigere eller sende den til tavla.",
    add: "Legg til i Mitt innhold",
    adding: "Legger til...",
    added: "Lagt til",
    retry: "Prøv igjen",
    openContent: "Åpne Mitt innhold",
    create: "Lag egen quiz",
  },
  en: {
    title: "Use this quiz",
    text: "Add the quiz to My content to start, edit, or send it to the board.",
    add: "Add to My content",
    adding: "Adding...",
    added: "Added",
    retry: "Try again",
    openContent: "Open My content",
    create: "Create quiz",
  },
  pt: {
    title: "Usar este quiz",
    text: "Adicione o quiz ao Meu conteudo para iniciar, editar ou enviar ao quadro.",
    add: "Adicionar ao Meu conteudo",
    adding: "Adicionando...",
    added: "Adicionado",
    retry: "Tentar novamente",
    openContent: "Abrir Meu conteudo",
    create: "Criar quiz",
  },
};

function copyForLocale(locale: string) {
  if (locale.startsWith("en")) return COPY.en;
  if (locale.startsWith("pt")) return COPY.pt;
  return COPY.nb;
}

export default function QuizDetailActionPanel({ locale, quizId }: QuizDetailActionPanelProps) {
  const router = useRouter();
  const copy = copyForLocale(locale);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const [buttonLabel, setButtonLabel] = useState(copy.add);

  useEffect(() => {
    const auth = getAuth();
    return onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthReady(true);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function checkAlreadyAdded() {
      if (!currentUser?.uid || currentUser.isAnonymous) {
        if (!cancelled) {
          setAdded(false);
          setButtonLabel(copy.add);
        }
        return;
      }

      try {
        const qy = query(
          collection(db, "lessons"),
          where("ownerId", "==", currentUser.uid),
          where("sourcePublishedQuizId", "==", quizId),
          limit(1)
        );
        const snap = await getDocs(qy);

        if (!cancelled && !snap.empty) {
          setAdded(true);
          setButtonLabel(copy.added);
        }
      } catch {
        // The server import still handles duplicates if this lookup is unavailable.
      }
    }

    void checkAlreadyAdded();

    return () => {
      cancelled = true;
    };
  }, [copy.add, copy.added, currentUser, quizId]);

  async function addToMyContent() {
    if (!authReady) return;

    if (!currentUser) {
      router.push(`/${locale}/login?next=${encodeURIComponent(`/${locale}/321quiz/${quizId}`)}`);
      return;
    }

    setBusy(true);
    setButtonLabel(copy.adding);

    try {
      const token = await currentUser.getIdToken();
      const res = await fetch("/api/producer/import-published-quiz", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ publishedId: quizId }),
      });

      const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!res.ok || !data.ok) throw new Error("Import failed");

      setAdded(true);
      setButtonLabel(copy.added);
    } catch {
      setButtonLabel(copy.retry);
      window.setTimeout(() => setButtonLabel(copy.add), 1600);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="quizDetailActionPanel" aria-label={copy.title}>
      <div className="quizDetailActionInner">
        <div className="quizDetailActionText">
          <strong>{copy.title}</strong>
          <span>{copy.text}</span>
        </div>

        <div className="quizDetailActionButtons">
          {added ? (
            <Link href={`/${locale}/content`} className="quizDetailSecondaryButton">
              {copy.openContent}
            </Link>
          ) : null}

          <button
            type="button"
            className="quizDetailPrimaryButton"
            onClick={addToMyContent}
            disabled={busy || !authReady || added}
          >
            {buttonLabel}
          </button>

          <Link href={`/${locale}/tools/quiz`} className="quizDetailSecondaryButton">
            {copy.create}
          </Link>
        </div>
      </div>

      <style jsx global>{`
        .quizDetailActionPanel {
          position: fixed;
          right: 0;
          bottom: 0;
          left: 0;
          z-index: 40;
          border-top: 1px solid #d8e2dc;
          background: rgba(247, 251, 248, 0.96);
          box-shadow: 0 -14px 32px rgba(15, 23, 42, 0.12);
          backdrop-filter: blur(12px);
          padding: 10px 14px;
        }

        .quizDetailActionInner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          width: 100%;
          max-width: 1120px;
          margin: 0 auto;
        }

        .quizDetailActionText {
          display: grid;
          gap: 2px;
          min-width: 0;
          color: #334155;
          line-height: 1.35;
        }

        .quizDetailActionText strong {
          color: #0f172a;
          font-size: 15px;
          font-weight: 900;
        }

        .quizDetailActionText span {
          font-size: 13px;
          font-weight: 650;
        }

        .quizDetailActionButtons {
          display: flex;
          flex: 0 0 auto;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 8px;
        }

        .quizDetailPrimaryButton,
        .quizDetailSecondaryButton {
          display: inline-flex;
          min-height: 38px;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          padding: 8px 12px;
          font-size: 13px;
          font-weight: 900;
          line-height: 1.2;
          text-decoration: none;
          white-space: nowrap;
        }

        .quizDetailPrimaryButton {
          border: 1px solid #22c55e;
          background: #bbf7d0;
          color: #052e16;
          cursor: pointer;
        }

        .quizDetailPrimaryButton:hover:not(:disabled) {
          background: #86efac;
        }

        .quizDetailPrimaryButton:disabled {
          opacity: 0.6;
          cursor: default;
        }

        .quizDetailSecondaryButton {
          border: 1px solid #cbd5e1;
          background: #ffffff;
          color: #0f172a;
        }

        .quizDetailSecondaryButton:hover {
          background: #f8fafc;
        }

        @media (max-width: 720px) {
          .quizDetailActionPanel {
            padding: 10px;
          }

          .quizDetailActionInner {
            align-items: stretch;
            flex-direction: column;
            gap: 10px;
          }

          .quizDetailActionButtons {
            display: grid;
            grid-template-columns: 1fr 1fr;
          }

          .quizDetailPrimaryButton {
            grid-column: 1 / -1;
          }
        }
      `}</style>
    </aside>
  );
}
