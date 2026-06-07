"use client";

import { useEffect, useState } from "react";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { getCustomer } from "@/lib/firestore/customers";
import { getContract, getInstallments } from "@/lib/firestore/contracts";
import { formatCurrency, formatDate, daysBetween, todayISO } from "@/lib/utils";
import { calcularValorAtualizado } from "@/lib/financiamento";
import type { Contract, Installment, Customer } from "@financer-auto/shared";
import {
  Car, FileText, CheckCircle, Clock, AlertCircle,
  DollarSign, TrendingUp, Calendar,
} from "lucide-react";

const statusConfig = {
  pending:      { label: "A vencer",  cls: "bg-amber-100 text-amber-700",   icon: Clock },
  paid:         { label: "Pago",      cls: "bg-emerald-100 text-emerald-700", icon: CheckCircle },
  overdue:      { label: "Atrasado",  cls: "bg-red-100 text-red-700",       icon: AlertCircle },
  renegotiated: { label: "Renegoc.",  cls: "bg-gray-100 text-gray-600",     icon: FileText },
};

export default function MinhaAreaPage() {
  const { user } = useAuth();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [contract, setContract] = useState<Contract | null>(null);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"parcelas" | "historico">("parcelas");

  useEffect(() => {
    if (!user) return;
    async function load() {
      // Busca o documento do cliente vinculado ao uid
      const userDoc = await import("firebase/firestore").then(({ getDoc, doc }) =>
        getDoc(doc(db, "users", user!.uid))
      );
      const customerId = userDoc.data()?.customerId;
      if (!customerId) { setLoading(false); return; }

      const cust = await getCustomer(customerId);
      setCustomer(cust);

      // Busca o contrato ativo do cliente
      const q = query(
        collection(db, "contracts"),
        where("customerId", "==", customerId),
        where("status", "in", ["active", "settled"]),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const c = { id: snap.docs[0].id, ...snap.docs[0].data() } as Contract;
        setContract(c);
        const inst = await getInstallments(c.id);
        setInstallments(inst);
      }
      setLoading(false);
    }
    load();
  }, [user]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="text-center py-20">
        <Car className="w-12 h-12 mx-auto mb-4 text-gray-300" />
        <h2 className="text-lg font-semibold text-gray-700">Nenhum contrato encontrado</h2>
        <p className="text-sm text-gray-500 mt-1">Entre em contato com a revenda para mais informações.</p>
      </div>
    );
  }

  const today = todayISO();
  const paidInstallments = installments.filter((i) => i.status === "paid");
  const pendingInstallments = installments.filter((i) => i.status !== "paid");
  const totalPaid = paidInstallments.reduce((acc, i) => acc + (i.paidAmount ?? i.value), 0);
  const totalRemaining = pendingInstallments.reduce((acc, i) => acc + i.value, 0);
  const overdueCount = installments.filter((i) => i.status !== "paid" && i.dueDate < today).length;
  const nextInstallment = installments.find((i) => i.status !== "paid" && i.dueDate >= today);

  const progressPct = Math.round((paidInstallments.length / installments.length) * 100);

  return (
    <div className="space-y-6">

      {/* Alerta de inadimplência */}
      {overdueCount > 0 && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-800 text-sm">
              {overdueCount} parcela{overdueCount > 1 ? "s" : ""} em atraso
            </p>
            <p className="text-xs text-red-600 mt-0.5">
              Juros e multa estão sendo aplicados. Entre em contato para regularizar.
            </p>
          </div>
        </div>
      )}

      {/* Card do contrato */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Car className="w-5 h-5 text-blue-600" />
          <h2 className="font-bold text-gray-900">Meu Contrato</h2>
          <span className={`ml-auto text-xs font-medium px-2.5 py-1 rounded-full ${
            contract.status === "settled"
              ? "bg-emerald-100 text-emerald-700"
              : "bg-blue-100 text-blue-700"
          }`}>
            {contract.status === "settled" ? "Quitado" : "Ativo"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-500">Valor de Venda</p>
            <p className="font-semibold text-gray-900">{formatCurrency(contract.salePrice)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Entrada</p>
            <p className="font-semibold text-gray-900">{formatCurrency(contract.downPayment)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Parcelas</p>
            <p className="font-semibold text-gray-900">
              {contract.installmentsCount}x {formatCurrency(contract.installmentValue)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Taxa de Juros</p>
            <p className="font-semibold text-gray-900">{contract.interestRate}% a.m.</p>
          </div>
        </div>

        {/* Progresso */}
        <div className="mt-5">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>{paidInstallments.length} de {installments.length} parcelas pagas</span>
            <span>{progressPct}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <DollarSign className="w-5 h-5 mx-auto mb-1 text-emerald-500" />
          <p className="text-xs text-gray-500">Total Pago</p>
          <p className="font-bold text-gray-900 text-sm">{formatCurrency(totalPaid)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <TrendingUp className="w-5 h-5 mx-auto mb-1 text-amber-500" />
          <p className="text-xs text-gray-500">Restante</p>
          <p className="font-bold text-gray-900 text-sm">{formatCurrency(totalRemaining)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <Calendar className="w-5 h-5 mx-auto mb-1 text-blue-500" />
          <p className="text-xs text-gray-500">Próx. Venc.</p>
          <p className="font-bold text-gray-900 text-sm">
            {nextInstallment ? formatDate(nextInstallment.dueDate) : "—"}
          </p>
        </div>
      </div>

      {/* Tabs parcelas / histórico */}
      <div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-4">
          {(["parcelas", "historico"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
              }`}
            >
              {t === "parcelas" ? "Minhas Parcelas" : "Histórico de Pagamentos"}
            </button>
          ))}
        </div>

        {tab === "parcelas" && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">#</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Vencimento</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Valor</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {installments.map((inst) => {
                  const dias = inst.status !== "paid" ? daysBetween(inst.dueDate, today) : 0;
                  const valorAtual = dias > 0
                    ? calcularValorAtualizado(inst.value, dias, contract.penaltyRate, contract.dailyInterestRate)
                    : inst.value;
                  const cfg = statusConfig[inst.status] ?? statusConfig.pending;
                  const Icon = cfg.icon;
                  return (
                    <tr key={inst.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500">{inst.number}</td>
                      <td className="px-4 py-3 text-gray-700">{formatDate(inst.dueDate)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-medium text-gray-900">{formatCurrency(valorAtual)}</span>
                        {dias > 0 && (
                          <span className="block text-xs text-red-500">{dias}d de atraso</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.cls}`}>
                          <Icon className="w-3 h-3" /> {cfg.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {tab === "historico" && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {paidInstallments.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <CheckCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhum pagamento registrado ainda</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Parcela</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Pago em</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Valor Pago</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Forma</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paidInstallments.map((inst) => (
                    <tr key={inst.id}>
                      <td className="px-4 py-3 text-gray-700">#{inst.number}</td>
                      <td className="px-4 py-3 text-gray-700">
                        {inst.paidAt ? formatDate(inst.paidAt.split("T")[0]) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-700">
                        {formatCurrency(inst.paidAmount ?? inst.value)}
                      </td>
                      <td className="px-4 py-3 text-gray-500 capitalize">
                        {inst.paymentMethod === "cash" ? "Dinheiro"
                          : inst.paymentMethod === "pix" ? "PIX"
                          : inst.paymentMethod === "credit_card" ? "Cartão"
                          : inst.paymentMethod === "transfer" ? "Transferência"
                          : inst.paymentMethod ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
