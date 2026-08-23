"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCustomers } from "@/lib/firestore/customers";
import { useAuth } from "@/hooks/useAuth";
import { excluirClienteFn } from "@/lib/functions";
import { useSelecaoExclusao, CheckExclusao } from "@/components/admin/SelecaoExclusao";
import { formatCPF, formatPhone } from "@/lib/utils";
import type { Customer } from "@financer-auto/shared";
import { Plus, Search, Users, CheckCircle, Clock, XCircle, Phone, MapPin, ShieldAlert } from "lucide-react";

const approvalCfg: Record<string, { label: string; bg: string; color: string; icon: React.ReactNode }> = {
  pending:  { label: "Pendente",  bg: "#f59e0b18", color: "#f59e0b",  icon: <Clock className="w-3 h-3" /> },
  approved: { label: "Aprovado",  bg: "#10b98118", color: "#10b981",  icon: <CheckCircle className="w-3 h-3" /> },
  rejected: { label: "Rejeitado", bg: "#ef444418", color: "#ef4444",  icon: <XCircle className="w-3 h-3" /> },
};

export default function ClientesPage() {
  const { user } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  function load() {
    return getCustomers().then(setCustomers).finally(() => setLoading(false));
  }
  useEffect(() => { load(); }, []);

  const sel = useSelecaoExclusao(
    async (id) => { await excluirClienteFn({ customerId: id }); },
    load
  );

  const filtered = customers.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.cpf.includes(q) || c.phone.includes(q);
  });

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl md:text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Clientes</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>{customers.length} cadastrados</p>
        </div>
        <div className="flex items-center gap-2">
          {user?.role === "admin" && <sel.ToggleButton />}
          <Link href="/clientes/novo"
                className="flex items-center gap-2 px-3 md:px-4 py-2 md:py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-all"
                style={{ background: "var(--accent-gradient)" }}>
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Novo Cliente</span>
            <span className="sm:hidden">Novo</span>
          </Link>
        </div>
      </div>

      {/* Busca */}
      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-muted)" }} />
        <input type="text" placeholder="Buscar por nome, CPF ou telefone..."
               value={search} onChange={(e) => setSearch(e.target.value)}
               className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm"
               style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-4"
               style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card py-14 text-center">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-20" style={{ color: "var(--text-muted)" }} />
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Nenhum cliente encontrado</p>
        </div>
      ) : (
        <>
          {/* Cards — mobile */}
          <div className="space-y-2 md:hidden">
            {filtered.map((c) => {
              const b = approvalCfg[c.approvalStatus ?? "pending"];
              return (
                <Link key={c.id} href={`/clientes/${c.id}`}
                      onClick={(e) => { if (sel.selecting) { e.preventDefault(); sel.toggle(c.id); } }}
                      className="card p-4 flex items-center gap-3 hover:scale-[1.01] transition-transform">
                  {sel.selecting && (
                    <CheckExclusao checked={sel.isSelected(c.id)} onChange={() => sel.toggle(c.id)} />
                  )}
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                       style={{ background: "var(--bg-hover)" }}>
                    <span className="text-sm font-bold" style={{ color: "var(--text-secondary)" }}>
                      {c.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm truncate" style={{ color: "var(--text-primary)" }}>{c.name}</p>
                      <span className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5"
                            style={{ background: b.bg, color: b.color }}>
                        {b.icon}{b.label}
                      </span>
                      {c.restricted && (
                        <span className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded-full font-medium flex items-center gap-0.5"
                              style={{ background: "#ef444418", color: "#ef4444" }}>
                          <ShieldAlert className="w-3 h-3" /> Restrição
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <p className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>{formatCPF(c.cpf)}</p>
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>{c.address.city}/{c.address.state}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Tabela — desktop */}
          <div className="card overflow-hidden hidden md:block">
            <table className="w-full text-sm">
              <thead style={{ background: "var(--bg-hover)", borderBottom: "1px solid var(--border)" }}>
                <tr>
                  {sel.selecting && <th className="px-4 py-3 w-8" />}
                  {["Nome","CPF","Telefone","Cidade","Status",""].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold"
                        style={{ color: "var(--text-secondary)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const b = approvalCfg[c.approvalStatus ?? "pending"];
                  return (
                    <tr key={c.id} style={{ borderBottom: "1px solid var(--border)", cursor: sel.selecting ? "pointer" : undefined }}
                        onClick={() => sel.selecting && sel.toggle(c.id)}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                      {sel.selecting && (
                        <td className="px-4 py-3">
                          <CheckExclusao checked={sel.isSelected(c.id)} onChange={() => sel.toggle(c.id)} />
                        </td>
                      )}
                      <td className="px-4 py-3 font-medium" style={{ color: "var(--text-primary)" }}>
                        <div className="flex items-center gap-2">
                          {c.name}
                          {c.restricted && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium"
                                  style={{ background: "#ef444418", color: "#ef4444" }} title={c.restrictionReason}>
                              <ShieldAlert className="w-3 h-3" /> Restrição
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--text-muted)" }}>{formatCPF(c.cpf)}</td>
                      <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{formatPhone(c.phone)}</td>
                      <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{c.address.city} — {c.address.state}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                              style={{ background: b.bg, color: b.color }}>
                          {b.icon} {b.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/clientes/${c.id}`}
                              className="text-xs font-medium hover:opacity-70"
                              style={{ color: "var(--accent)" }}>Ver</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <sel.Bar itemLabel="cliente(s)" />
    </div>
  );
}
