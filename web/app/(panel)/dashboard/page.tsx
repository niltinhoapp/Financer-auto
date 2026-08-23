"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy, limit, where, collectionGroup, getCountFromServer } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { formatCurrency } from "@/lib/utils";
import { todasReceitas } from "@/lib/receitas";
import type { Contract } from "@financer-auto/shared";
import Link from "next/link";
import {
  DollarSign, FileText, Users, Car, TrendingUp, AlertTriangle,
  ArrowRight, Clock, CheckCircle, Zap,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

interface KPIs {
  activeContracts: number;
  totalContracts: number;
  totalReceivable: number;
  totalReceived: number;
  overdueInstallments: number;
  overdueValue: number;
  openBalance: number;
  totalCustomers: number;
  availableVehicles: number;
  soldVehicles: number;
  salesThisMonth: number;
  revenueThisMonth: number;
  pendingRequests: number;
  newLeads: number;
}

interface MonthData { month: string; value: number; }
interface PieData { name: string; value: number; color: string; }

interface ResumoStats {
  activeContracts?: number;
  totalContracts?: number;
  totalReceivable?: number;
  totalReceived?: number;
  overdueInstallments?: number;
  overdueValue?: number;
  openBalance?: number;
  totalCustomers?: number;
  availableVehicles?: number;
  soldVehicles?: number;
  salesThisMonth?: number;
  revenueThisMonth?: number;
  pendingRequests?: number;
  newLeads?: number;
  revenueByMonth?: { ym: string; value: number }[];
  contractsByStatus?: Record<string, number>;
  vehiclesByStatus?: Record<string, number>;
}

interface RawContract {
  id: string;
  status?: string;
  financedAmount?: number;
  createdAt?: string | { toDate?: () => Date };
}
interface RawVehicle { status?: string; }
interface RawPayment { amount?: number; paidAt?: string; }
interface RawInstallment { status?: string; dueDate?: string; value?: number; }

const MONTHS_PT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function getMonthKey(dateStr: string) {
  return dateStr?.slice(0, 7) ?? "";
}

function getLast6Months(): string[] {
  const result: string[] = [];
  const d = new Date();
  for (let i = 5; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    result.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`);
  }
  return result;
}

export default function DashboardPage() {
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [revenueChart, setRevenueChart] = useState<MonthData[]>([]);
  const [contractsPie, setContractsPie] = useState<PieData[]>([]);
  const [vehiclesPie, setVehiclesPie] = useState<PieData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const now = new Date();
        const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

        // ── Caminho rápido: lê o agregado pré-calculado (stats/resumo) ──
        try {
          const statsSnap = await getDocs(query(collection(db, "stats")));
          const resumo = statsSnap.docs.find((d) => d.id === "resumo")?.data() as ResumoStats | undefined;
          if (resumo) {
            setKpis({
              activeContracts: resumo.activeContracts ?? 0,
              totalContracts: resumo.totalContracts ?? 0,
              totalReceivable: resumo.totalReceivable ?? 0,
              totalReceived: resumo.totalReceived ?? 0,
              overdueInstallments: resumo.overdueInstallments ?? 0,
              overdueValue: resumo.overdueValue ?? 0,
              openBalance: resumo.openBalance ?? 0,
              totalCustomers: resumo.totalCustomers ?? 0,
              availableVehicles: resumo.availableVehicles ?? 0,
              soldVehicles: resumo.soldVehicles ?? 0,
              salesThisMonth: resumo.salesThisMonth ?? 0,
              revenueThisMonth: resumo.revenueThisMonth ?? 0,
              pendingRequests: resumo.pendingRequests ?? 0,
              newLeads: resumo.newLeads ?? 0,
            });
            setRevenueChart((resumo.revenueByMonth ?? []).map((m) => ({
              month: MONTHS_PT[parseInt(m.ym.split("-")[1]) - 1],
              value: m.value,
            })));
            const cs = resumo.contractsByStatus ?? {};
            setContractsPie([
              { name: "Ativos", value: cs.active || 0, color: "#3b82f6" },
              { name: "Quitados", value: cs.settled || 0, color: "#10b981" },
              { name: "Inadimpl.", value: cs.defaulted || 0, color: "#ef4444" },
              { name: "Renegoc.", value: cs.renegotiated || 0, color: "#f59e0b" },
            ].filter((d) => d.value > 0));
            const vs = resumo.vehiclesByStatus ?? {};
            setVehiclesPie([
              { name: "Disponível", value: vs.available || 0, color: "#10b981" },
              { name: "Reservado", value: vs.reserved || 0, color: "#f59e0b" },
              { name: "Vendido", value: vs.sold || 0, color: "#94a3b8" },
              { name: "Garantia", value: vs.warranty || 0, color: "#3b82f6" },
            ].filter((d) => d.value > 0));
            setLoading(false);
            return; // agregado carregado — não varre o banco inteiro
          }
        } catch { /* sem agregado ainda — segue para cálculo ao vivo */ }

        // allSettled: se uma consulta falhar (ex. permissão), as demais ainda carregam
        const results = await Promise.allSettled([
          getDocs(collection(db, "contracts")),
          getDocs(collection(db, "customers")),
          getDocs(collection(db, "vehicles")),
          getDocs(collection(db, "payments")),
          getDocs(collectionGroup(db, "installments")),
          // Contagens usam agregação no servidor (getCountFromServer) em vez de
          // baixar todos os documentos — mais rápido e sem risco de truncar com limit().
          getCountFromServer(query(collection(db, "paymentRequests"), where("status", "==", "pending"))),
          getCountFromServer(query(collection(db, "leads"), where("status", "==", "new"))),
        ]);
        results.forEach((r, i) => {
          if (r.status === "rejected") console.error(`Dashboard: consulta ${i} falhou:`, r.reason);
        });
        const docsOf = (i: number) =>
          results[i].status === "fulfilled"
            ? (results[i] as PromiseFulfilledResult<{ docs: { id: string; data: () => unknown }[] }>).value.docs
            : [];
        const sizeOf = (i: number) =>
          results[i].status === "fulfilled"
            ? (results[i] as PromiseFulfilledResult<{ size: number }>).value.size
            : 0;
        const countOf = (i: number) =>
          results[i].status === "fulfilled"
            ? (results[i] as PromiseFulfilledResult<{ data: () => { count: number } }>).value.data().count
            : 0;

        const contracts = docsOf(0).map((d) => ({ id: d.id, ...(d.data() as object) })) as RawContract[];
        const customersSnap = { size: sizeOf(1) };
        const vehicles = docsOf(2).map((d) => d.data() as RawVehicle);
        const payments = docsOf(3).map((d) => d.data() as RawPayment);
        const installments = docsOf(4).map((d) => d.data() as RawInstallment);
        const reqsSnap = { size: countOf(5) };
        const leadsSnap = { size: countOf(6) };

        // Receitas reais = pagamentos de parcelas + entradas em dinheiro dos contratos
        const receitas = todasReceitas(payments, contracts as unknown as Contract[]);

        // KPIs básicos
        const activeContracts = contracts.filter((c) => c.status === "active").length;
        const totalReceivable = contracts.reduce((acc, c) => acc + (c.financedAmount || 0), 0);
        const totalReceived = receitas.reduce((acc, r) => acc + r.amount, 0);

        const today = new Date().toISOString().split("T")[0];
        // Parcelas renegociadas foram substituídas por novas — não contam como atraso
        const overdueInst = installments.filter((i) =>
          i.status !== "paid" && i.status !== "renegotiated" && (i.dueDate ?? "") < today
        );
        const overdueValue = overdueInst.reduce((acc, i) => acc + (i.value || 0), 0);

        // Saldo em aberto real = soma das parcelas ainda não pagas
        const openBalance = installments
          .filter((i) => i.status !== "paid" && i.status !== "renegotiated")
          .reduce((acc, i) => acc + (i.value || 0), 0);

        // Este mês
        const salesThisMonth = contracts.filter((c) => {
          const created = typeof c.createdAt === "object" ? c.createdAt?.toDate?.()?.toISOString() : c.createdAt;
          return (created ?? "").slice(0, 7) === thisMonthKey;
        }).length;

        const revenueThisMonth = receitas
          .filter((r) => r.paidAt.slice(0, 7) === thisMonthKey)
          .reduce((acc, r) => acc + r.amount, 0);

        setKpis({
          activeContracts,
          totalContracts: contracts.length,
          totalReceivable,
          totalReceived,
          overdueInstallments: overdueInst.length,
          overdueValue,
          openBalance,
          totalCustomers: customersSnap.size,
          availableVehicles: vehicles.filter((v) => v.status === "available").length,
          soldVehicles: vehicles.filter((v) => v.status === "sold").length,
          salesThisMonth,
          revenueThisMonth,
          pendingRequests: reqsSnap.size,
          newLeads: leadsSnap.size,
        });

        // Gráfico: receita últimos 6 meses
        const last6 = getLast6Months();
        const revenueByMonth: Record<string, number> = {};
        for (const mk of last6) revenueByMonth[mk] = 0;
        for (const r of receitas) {
          const mk = getMonthKey(r.paidAt);
          if (mk in revenueByMonth) revenueByMonth[mk] += r.amount;
        }
        setRevenueChart(
          last6.map((mk) => ({
            month: MONTHS_PT[parseInt(mk.split("-")[1]) - 1],
            value: revenueByMonth[mk],
          }))
        );

        // Gráfico pizza: contratos por status
        const cByStatus: Record<string, number> = {};
        for (const c of contracts) {
          const status = c.status ?? "desconhecido";
          cByStatus[status] = (cByStatus[status] || 0) + 1;
        }
        setContractsPie([
          { name: "Ativos",      value: cByStatus["active"]       || 0, color: "#3b82f6" },
          { name: "Quitados",    value: cByStatus["settled"]      || 0, color: "#10b981" },
          { name: "Inadimpl.",   value: cByStatus["defaulted"]    || 0, color: "#ef4444" },
          { name: "Renegoc.",    value: cByStatus["renegotiated"] || 0, color: "#f59e0b" },
        ].filter((d) => d.value > 0));

        // Gráfico pizza: veículos
        setVehiclesPie([
          { name: "Disponível", value: vehicles.filter((v) => v.status === "available").length, color: "#10b981" },
          { name: "Reservado",  value: vehicles.filter((v) => v.status === "reserved").length,  color: "#f59e0b" },
          { name: "Vendido",    value: vehicles.filter((v) => v.status === "sold").length,       color: "#94a3b8" },
          { name: "Garantia",   value: vehicles.filter((v) => v.status === "warranty").length,   color: "#3b82f6" },
        ].filter((d) => d.value > 0));

      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="p-4 md:p-8 flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-4"
             style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
      </div>
    );
  }

  const kpiCards = [
    {
      label: "Contratos Ativos",
      value: kpis?.activeContracts ?? 0,
      sub: `${kpis?.totalContracts ?? 0} no total`,
      icon: FileText,
      color: "#3b82f6",
      href: "/contratos",
    },
    {
      label: "Vendas Este Mês",
      value: kpis?.salesThisMonth ?? 0,
      sub: "novos contratos",
      icon: TrendingUp,
      color: "#10b981",
      href: "/contratos",
    },
    {
      label: "Receita Este Mês",
      value: formatCurrency(kpis?.revenueThisMonth ?? 0),
      sub: "pagamentos recebidos",
      icon: DollarSign,
      color: "#8b5cf6",
      href: "/recebimentos",
    },
    {
      label: "Parcelas em Atraso",
      value: kpis?.overdueInstallments ?? 0,
      sub: formatCurrency(kpis?.overdueValue ?? 0),
      icon: AlertTriangle,
      color: "#ef4444",
      href: "/recebimentos",
    },
    {
      label: "Clientes",
      value: kpis?.totalCustomers ?? 0,
      sub: "cadastrados",
      icon: Users,
      color: "#ec4899",
      href: "/clientes",
    },
    {
      label: "Veículos Disponíveis",
      value: kpis?.availableVehicles ?? 0,
      sub: `${kpis?.soldVehicles ?? 0} vendidos`,
      icon: Car,
      color: "#f59e0b",
      href: "/veiculos",
    },
  ];

  const alerts = [
    kpis?.pendingRequests
      ? { label: `${kpis.pendingRequests} solicitação${kpis.pendingRequests > 1 ? "ões" : ""} de pagamento pendente${kpis.pendingRequests > 1 ? "s" : ""}`, href: "/recebimentos", color: "#f59e0b", icon: Clock }
      : null,
    kpis?.overdueInstallments
      ? { label: `${kpis.overdueInstallments} parcela${kpis.overdueInstallments > 1 ? "s" : ""} em atraso — ${formatCurrency(kpis.overdueValue ?? 0)}`, href: "/recebimentos", color: "#ef4444", icon: AlertTriangle }
      : null,
    kpis?.newLeads
      ? { label: `${kpis.newLeads} lead${kpis.newLeads > 1 ? "s" : ""} novo${kpis.newLeads > 1 ? "s" : ""} aguardando contato`, href: "/leads", color: "#3b82f6", icon: Zap }
      : null,
  ].filter(Boolean) as { label: string; href: string; color: string; icon: React.ElementType }[];

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl md:text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
          Dashboard
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Visão geral do negócio
        </p>
      </div>

      {/* Alertas */}
      {alerts.length > 0 && (
        <div className="space-y-2 mb-6">
          {alerts.map((a, i) => (
            <Link key={i} href={a.href}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
                  style={{ background: `${a.color}18`, border: `1px solid ${a.color}40`, color: a.color }}>
              <a.icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{a.label}</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          ))}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 mb-6">
        {kpiCards.map((card) => (
          <Link key={card.label} href={card.href}
                className="card p-4 md:p-5 flex items-start gap-3 hover:scale-[1.02] transition-transform">
            <div className="p-2 md:p-2.5 rounded-xl flex-shrink-0"
                 style={{ background: `${card.color}18` }}>
              <card.icon className="w-4 h-4 md:w-5 md:h-5" style={{ color: card.color }} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium truncate" style={{ color: "var(--text-secondary)" }}>
                {card.label}
              </p>
              <p className="text-lg md:text-2xl font-bold mt-0.5 truncate" style={{ color: "var(--text-primary)" }}>
                {card.value}
              </p>
              <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{card.sub}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Receita últimos 6 meses */}
        <div className="card p-4 md:p-5 lg:col-span-2">
          <p className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            Receita — Últimos 6 Meses
          </p>
          {revenueChart.every((d) => d.value === 0) ? (
            <div className="h-40 flex items-center justify-center">
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>Nenhum pagamento registrado</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={revenueChart} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false}
                       tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                <Tooltip
                  formatter={(v: number | string | readonly (number | string)[] | undefined) => [formatCurrency(Number(v)), "Receita"]}
                  contentStyle={{
                    background: "var(--bg-card)", border: "1px solid var(--border)",
                    borderRadius: "0.5rem", fontSize: "12px", color: "var(--text-primary)",
                  }}
                  cursor={{ fill: "var(--bg-hover)" }}
                />
                <Bar dataKey="value" fill="var(--accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pizza contratos */}
        <div className="card p-4 md:p-5">
          <p className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
            Contratos por Status
          </p>
          {contractsPie.length === 0 ? (
            <div className="h-40 flex items-center justify-center">
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>Sem contratos</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={contractsPie} cx="50%" cy="45%" innerRadius={45} outerRadius={70}
                     dataKey="value" paddingAngle={3}>
                  {contractsPie.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number | string | readonly (number | string)[] | undefined, name: number | string | undefined) => [v, name]}
                  contentStyle={{
                    background: "var(--bg-card)", border: "1px solid var(--border)",
                    borderRadius: "0.5rem", fontSize: "12px", color: "var(--text-primary)",
                  }}
                />
                <Legend iconType="circle" iconSize={8}
                        formatter={(v) => <span style={{ color: "var(--text-secondary)", fontSize: "11px" }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Segunda linha: veículos + carteira */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Veículos */}
        <div className="card p-4 md:p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Estoque de Veículos
            </p>
            <Link href="/veiculos" className="text-xs flex items-center gap-1 hover:opacity-70"
                  style={{ color: "var(--accent)" }}>
              Ver todos <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {vehiclesPie.length === 0 ? (
            <p className="text-sm text-center py-4" style={{ color: "var(--text-muted)" }}>Sem veículos</p>
          ) : (
            <div className="space-y-2">
              {vehiclesPie.map((v) => (
                <div key={v.name} className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: v.color }} />
                  <span className="text-sm flex-1" style={{ color: "var(--text-secondary)" }}>{v.name}</span>
                  <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{v.value}</span>
                  <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-hover)" }}>
                    <div className="h-full rounded-full" style={{
                      background: v.color,
                      width: `${(v.value / vehiclesPie.reduce((a, x) => a + x.value, 0)) * 100}%`,
                    }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Carteira resumo */}
        <div className="card p-4 md:p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Carteira de Crédito
            </p>
            <Link href="/recebimentos" className="text-xs flex items-center gap-1 hover:opacity-70"
                  style={{ color: "var(--accent)" }}>
              Recebimentos <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3">
            {[
              { label: "Total Financiado",  value: kpis?.totalReceivable ?? 0, color: "#3b82f6", icon: FileText },
              { label: "Total Recebido",    value: kpis?.totalReceived ?? 0,   color: "#10b981", icon: CheckCircle },
              { label: "Saldo em Aberto",   value: kpis?.openBalance ?? 0, color: "#f59e0b", icon: Clock },
              { label: "Em Atraso",         value: kpis?.overdueValue ?? 0,    color: "#ef4444", icon: AlertTriangle },
            ].map(({ label, value, color, icon: Icon }) => (
              <div key={label} className="flex items-center gap-3 p-3 rounded-xl"
                   style={{ background: "var(--bg-hover)" }}>
                <Icon className="w-4 h-4 flex-shrink-0" style={{ color }} />
                <span className="text-sm flex-1" style={{ color: "var(--text-secondary)" }}>{label}</span>
                <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                  {formatCurrency(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
