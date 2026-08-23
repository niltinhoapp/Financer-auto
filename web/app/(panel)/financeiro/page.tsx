"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, collectionGroup } from "firebase/firestore";
import * as Sentry from "@sentry/nextjs";
import { db } from "@/lib/firebase";
import { getExpenses, createExpense, deleteExpense } from "@/lib/firestore/expenses";
import { formatCurrency, formatDate, todayISO } from "@/lib/utils";
import { todasReceitas } from "@/lib/receitas";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui/Toast";
import type { Expense, ExpenseCategory, Payment, Contract, Installment } from "@financer-auto/shared";
import {
  Wallet, TrendingUp, TrendingDown, Plus, Trash2, Receipt,
  FileText, AlertTriangle, ArrowRight,
} from "lucide-react";
import Link from "next/link";

const categoryLabels: Record<ExpenseCategory, string> = {
  manutencao_veiculo: "Manutenção de Veículo",
  combustivel: "Combustível",
  aluguel: "Aluguel",
  salarios: "Salários",
  marketing: "Marketing",
  documentacao: "Documentação",
  impostos: "Impostos",
  compra_veiculo: "Compra de Veículo",
  outros: "Outros",
};

const categoryColors: Record<ExpenseCategory, string> = {
  manutencao_veiculo: "#3b82f6",
  combustivel: "#f59e0b",
  aluguel: "#8b5cf6",
  salarios: "#06b6d4",
  marketing: "#ec4899",
  documentacao: "#64748b",
  impostos: "#ef4444",
  compra_veiculo: "#10b981",
  outros: "#6b7280",
};

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const meses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  return `${meses[Number(m) - 1]} de ${y}`;
}

export default function FinanceiroPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [overdueCount, setOverdueCount] = useState(0);
  const [overdueValue, setOverdueValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => todayISO().slice(0, 7)); // YYYY-MM
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    description: "",
    category: "outros" as ExpenseCategory,
    amount: 0,
    date: todayISO(),
    notes: "",
  });

  async function load() {
    setLoading(true);
    try {
      const [exps, paySnap, contractsSnap, installmentsSnap] = await Promise.all([
        getExpenses(),
        getDocs(collection(db, "payments")),
        getDocs(collection(db, "contracts")),
        getDocs(collectionGroup(db, "installments")),
      ]);
      setExpenses(exps);
      setPayments(paySnap.docs.map((d) => ({ id: d.id, ...d.data() } as Payment)));
      setContracts(contractsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Contract)));

      const today = todayISO();
      const installments = installmentsSnap.docs.map((d) => d.data() as Installment);
      const overdue = installments.filter((i) => i.status !== "paid" && i.status !== "renegotiated" && i.dueDate < today);
      setOverdueCount(overdue.length);
      setOverdueValue(overdue.reduce((a, i) => a + (i.value || 0), 0));
    } catch (e) {
      console.error("Erro ao carregar dados financeiros:", e);
      Sentry.captureException(e);
      toast("Não foi possível carregar os dados financeiros. Tente novamente.", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    Promise.resolve().then(() => load());
  }, []);

  const expensesMonth = useMemo(
    () => expenses.filter((e) => e.date.startsWith(month)),
    [expenses, month]
  );
  // Receitas reais = pagamentos de parcelas + entradas em dinheiro dos contratos
  const receitasMonth = useMemo(
    () => todasReceitas(payments, contracts).filter((r) => r.paidAt.startsWith(month)),
    [payments, contracts, month]
  );

  const totalReceitas = receitasMonth.reduce((a, r) => a + r.amount, 0);
  const totalDespesas = expensesMonth.reduce((a, e) => a + e.amount, 0);
  const saldo = totalReceitas - totalDespesas;

  // Resumo geral do negócio (independe do mês selecionado)
  const activeContracts = contracts.filter((c) => c.status === "active").length;
  const salesThisMonth = contracts.filter((c) => (c.createdAt ?? "").slice(0, 7) === month).length;

  // Agrupado por categoria
  const porCategoria: Record<string, number> = {};
  for (const e of expensesMonth) {
    porCategoria[e.category] = (porCategoria[e.category] ?? 0) + e.amount;
  }

  // DRE simplificado — cálculo derivado dos mesmos dados acima, sem nenhuma
  // estrutura nova. "compra_veiculo" é tratado como custo direto (o que foi
  // gasto pra adquirir o estoque vendido); as demais categorias de despesa
  // são operacionais.
  const custoAquisicao = porCategoria["compra_veiculo"] ?? 0;
  const despesasOperacionais = totalDespesas - custoAquisicao;
  const lucroBruto = totalReceitas - custoAquisicao;
  const resultadoLiquido = lucroBruto - despesasOperacionais;

  async function handleSave() {
    if (!user || !form.description.trim() || form.amount <= 0) return;
    setSaving(true);
    try {
      await createExpense({
        description: form.description.trim(),
        category: form.category,
        amount: form.amount,
        date: form.date,
        ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
        createdBy: user.uid,
      });
      setShowModal(false);
      setForm({ description: "", category: "outros", amount: 0, date: todayISO(), notes: "" });
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir esta despesa?")) return;
    await deleteExpense(id);
    await load();
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
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Fluxo de Caixa</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>{monthLabel(month)}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month" value={month} onChange={(e) => setMonth(e.target.value)}
            className="px-3 py-2.5 rounded-xl text-sm"
            style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
          />
          {user?.role === "admin" && (
            <button onClick={() => setShowModal(true)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
                    style={{ background: "var(--accent-gradient)" }}>
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Nova Despesa</span>
            </button>
          )}
        </div>
      </div>

      {/* Resumo geral do negócio */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Link href="/contratos" className="card p-4 hover:scale-[1.02] transition-transform">
          <p className="text-xs mb-1 flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
            <FileText className="w-3.5 h-3.5" /> Contratos Ativos
          </p>
          <p className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{activeContracts}</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{contracts.length} no total</p>
        </Link>
        <Link href="/contratos" className="card p-4 hover:scale-[1.02] transition-transform">
          <p className="text-xs mb-1 flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
            <TrendingUp className="w-3.5 h-3.5" /> Vendas no Mês
          </p>
          <p className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{salesThisMonth}</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>novos contratos</p>
        </Link>
        <Link href="/recebimentos" className="card p-4 hover:scale-[1.02] transition-transform">
          <p className="text-xs mb-1 flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
            <AlertTriangle className="w-3.5 h-3.5" /> Parcelas em Atraso
          </p>
          <p className="text-lg font-bold" style={{ color: overdueCount > 0 ? "#ef4444" : "var(--text-primary)" }}>{overdueCount}</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{formatCurrency(overdueValue)}</p>
        </Link>
        <Link href="/dashboard" className="card p-4 hover:scale-[1.02] transition-transform flex flex-col justify-between">
          <p className="text-xs mb-1 flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
            <Wallet className="w-3.5 h-3.5" /> Painel completo
          </p>
          <p className="text-sm font-medium flex items-center gap-1" style={{ color: "var(--accent)" }}>
            Ver dashboard <ArrowRight className="w-3.5 h-3.5" />
          </p>
        </Link>
      </div>

      {/* KPIs do mês */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <div className="card p-4">
          <p className="text-xs mb-1 flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
            <TrendingUp className="w-3.5 h-3.5" /> Receitas (recebimentos)
          </p>
          <p className="text-lg font-bold" style={{ color: "#10b981" }}>{formatCurrency(totalReceitas)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs mb-1 flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
            <TrendingDown className="w-3.5 h-3.5" /> Despesas
          </p>
          <p className="text-lg font-bold" style={{ color: "#ef4444" }}>{formatCurrency(totalDespesas)}</p>
        </div>
        <div className="card p-4 col-span-2 md:col-span-1">
          <p className="text-xs mb-1 flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
            <Wallet className="w-3.5 h-3.5" /> Saldo do mês
          </p>
          <p className="text-lg font-bold" style={{ color: saldo >= 0 ? "var(--text-primary)" : "#ef4444" }}>
            {formatCurrency(saldo)}
          </p>
        </div>
      </div>

      {/* DRE simplificado — derivado das receitas/despesas do mês acima */}
      <div className="card p-4 mb-6">
        <p className="text-sm font-semibold mb-3" style={{ color: "var(--text-secondary)" }}>DRE Simplificado</p>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span style={{ color: "var(--text-secondary)" }}>Receita Bruta</span>
            <span className="font-medium" style={{ color: "var(--text-primary)" }}>{formatCurrency(totalReceitas)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span style={{ color: "var(--text-secondary)" }}>(-) Custo de Aquisição de Veículos</span>
            <span className="font-medium" style={{ color: "#ef4444" }}>{formatCurrency(custoAquisicao)}</span>
          </div>
          <div className="flex items-center justify-between pt-2" style={{ borderTop: "1px solid var(--border)" }}>
            <span className="font-semibold" style={{ color: "var(--text-primary)" }}>= Lucro Bruto</span>
            <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{formatCurrency(lucroBruto)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span style={{ color: "var(--text-secondary)" }}>(-) Despesas Operacionais</span>
            <span className="font-medium" style={{ color: "#ef4444" }}>{formatCurrency(despesasOperacionais)}</span>
          </div>
          <div className="flex items-center justify-between pt-2" style={{ borderTop: "1px solid var(--border)" }}>
            <span className="font-bold" style={{ color: "var(--text-primary)" }}>= Resultado Líquido do Mês</span>
            <span className="font-bold" style={{ color: resultadoLiquido >= 0 ? "#10b981" : "#ef4444" }}>
              {formatCurrency(resultadoLiquido)}
            </span>
          </div>
        </div>
        <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>
          Calculado a partir das receitas e despesas do mês selecionado acima — não altera nem duplica nenhum dado.
        </p>
      </div>

      {/* Por categoria */}
      {Object.keys(porCategoria).length > 0 && (
        <div className="card p-4 mb-6">
          <p className="text-sm font-semibold mb-3" style={{ color: "var(--text-secondary)" }}>Despesas por categoria</p>
          <div className="space-y-2">
            {Object.entries(porCategoria)
              .sort((a, b) => b[1] - a[1])
              .map(([cat, valor]) => (
                <div key={cat} className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: categoryColors[cat as ExpenseCategory] }} />
                  <span className="text-xs flex-1" style={{ color: "var(--text-secondary)" }}>{categoryLabels[cat as ExpenseCategory] ?? cat}</span>
                  <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{formatCurrency(valor)}</span>
                  <span className="text-xs w-12 text-right" style={{ color: "var(--text-muted)" }}>
                    {totalDespesas > 0 ? Math.round((valor / totalDespesas) * 100) : 0}%
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Lista de despesas */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <h2 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>Despesas do mês</h2>
        </div>
        {expensesMonth.length === 0 ? (
          <div className="py-14 text-center">
            <Receipt className="w-10 h-10 mx-auto mb-3 opacity-20" style={{ color: "var(--text-muted)" }} />
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Nenhuma despesa lançada neste mês</p>
          </div>
        ) : (
          <div>
            {expensesMonth.map((e) => (
              <div key={e.id} className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: categoryColors[e.category] }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{e.description}</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {categoryLabels[e.category] ?? e.category} · {formatDate(e.date)}
                  </p>
                </div>
                <p className="font-bold text-sm flex-shrink-0" style={{ color: "#ef4444" }}>-{formatCurrency(e.amount)}</p>
                {user?.role === "admin" && (
                  <button onClick={() => handleDelete(e.id)} aria-label="Excluir despesa" className="flex-shrink-0 p-1.5 rounded-lg hover:opacity-70"
                          style={{ color: "var(--text-muted)" }}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal nova despesa */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
             style={{ background: "rgba(0,0,0,.6)" }}>
          <div className="card w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>Nova Despesa</h3>
              <button onClick={() => setShowModal(false)} style={{ color: "var(--text-muted)" }}>✕</button>
            </div>

            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>Descrição</label>
              <input type="text" value={form.description}
                     onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                     placeholder="Ex: Troca de óleo do Gol 2018"
                     className="w-full px-3 py-2.5 rounded-xl text-sm"
                     style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>Categoria</label>
                <select value={form.category}
                        onChange={(e) => setForm((p) => ({ ...p, category: e.target.value as ExpenseCategory }))}
                        className="w-full px-3 py-2.5 rounded-xl text-sm"
                        style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                  {Object.entries(categoryLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>Valor (R$)</label>
                <input type="number" step={0.01} value={form.amount || ""} placeholder="0,00"
                       onChange={(e) => setForm((p) => ({ ...p, amount: Number(e.target.value) }))}
                       className="w-full px-3 py-2.5 rounded-xl text-sm"
                       style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>Data</label>
              <input type="date" value={form.date}
                     onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                     className="w-full px-3 py-2.5 rounded-xl text-sm"
                     style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
            </div>

            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>Observações (opcional)</label>
              <input type="text" value={form.notes}
                     onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                     className="w-full px-3 py-2.5 rounded-xl text-sm"
                     style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
            </div>

            <div className="flex gap-2">
              <button onClick={() => setShowModal(false)}
                      className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                      style={{ background: "var(--bg-hover)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving || !form.description.trim() || form.amount <= 0}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                      style={{ background: "var(--accent-gradient)" }}>
                {saving ? "Salvando..." : "Lançar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
