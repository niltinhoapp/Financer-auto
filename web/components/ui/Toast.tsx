"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback((message: string, type: ToastType = "info") => {
    const id = nextId++;
    setToasts((t) => [...t.slice(-2), { id, type, message }]);
    setTimeout(() => dismiss(id), 4500);
  }, [dismiss]);

  const icons: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: "var(--success)" }} />,
    error: <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: "var(--danger)" }} />,
    info: <Info className="w-4 h-4 flex-shrink-0" style={{ color: "var(--accent)" }} />,
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Container — bottom center no mobile, bottom right no desktop */}
      <div className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-4 sm:w-96 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id}
               className="pointer-events-auto flex items-start gap-2.5 px-4 py-3 rounded-xl text-sm animate-toast-in"
               style={{
                 background: "var(--bg-card)",
                 border: "1px solid var(--border)",
                 boxShadow: "var(--shadow-lg)",
                 color: "var(--text-primary)",
               }}>
            {icons[t.type]}
            <span className="flex-1">{t.message}</span>
            <button onClick={() => dismiss(t.id)} aria-label="Fechar"
                    style={{ color: "var(--text-muted)" }}>
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
