"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/** Captura erros de renderização na raiz e reporta ao Sentry. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", background: "#0b1120", color: "#e2e8f0", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>Algo não saiu como esperado</h1>
          <p style={{ fontSize: 14, color: "#94a3b8", marginTop: 6 }}>Recarregue a página para continuar.</p>
          <button onClick={() => location.reload()}
                  style={{ marginTop: 20, padding: "10px 20px", borderRadius: 12, border: "none", background: "#2563eb", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
            Recarregar
          </button>
        </div>
      </body>
    </html>
  );
}
