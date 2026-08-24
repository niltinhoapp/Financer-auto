"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { TrocaSenhaObrigatoria } from "@/components/cliente/TrocaSenhaObrigatoria";
import { CompletarCadastro, cadastroCompleto } from "@/components/cliente/CompletarCadastro";
import { HelpWidget } from "@/components/ajuda/HelpWidget";
import { getCustomer } from "@/lib/firestore/customers";
import type { Customer } from "@financer-auto/shared";
import { Car, LogOut, Sun, Moon } from "lucide-react";

export default function ClienteLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const [senhaTrocada, setSenhaTrocada] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerLoading, setCustomerLoading] = useState(true);
  const [cadastroOk, setCadastroOk] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace("/login"); return; }
    if (user.role !== "customer") { router.replace("/"); }
  }, [user, loading, router]);

  // Carrega o cadastro do cliente para checar se está completo
  useEffect(() => {
    if (!user?.customerId) {
      Promise.resolve().then(() => setCustomerLoading(false));
      return;
    }
    getCustomer(user.customerId)
      .then(setCustomer)
      .finally(() => setCustomerLoading(false));
  }, [user?.customerId]);

  if (loading || !user) {
    return (
      <div className="flex h-full items-center justify-center" style={{ background: "var(--bg-primary)" }}>
        <div className="animate-spin rounded-full h-10 w-10 border-4"
             style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
      </div>
    );
  }

  // Primeiro acesso: troca de senha obrigatória — bloqueia tudo até concluir
  if (user.mustChangePassword && !senhaTrocada) {
    return <TrocaSenhaObrigatoria uid={user.uid} onDone={() => setSenhaTrocada(true)} />;
  }

  // Cadastro incompleto (CPF, nascimento, endereço): exige completar antes de usar
  if (customerLoading) {
    return (
      <div className="flex h-full items-center justify-center" style={{ background: "var(--bg-primary)" }}>
        <div className="animate-spin rounded-full h-10 w-10 border-4"
             style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
      </div>
    );
  }
  if (customer && !cadastroCompleto(customer) && !cadastroOk) {
    return <CompletarCadastro customer={customer} onDone={() => setCadastroOk(true)} />;
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg-primary)" }}>
      {/* Header */}
      <header className="sticky top-0 z-10 px-5 py-3 flex items-center justify-between"
              style={{
                background: "var(--bg-card)",
                borderBottom: "1px solid var(--border)",
                boxShadow: "var(--shadow-sm)",
              }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
               style={{ background: "var(--accent-gradient)" }}>
            <Car className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>Financer Auto</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Olá, <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{user.name}</span>
          </span>

          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg transition-colors"
            style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}
            title={theme === "dark" ? "Tema claro" : "Tema escuro"}
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            onClick={logout}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg transition-colors"
            style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}
          >
            <LogOut className="w-3.5 h-3.5" />
            Sair
          </button>
        </div>
      </header>

      {/* Conteúdo */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-6">
        {children}
      </main>

      <HelpWidget papel="customer" />
    </div>
  );
}
