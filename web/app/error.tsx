"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

/**
 * Tela de erro amigável (substitui o crash branco). O erro é registrado no
 * console — a Vercel captura automaticamente nos Runtime Logs do projeto.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[Financer Auto] erro capturado:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--bg-primary)" }}>
      <div className="card p-8 max-w-md w-full text-center">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
             style={{ background: "var(--danger-light)" }}>
          <AlertTriangle className="w-7 h-7" style={{ color: "var(--danger)" }} />
        </div>
        <h1 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
          Algo não saiu como esperado
        </h1>
        <p className="text-sm mt-1.5" style={{ color: "var(--text-secondary)" }}>
          Tente novamente. Se continuar, recarregue a página ou fale com o suporte.
        </p>
        <button onClick={reset} className="btn-primary mt-5 inline-flex items-center gap-2">
          <RotateCw className="w-4 h-4" /> Tentar de novo
        </button>
        {error?.digest && (
          <p className="text-xs mt-4" style={{ color: "var(--text-muted)" }}>
            Código do erro: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
