"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { getVehicles } from "@/lib/firestore/vehicles";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { excluirVeiculoFn } from "@/lib/functions";
import { useSelecaoExclusao, CheckExclusao } from "@/components/admin/SelecaoExclusao";
import { useToast } from "@/components/ui/Toast";
import type { Vehicle, VehicleStatus } from "@financer-auto/shared";
import { Plus, Search, Car, Gauge, Calendar } from "lucide-react";

const statusCfg: Record<VehicleStatus, { label: string; bg: string; color: string }> = {
  available: { label: "Disponível", bg: "#10b98118", color: "#10b981" },
  reserved:  { label: "Reservado",  bg: "#f59e0b18", color: "#f59e0b" },
  sold:      { label: "Vendido",    bg: "#94a3b818", color: "#94a3b8" },
  warranty:  { label: "Em Garantia",bg: "#3b82f618", color: "#3b82f6" },
};

export default function VeiculosPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  async function load() {
    setLoading(true);
    try {
      const data = await getVehicles();
      setVehicles(data);
    } catch (e) {
      console.error("Erro ao carregar veículos:", e);
      Sentry.captureException(e);
      toast("Não foi possível carregar os veículos. Tente novamente.", "error");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { Promise.resolve().then(() => load()); }, []);

  const sel = useSelecaoExclusao(
    async (id) => { await excluirVeiculoFn({ vehicleId: id }); },
    load
  );

  const filtered = vehicles.filter((v) => {
    const matchesSearch = !search || `${v.brand} ${v.model} ${v.plate}`.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = !filterStatus || v.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl md:text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Veículos</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>{vehicles.length} cadastrados</p>
        </div>
        <div className="flex items-center gap-2">
          {user?.role === "admin" && <sel.ToggleButton />}
          <Link href="/veiculos/novo"
                className="flex items-center gap-2 px-3 md:px-4 py-2 md:py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
                style={{ background: "var(--accent-gradient)" }}>
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Novo Veículo</span>
            <span className="sm:hidden">Novo</span>
          </Link>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-muted)" }} />
          <input type="text" placeholder="Buscar marca, modelo, placa..."
                 value={search} onChange={(e) => setSearch(e.target.value)}
                 className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm"
                 style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-2.5 rounded-xl text-sm"
                style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
          <option value="">Todos</option>
          <option value="available">Disponível</option>
          <option value="reserved">Reservado</option>
          <option value="sold">Vendido</option>
          <option value="warranty">Garantia</option>
        </select>
      </div>

      {/* Status badges */}
      <div className="flex gap-2 flex-wrap mb-5">
        {(Object.entries(statusCfg) as [VehicleStatus, (typeof statusCfg)[VehicleStatus]][]).map(([k, v]) => {
          const count = vehicles.filter((ve) => ve.status === k).length;
          if (!count) return null;
          return (
            <button key={k} onClick={() => setFilterStatus(filterStatus === k ? "" : k)}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all"
                    style={{
                      background: filterStatus === k ? v.bg : "var(--bg-hover)",
                      color: filterStatus === k ? v.color : "var(--text-secondary)",
                      border: `1px solid ${filterStatus === k ? v.color + "40" : "var(--border)"}`,
                    }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: v.color }} />
              {v.label} ({count})
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-4"
               style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card py-14 text-center">
          <Car className="w-10 h-10 mx-auto mb-3 opacity-20" style={{ color: "var(--text-muted)" }} />
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Nenhum veículo encontrado</p>
        </div>
      ) : (
        <>
          {/* Grid mobile */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:hidden">
            {filtered.map((v) => {
              const s = statusCfg[v.status];
              return (
                <Link key={v.id} href={`/veiculos/${v.id}`}
                      onClick={(e) => { if (sel.selecting) { e.preventDefault(); sel.toggle(v.id); } }}
                      className="card p-4 flex gap-3 hover:scale-[1.01] transition-transform items-center">
                  {sel.selecting && (
                    <CheckExclusao checked={sel.isSelected(v.id)} onChange={() => sel.toggle(v.id)} />
                  )}
                  {/* Foto ou ícone */}
                  <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0"
                       style={{ background: "var(--bg-hover)" }}>
                    {v.photos?.[0]
                      ? <img src={v.photos[0]} alt={`${v.brand} ${v.model}`} className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center">
                          <Car className="w-6 h-6 opacity-30" style={{ color: "var(--text-muted)" }} />
                        </div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <p className="font-semibold text-sm truncate" style={{ color: "var(--text-primary)" }}>
                        {v.brand} {v.model}
                      </p>
                      <span className="flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{ background: s.bg, color: s.color }}>
                        {s.label}
                      </span>
                    </div>
                    <p className="text-xs font-bold mt-1" style={{ color: "var(--accent)" }}>
                      {formatCurrency(v.price)}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="flex items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
                        <Calendar className="w-3 h-3" />{v.year}
                      </span>
                      <span className="flex items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
                        <Gauge className="w-3 h-3" />{v.mileage.toLocaleString("pt-BR")} km
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Tabela desktop */}
          <div className="card overflow-hidden hidden md:block">
            <table className="w-full text-sm">
              <thead style={{ background: "var(--bg-hover)", borderBottom: "1px solid var(--border)" }}>
                <tr>
                  {sel.selecting && <th className="px-4 py-3 w-8" />}
                  {["Veículo","Placa","Ano","Quilometragem","Preço de Venda","Status",""].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold"
                        style={{ color: "var(--text-secondary)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => {
                  const s = statusCfg[v.status];
                  return (
                    <tr key={v.id} style={{ borderBottom: "1px solid var(--border)", cursor: sel.selecting ? "pointer" : undefined }}
                        onClick={() => sel.selecting && sel.toggle(v.id)}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                      {sel.selecting && (
                        <td className="px-4 py-3">
                          <CheckExclusao checked={sel.isSelected(v.id)} onChange={() => sel.toggle(v.id)} />
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0"
                               style={{ background: "var(--bg-hover)" }}>
                            {v.photos?.[0]
                              ? <img src={v.photos[0]} alt={`${v.brand} ${v.model}`} className="w-full h-full object-cover" />
                              : <div className="w-full h-full flex items-center justify-center">
                                  <Car className="w-4 h-4 opacity-40" style={{ color: "var(--text-muted)" }} />
                                </div>
                            }
                          </div>
                          <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                            {v.brand} {v.model}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--text-muted)" }}>{v.plate}</td>
                      <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{v.year}</td>
                      <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{v.mileage.toLocaleString("pt-BR")} km</td>
                      <td className="px-4 py-3 font-medium" style={{ color: "var(--text-primary)" }}>{formatCurrency(v.price)}</td>
                      <td className="px-4 py-3">
                        <span className="px-2.5 py-1 rounded-full text-xs font-medium"
                              style={{ background: s.bg, color: s.color }}>{s.label}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/veiculos/${v.id}`}
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

      <sel.Bar itemLabel="veículo(s)" />
    </div>
  );
}
