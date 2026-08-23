"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

/**
 * Registra o service worker e exibe um convite discreto para instalar o app
 * na tela inicial (Android/desktop). No iOS o navegador não dispara o evento,
 * então mostramos uma dica de "Compartilhar → Adicionar à Tela de Início".
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => void;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PWA() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const jaInstalado = window.matchMedia("(display-mode: standalone)").matches;
    const dispensado = localStorage.getItem("pwa-dismiss");
    if (jaInstalado || dispensado) return;

    function onPrompt(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShowBanner(true);
    }
    window.addEventListener("beforeinstallprompt", onPrompt);

    // iOS Safari não suporta beforeinstallprompt
    const ua = window.navigator.userAgent;
    const isIOS = /iphone|ipad|ipod/i.test(ua) && !("MSStream" in window);
    const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
    if (isIOS && isSafari) {
      Promise.resolve().then(() => {
        setIosHint(true);
        setShowBanner(true);
      });
    }

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dispensar() {
    setShowBanner(false);
    localStorage.setItem("pwa-dismiss", "1");
  }

  async function instalar() {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setShowBanner(false);
    localStorage.setItem("pwa-dismiss", "1");
  }

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-4 inset-x-4 sm:left-auto sm:right-4 sm:w-96 z-[70]">
      <div className="flex items-start gap-3 p-4 rounded-2xl"
           style={{ background: "var(--bg-card)", border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)" }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
             style={{ background: "var(--accent-gradient)" }}>
          <Download className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Instalar o Financer Auto
          </p>
          {iosHint ? (
            <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
              Toque em <strong>Compartilhar</strong> e depois em <strong>&quot;Adicionar à Tela de Início&quot;</strong>.
            </p>
          ) : (
            <>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                Acesse com 1 toque, como um app — sem ocupar espaço.
              </p>
              <button onClick={instalar} className="btn-primary mt-2.5 !py-2 !px-4 text-xs">
                Instalar agora
              </button>
            </>
          )}
        </div>
        <button onClick={dispensar} style={{ color: "var(--text-muted)" }} aria-label="Dispensar">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
