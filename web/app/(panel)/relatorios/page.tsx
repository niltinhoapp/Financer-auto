"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, collectionGroup, query, orderBy } from "firebase/firestore";
import * as Sentry from "@sentry/nextjs";
import { db } from "@/lib/firebase";
import { formatCurrency } from "@/lib/utils";
import { todasReceitas } from "@/lib/receitas";
import { useToast } from "@/components/ui/Toast";
import type { Contract } from "@financer-auto/shared";
import { Download, TrendingUp, DollarSign, FileText, AlertTriangle } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
} from "recharts";

const MONTHS_PT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function getLast12Months(): string[] {
  const result: string[] = [];
  const d = new Date();
  for (let i = 11; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    result.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`);
  }
  return result;
}

interface RawContract {
  id: string;
  sellerId?: string;
  salePrice?: number;
  status?: string;
  createdAt?: string | { toDate?: () => Date };
}
interface RawVehicle { status?: string; }
interface RawUser { id: string; name?: string; }

interface ReportData {
  revenueByMonth: { month: string; receita: number; vendas: number }[];
  totalRevenue: number;
  totalSales: number;
  avgTicket: number;
  totalVehicles: number;
  defaultRate: number;
  topSellers: { name: string; sales: number; revenue: number }[];
  vehiclesByStatus: Record<string, number>;
}

export default function RelatoriosPage() {
  const { toast } = useToast();
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "financial" | "vehicles">("overview");

  useEffect(() => {
    async function load() {
      try {
        const [contractsSnap, paymentsSnap, vehiclesSnap, usersSnap] = await Promise.all([
          getDocs(collection(db, "contracts")),
          getDocs(collection(db, "payments")),
          getDocs(collection(db, "vehicles")),
          getDocs(collection(db, "users")),
        ]);

        const contracts = contractsSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as RawContract);
        const payments  = paymentsSnap.docs.map((d) => d.data() as { amount?: number; paidAt?: string });
        const vehicles  = vehiclesSnap.docs.map((d) => d.data() as RawVehicle);
        const users     = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as RawUser);

        const last12 = getLast12Months();

        // Receitas reais = pagamentos de parcelas + entradas em dinheiro dos contratos
        const receitas = todasReceitas(payments, contracts as unknown as Contract[]);

        const revenueByMonth = last12.map((mk) => {
          const [, mon] = mk.split("-");
          const monthReceitas = receitas.filter((r) => r.paidAt.slice(0, 7) === mk);
          const monthContracts = contracts.filter((c) => {
            const dateStr = (typeof c.createdAt === "object" ? c.createdAt?.toDate?.()?.toISOString() : c.createdAt) ?? "";
            return dateStr.slice(0, 7) === mk;
          });
          return {
            month: MONTHS_PT[parseInt(mon) - 1],
            receita: monthReceitas.reduce((a, r) => a + r.amount, 0),
            vendas: monthContracts.length,
          };
        });

        const totalRevenue = receitas.reduce((a, r) => a + r.amount, 0);
        const totalSales = contracts.length;
        // Ticket médio real = média do valor de venda dos contratos
        const totalSalesValue = contracts.reduce((a, c) => a + (c.salePrice || 0), 0);

        const sellerMap: Record<string, { name: string; sales: number; revenue: number }> = {};
        for (const c of contracts) {
          const sid = c.sellerId;
          if (!sid) continue;
          if (!sellerMap[sid]) {
            const u = users.find((u) => u.id === sid);
            sellerMap[sid] = { name: u?.name ?? sid.slice(0, 8), sales: 0, revenue: 0 };
          }
          sellerMap[sid].sales++;
          sellerMap[sid].revenue += c.salePrice || 0;
        }

        const defaultedContracts = contracts.filter((c) => c.status === "defaulted").length;
        const vByStatus: Record<string, number> = {};
        for (const v of vehicles) {
          const status = v.status ?? "desconhecido";
          vByStatus[status] = (vByStatus[status] || 0) + 1;
        }

        setData({
          revenueByMonth,
          totalRevenue,
          totalSales,
          avgTicket: totalSales > 0 ? totalSalesValue / totalSales : 0,
          totalVehicles: vehiclesSnap.size,
          defaultRate: totalSales > 0 ? (defaultedContracts / totalSales) * 100 : 0,
          topSellers: Object.values(sellerMap).sort((a, b) => b.sales - a.sales).slice(0, 5),
          vehiclesByStatus: vByStatus,
        });
      } catch (e) {
        console.error("Erro ao carregar relatórios:", e);
        Sentry.captureException(e);
        toast("Não foi possível carregar os relatórios. Tente novamente.", "error");
      }
      finally { setLoading(false); }
    }
    load();
  }, [toast]);

  function exportCSV() {
    if (!data) return;
    const rows = [
      ["Mês", "Receita", "Vendas"],
      ...data.revenueByMonth.map((r) => [r.month, r.receita, r.vendas]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="p-4 md:p-8 flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-4"
             style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Relatórios</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>Análise de desempenho</p>
        </div>
        <button onClick={exportCSV}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium hover:opacity-80 transition-opacity w-fit"
                style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
          <Download className="w-4 h-4" /> Exportar CSV
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Receita Total",  value: formatCurrency(data?.totalRevenue ?? 0), icon: DollarSign,    color: "#10b981" },
          { label: "Total de Vendas",value: data?.totalSales ?? 0,                    icon: FileText,      color: "#3b82f6" },
          { label: "Ticket Médio",   value: formatCurrency(data?.avgTicket ?? 0),     icon: TrendingUp,    color: "#8b5cf6" },
          { label: "Inadimplência",  value: `${(data?.defaultRate ?? 0).toFixed(1)}%`,icon: AlertTriangle, color: "#ef4444" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 rounded-lg" style={{ background: `${color}18` }}>
                <Icon className="w-3.5 h-3.5" style={{ color }} />
              </div>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</p>
            </div>
            <p className="text-base md:text-lg font-bold" style={{ color: "var(--text-primary)" }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl" style={{ background: "var(--bg-hover)" }}>
        {([
          { key: "overview",  label: "Visão Geral" },
          { key: "financial", label: "Financeiro" },
          { key: "vehicles",  label: "Veículos" },
        ] as const).map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
                  className="flex-1 py-2 rounded-lg text-xs md:text-sm font-medium transition-all"
                  style={tab === key
                    ? { background: "var(--bg-card)", color: "var(--text-primary)", boxShadow: "var(--shadow-sm)" }
                    : { color: "var(--text-muted)" }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-5">
          <div className="card p-5">
            <p className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Receita — Últimos 12 Meses</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data?.revenueByMonth} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false}
                       tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                <Tooltip formatter={(v: number | string | readonly (number | string)[] | undefined) => [formatCurrency(Number(v)), "Receita"]}
                         contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "0.5rem", fontSize: "12px", color: "var(--text-primary)" }}
                         cursor={{ fill: "var(--bg-hover)" }} />
                <Bar dataKey="receita" fill="var(--accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card p-5">
            <p className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Top Vendedores</p>
            {(data?.topSellers ?? []).length === 0 ? (
              <p className="text-sm text-center py-4" style={{ color: "var(--text-muted)" }}>Sem dados de vendas</p>
            ) : (
              <div className="space-y-3">
                {data?.topSellers.map((s, i) => (
                  <div key={s.name} className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                         style={{ background: i === 0 ? "#f59e0b" : i === 1 ? "#94a3b8" : i === 2 ? "#b45309" : "var(--bg-hover)", color: i < 3 ? "#fff" : "var(--text-muted)" }}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{s.name}</p>
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>{s.sales} venda{s.sales !== 1 ? "s" : ""}</p>
                    </div>
                    <p className="text-sm font-bold" style={{ color: "var(--accent)" }}>{formatCurrency(s.revenue)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "financial" && (
        <div className="card p-5">
          <p className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Vendas e Receita por Mês</p>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={data?.revenueByMonth} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
              <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                     tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
              <Tooltip contentStyle={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "0.5rem", fontSize: "12px", color: "var(--text-primary)" }} />
              <Legend formatter={(v) => <span style={{ color: "var(--text-secondary)", fontSize: "11px" }}>{v}</span>} />
              <Line yAxisId="left" type="monotone" dataKey="receita" stroke="#3b82f6" strokeWidth={2} dot={false} name="Receita (R$)" />
              <Line yAxisId="right" type="monotone" dataKey="vendas" stroke="#10b981" strokeWidth={2} dot={false} name="Vendas" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {tab === "vehicles" && (
        <div className="card p-5">
          <p className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Estoque por Status</p>
          <div className="space-y-4">
            {[
              { key: "available", label: "Disponível", color: "#10b981" },
              { key: "reserved",  label: "Reservado",  color: "#f59e0b" },
              { key: "sold",      label: "Vendido",    color: "#94a3b8" },
              { key: "warranty",  label: "Em Garantia",color: "#3b82f6" },
            ].map(({ key, label, color }) => {
              const count = data?.vehiclesByStatus[key] ?? 0;
              const total = data?.totalVehicles ?? 1;
              const pct = total > 0 ? (count / total) * 100 : 0;
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{label}</span>
                    <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                      {count} <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>({pct.toFixed(0)}%)</span>
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full" style={{ background: "var(--bg-hover)" }}>
                    <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-5 text-sm" style={{ color: "var(--text-secondary)", borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
            Total no estoque: <strong style={{ color: "var(--text-primary)" }}>{data?.totalVehicles}</strong> veículos
          </p>
        </div>
      )}
    </div>
  );
}
