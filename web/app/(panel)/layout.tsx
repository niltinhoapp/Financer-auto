"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { Sidebar } from "@/components/layout/Sidebar";
import { HelpWidget } from "@/components/ajuda/HelpWidget";
import { BuscaGlobal } from "@/components/layout/BuscaGlobal";
import { Menu, Car } from "lucide-react";

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // fecha sidebar ao navegar
  useEffect(() => {
    Promise.resolve().then(() => setSidebarOpen(false));
  }, [pathname]);

  const isStaff = user?.role === "admin" || user?.role === "seller" || user?.role === "financial";

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (user.role === "customer") router.replace("/minha-area");
    else if (user.role !== "admin" && user.role !== "seller" && user.role !== "financial") router.replace("/loja"); // prospect/visitante não acessa o painel
  }, [user, loading, router]);

  if (loading || (user && !isStaff)) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-4"
             style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-full" style={{ background: "var(--bg-primary)" }}>
      {/* overlay mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: "rgba(0,0,0,.55)" }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* sidebar */}
      <div
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 h-full transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* conteúdo principal */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* top bar mobile */}
        <div
          className="lg:hidden flex items-center gap-3 px-4 py-3 sticky top-0 z-30"
          style={{
            background: "var(--bg-card)",
            borderBottom: "1px solid var(--border)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1 rounded-lg transition-opacity hover:opacity-70"
            style={{ color: "var(--text-primary)" }}
            aria-label="Abrir menu"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: "var(--accent-gradient)" }}
            >
              <Car className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>
              Financer Auto
            </span>
          </div>
          <div className="ml-auto"><BuscaGlobal /></div>
        </div>

        {/* barra de busca global (desktop) */}
        <div className="hidden lg:flex items-center px-8 py-3 sticky top-0 z-30"
             style={{ background: "var(--bg-primary)", borderBottom: "1px solid var(--border)" }}>
          <BuscaGlobal />
        </div>

        <main className="flex-1 overflow-auto">{children}</main>
      </div>

      <HelpWidget papel={user.role === "admin" ? "admin" : "seller"} />
    </div>
  );
}
