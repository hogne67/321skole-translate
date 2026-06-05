"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type InstallPromptWindow = Window & {
  __childInstallPrompt?: BeforeInstallPromptEvent;
};

function isStandalone() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

function isIosSafari() {
  const userAgent = navigator.userAgent;
  const isIos =
    /iPad|iPhone|iPod/.test(userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(userAgent);

  return isIos && isSafari;
}

export default function InstallAppButton() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [isPrompting, setIsPrompting] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }

    const installWindow = window as InstallPromptWindow;
    setInstallPrompt(installWindow.__childInstallPrompt ?? null);
    setShowIosHelp(isIosSafari());

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setResultMessage(null);
    };

    const onAppInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  async function handleInstall() {
    if (!installPrompt || isPrompting) return;

    setIsPrompting(true);

    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;

      setInstallPrompt(null);
      (window as InstallPromptWindow).__childInstallPrompt = undefined;

      if (choice.outcome === "accepted") {
        setInstalled(true);
        return;
      }

      setResultMessage("Installasjonen ble avbrutt.");
    } catch {
      setResultMessage("Kunne ikke åpne installasjonen. Prøv igjen senere.");
    } finally {
      setIsPrompting(false);
    }
  }

  if (installed || (!installPrompt && !showIosHelp && !resultMessage)) return null;

  return (
    <Card className="mt-5 flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-extrabold text-slate-900">Ha 321skole lett tilgjengelig</div>
        {showIosHelp ? (
          <p className="mt-1 text-sm text-slate-600">
            Trykk Del-knappen og velg Legg til på Hjem-skjerm.
          </p>
        ) : null}
        {resultMessage ? <p className="mt-1 text-sm text-slate-600">{resultMessage}</p> : null}
      </div>

      {installPrompt ? (
        <Button type="button" variant="primary" onClick={handleInstall} disabled={isPrompting}>
          Legg til på startskjerm
        </Button>
      ) : null}
    </Card>
  );
}
