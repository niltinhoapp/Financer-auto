"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Car,
  Users,
  FileText,
  DollarSign,
  BarChart3,
  UserCog,
  LogOut,
  Shield,
} from "lucide-react";

const adminNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/veiculos", label: "Veículos", icon: Car },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/clientes/aprovacao", label: "Aprovação", icon: Shield },
  { href: "/contratos", label: "Contratos", icon: FileText },
  { href: "/recebimentos", label: "Recebimentos", icon: DollarSign },
  { href: "/vendedores", label: "Vendedores", icon: UserCog },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
];

const sellerNav = [
  { href: "/veiculos", label: "Veículos", icon: Car },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/contratos", label: "Contratos", icon: FileText },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const nav = user?.role === "admin" ? adminNav : sellerNav;

  return (
    <aside className="w-64 bg-gray-900 flex flex-col h-full">
      <div className="px-6 py-5 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-bold text-lg">Financer Auto</span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              pathname.startsWith(href)
                ? "bg-blue-600 text-white"
                : "text-gray-400 hover:text-white hover:bg-gray-800"
            )}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-gray-800">
        <div className="px-3 py-2 mb-2">
          <p className="text-xs font-medium text-white truncate">{user?.name}</p>
          <p className="text-xs text-gray-500 capitalize">{user?.role === "admin" ? "Administrador" : "Vendedor"}</p>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sair
        </button>
      </div>
    </aside>
  );
}
