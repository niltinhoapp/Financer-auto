"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Car, Users, FileText, DollarSign, BarChart3,
  UserCog, LogOut, Shield, Wrench, Settings, Sun, Moon,
  ArrowLeftRight, Zap, X, TrendingUp, Wallet, AlertTriangle, ShieldCheck,
} from "lucide-react";

interface SidebarProps {
  onClose?: () => void;
}

const adminNav = [
  { href: "/dashboard",          label: "Dashboard",     icon: LayoutDashboard },
  { href: "/veiculos",           label: "Veículos",      icon: Car },
  { href: "/clientes",           label: "Clientes",      icon: Users },
  { href: "/clientes/aprovacao", label: "Aprovação",     icon: Shield },
  { href: "/contratos",          label: "Contratos",     icon: FileText },
  { href: "/recebimentos",       label: "Recebimentos",  icon: DollarSign },
  { href: "/inadimplencia",      label: "Inadimplência", icon: AlertTriangle },
  { href: "/leads",              label: "Leads",         icon: Zap },
  { href: "/trocas",             label: "Trocas",        icon: ArrowLeftRight },
  { href: "/comissoes",          label: "Comissões",     icon: TrendingUp },
  { href: "/financeiro",         label: "Fluxo de Caixa", icon: Wallet },
  { href: "/oficinas",           label: "Oficinas",      icon: Wrench },
  { href: "/vendedores",         label: "Vendedores",    icon: UserCog },
  { href: "/relatorios",         label: "Relatórios",    icon: BarChart3 },
  { href: "/auditoria",          label: "Auditoria",     icon: ShieldCheck },
  { href: "/configuracoes",      label: "Configurações", icon: Settings },
];

const sellerNav = [
  { href: "/veiculos",  label: "Veículos",  icon: Car },
  { href: "/clientes",  label: "Clientes",  icon: Users },
  { href: "/contratos", label: "Contratos", icon: FileText },
  { href: "/leads",     label: "Leads",     icon: Zap },
];

const financeiroNav = [
  { href: "/dashboard",     label: "Dashboard",      icon: LayoutDashboard },
  { href: "/recebimentos",  label: "Recebimentos",   icon: DollarSign },
  { href: "/inadimplencia", label: "Inadimplência",  icon: AlertTriangle },
  { href: "/comissoes",     label: "Comissões",      icon: TrendingUp },
  { href: "/financeiro",    label: "Fluxo de Caixa", icon: Wallet },
  { href: "/relatorios",    label: "Relatórios",     icon: BarChart3 },
];

export function Sidebar({ onClose }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const nav =
    user?.role === "admin" ? adminNav
    : user?.role === "financial" ? financeiroNav
    : sellerNav;

  function isActive(href: string) {
    if (href === "/clientes") {
      return pathname === "/clientes" || (pathname.startsWith("/clientes/") && !pathname.startsWith("/clientes/aprovacao"));
    }
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <aside
      className="w-64 flex flex-col h-full"
      style={{
        background: "var(--bg-sidebar)",
        borderRight: "1px solid rgba(255,255,255,.06)",
      }}
    >
      {/* Logo */}
      <div className="px-5 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,.07)" }}>
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "var(--accent-gradient)" }}
          >
            <Car className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-sm leading-tight">Financer Auto</p>
            <p className="text-xs truncate" style={{ color: "rgba(255,255,255,.35)" }}>Gestão de Revendas</p>
          </div>
          {/* botão fechar — mobile */}
          {onClose && (
            <button
              onClick={onClose}
              className="lg:hidden p-1 rounded-lg hover:bg-white/10 transition-colors"
              style={{ color: "rgba(255,255,255,.5)" }}
              aria-label="Fechar menu"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150",
              )}
              style={
                active
                  ? { background: "var(--accent-gradient)", color: "#fff" }
                  : { color: "rgba(255,255,255,.5)" }
              }
              onMouseEnter={(e) => {
                if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.07)";
                if (!active) (e.currentTarget as HTMLElement).style.color = "#fff";
              }}
              onMouseLeave={(e) => {
                if (!active) (e.currentTarget as HTMLElement).style.background = "";
                if (!active) (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,.5)";
              }}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div
        className="px-3 pb-4 pt-3 space-y-1"
        style={{ borderTop: "1px solid rgba(255,255,255,.07)" }}
      >
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150"
          style={{ color: "rgba(255,255,255,.5)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,.07)";
            (e.currentTarget as HTMLElement).style.color = "#fff";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "";
            (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,.5)";
          }}
        >
          {theme === "dark"
            ? <Sun className="w-4 h-4 flex-shrink-0" />
            : <Moon className="w-4 h-4 flex-shrink-0" />}
          {theme === "dark" ? "Tema Claro" : "Tema Escuro"}
        </button>

        {/* User info */}
        <div className="px-3 py-2">
          <p className="text-xs font-semibold text-white truncate">{user?.name}</p>
          <p className="text-xs" style={{ color: "rgba(255,255,255,.35)" }}>
            {user?.role === "admin" ? "Administrador" : user?.role === "financial" ? "Financeiro" : "Vendedor"}
          </p>
        </div>

        {/* Logout */}
        <button
          onClick={logout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150"
          style={{ color: "rgba(255,255,255,.4)" }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,.15)";
            (e.currentTarget as HTMLElement).style.color = "#f87171";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "";
            (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,.4)";
          }}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          Sair
        </button>
      </div>
    </aside>
  );
}
