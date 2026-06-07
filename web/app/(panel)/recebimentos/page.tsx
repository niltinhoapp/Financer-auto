"use client";

import { useEffect, useState } from "react";
import { collectionGroup, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { formatCurrency, formatDate, daysBetween, todayISO } from "@/lib/utils";
import { calcularValorAtualizado } from "@/lib/financiamento";
import { DollarSign, AlertTriangle, CheckCircle, Clock } from "lucide-react";

interface InstallmentRow {
  id: string;
  contractId: string;
  number: number;
  dueDate: string;
  value: number;
  status: string;
  paidAt?: string;
  paidAmount?: number;
  customerName?: string;
  penaltyRate?: number;
  dailyRate?: number;
}

export default function RecebimentosPage() {
  const [rows, setRows] = useState<InstallmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pending" | "overdue" | "paid">("pending");

  useEffect(() => {
    async function load() {
      const snap = await getDocs(
        query(collectionGroup(db, "installments"), orderBy("dueDate", "asc"))
      );
      const data = snap.docs.map((d) => ({
        id: d.id,
        contractId: d.ref.parent.parent!.id,
        ...d.data(),
      })) as InstallmentRow[];
      setRows(data);
      setLoading(false);
    }
    load();
  }, []);

  const today = todayISO();

  const filtered = rows.filter((r) => {
    if (tab === "paid") return r.status === "paid";
    if (tab === "overdue") return r.status !== "paid" && r.dueDate < today;
    return r.status === "pending" && r.dueDate >= today;
  });

  const totalPending = rows
    .filter((r) => r.status !== "paid")
    .reduce((acc, r) => acc + r.value, 0);
  const totalReceived = rows
    .filter((r) => r.status === "paid")
    .reduce((acc, r) => acc + (r.paidAmount ?? r.value), 0);
  const totalOverdue = rows
    .filter((r) => r.status !== "paid" && r.dueDate < today)
    .reduce((acc, r) => acc + r.value, 0);

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Contas a Receber</h1>
        <p className="text-gray-500 text-sm mt-1">Carteira completa de parcelas</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-start gap-4">
          <div className="bg-amber-100 p-3 rounded-lg">
            <Clock className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">A Receber</p>
            <p className="text-xl font-bold text-gray-900">{formatCurrency(totalPending)}</p>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-start gap-4">
          <div className="bg-emerald-100 p-3 rounded-lg">
            <CheckCircle className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Total Recebido</p>
            <p className="text-xl font-bold text-gray-900">{formatCurrency(totalReceived)}</p>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-start gap-4">
          <div className="bg-red-100 p-3 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <p className="text-xs text-gray-500">Em Atraso</p>
            <p className="text-xl font-bold text-red-600">{formatCurrency(totalOverdue)}</p>
          </div>
        </div>
      </div>

      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg w-fit">
        {(["pending", "overdue", "paid"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
            }`}
          >
            {t === "pending" ? "A Vencer" : t === "overdue" ? "Em Atraso" : "Pagas"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Contrato</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Parcela</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Vencimento</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Valor Original</th>
                {tab === "overdue" && (
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Valor Atualizado</th>
                )}
                {tab === "paid" && (
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Pago em</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((r) => {
                const dias = daysBetween(r.dueDate, today);
                const atualizado =
                  tab === "overdue"
                    ? calcularValorAtualizado(r.value, dias, r.penaltyRate ?? 2, r.dailyRate ?? 0.1)
                    : r.value;
                return (
                  <tr key={`${r.contractId}-${r.id}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">
                      {r.contractId.slice(0, 8)}...
                    </td>
                    <td className="px-4 py-3 text-gray-600">#{r.number}</td>
                    <td className="px-4 py-3 text-gray-700">{formatDate(r.dueDate)}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {formatCurrency(r.value)}
                    </td>
                    {tab === "overdue" && (
                      <td className="px-4 py-3 font-bold text-red-600">
                        {formatCurrency(atualizado)}
                        <span className="text-xs font-normal text-red-400 ml-1">
                          ({dias}d)
                        </span>
                      </td>
                    )}
                    {tab === "paid" && (
                      <td className="px-4 py-3 text-gray-500">
                        {r.paidAt ? formatDate(r.paidAt.split("T")[0]) : "—"}
                      </td>
                    )}
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-gray-400 text-sm"
                  >
                    <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    Nenhum registro encontrado
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
