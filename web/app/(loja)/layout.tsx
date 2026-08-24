"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { HelpWidget } from "@/components/ajuda/HelpWidget";
import { Car, Sun, Moon, User, LogOut, LayoutDashboard } from "lucide-react";

export default function LojaLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    Promise.resolve().then(() => setMounted(true));
  }, []);

  const isStaff = user && (user.role === "admin" || user.role === "seller");
  const isCustomer = user && user.role === "customer";

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg-primary)" }}>
      {/* Header */}
      <header className="sticky top-0 z-20 px-6 py-3 flex items-center justify-between"
              style={{ background: "var(--bg-card)", borderBottom: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}>
        <Link href="/loja" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
               style={{ background: "var(--accent-gradient)" }}>
            <Car className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-bold text-sm leading-tight" style={{ color: "var(--text-primary)" }}>Financer Auto</p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Veículos com financiamento próprio</p>
          </div>
        </Link>

        <nav className="flex items-center gap-2">
          {mounted && (
            <button onClick={toggleTheme}
                    className="p-2 rounded-lg transition-colors"
                    style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          )}

          {!user ? (
            <>
              <Link href="/loja/acesso"
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all"
                    style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
                <User className="w-4 h-4" /> Entrar / Cadastrar
              </Link>
              <Link href="/login"
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all"
                    style={{ background: "var(--accent-gradient)" }}>
                Área Restrita
              </Link>
            </>
          ) : isStaff ? (
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline text-xs px-2 py-1 rounded-full font-medium"
                    style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                Modo administrador
              </span>
              <Link href="/dashboard"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium"
                    style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
                <LayoutDashboard className="w-4 h-4" /> Painel
              </Link>
              <button onClick={logout} title="Sair"
                      className="p-2 rounded-lg"
                      style={{ background: "var(--bg-hover)", color: "var(--text-muted)" }}>
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : isCustomer ? (
            <>
              <Link href="/minha-area"
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium"
                    style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                <User className="w-4 h-4" /> Minha Área
              </Link>
              <button onClick={logout}
                      className="p-2 rounded-lg"
                      style={{ background: "var(--bg-hover)", color: "var(--text-muted)" }}>
                <LogOut className="w-4 h-4" />
              </button>
            </>
          ) : (
            /* prospect */
            <div className="flex items-center gap-2">
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{user.name}</span>
              <button onClick={logout}
                      className="p-2 rounded-lg"
                      style={{ background: "var(--bg-hover)", color: "var(--text-muted)" }}>
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </nav>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="py-6 text-center text-xs" style={{ color: "var(--text-muted)", borderTop: "1px solid var(--border)" }}>
        © {new Date().getFullYear()} Financer Auto · Todos os direitos reservados
      </footer>

      {/* Ajuda à esquerda (WhatsApp flutuante fica à direita) */}
      <HelpWidget papel={isCustomer ? "customer" : "loja"} lado="left" />
    </div>
  );
}
