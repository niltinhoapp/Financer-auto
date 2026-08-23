"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getContracts } from "@/lib/firestore/contracts";
import { getCustomers } from "@/lib/firestore/customers";
import { getVehicles } from "@/lib/firestore/vehicles";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Contract, Customer, Vehicle } from "@financer-auto/shared";
import { Plus, FileText } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { excluirContratoFn } from "@/lib/functions";
import { useSelecaoExclusao, CheckExclusao } from "@/components/admin/SelecaoExclusao";

const statusLabel: Record<string, string> = {
  active: "Ativo",
  settled: "Quitado",
  defaulted: "Inadimplente",
  renegotiated: "Renegociado",
};

const statusColor: Record<string, string> = {
  active: "bg-blue-100 text-blue-700",
  settled: "bg-emerald-100 text-emerald-700",
  defaulted: "bg-red-100 text-red-700",
  renegotiated: "bg-amber-100 text-amber-700",
};

export default function ContratosPage() {
  const { user } = useAuth();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [customers, setCustomers] = useState<Record<string, Customer>>({});
  const [vehicles, setVehicles] = useState<Record<string, Vehicle>>({});
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("");

  async function load() {
    const filters = user?.role === "seller" ? { sellerId: user!.uid } : {};
    const [contracts, customerList, vehicleList] = await Promise.all([
      getContracts(filters),
      getCustomers(),
      getVehicles(),
    ]);
    setContracts(contracts);
    setCustomers(Object.fromEntries(customerList.map((c) => [c.id, c])));
    setVehicles(Object.fromEntries(vehicleList.map((v) => [v.id, v])));
    setLoading(false);
  }

  useEffect(() => {
    if (user) Promise.resolve().then(() => load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const sel = useSelecaoExclusao(
    async (id) => { await excluirContratoFn({ contractId: id }); },
    load
  );

  const filtered = contracts.filter(
    (c) => !filterStatus || c.status === filterStatus
  );

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contratos</h1>
          <p className="text-gray-500 text-sm mt-1">{contracts.length} contratos</p>
        </div>
        <div className="flex items-center gap-2">
          {user?.role === "admin" && <sel.ToggleButton />}
          <Link
            href="/contratos/novo"
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nova Venda
          </Link>
        </div>
      </div>

      <div className="mb-6">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos os status</option>
          <option value="active">Ativo</option>
          <option value="settled">Quitado</option>
          <option value="defaulted">Inadimplente</option>
          <option value="renegotiated">Renegociado</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>Nenhum contrato encontrado</p>
        </div>
      ) : (
        <>
          {/* Cards — mobile */}
          <div className="space-y-2 md:hidden">
            {filtered.map((c) => {
              const customer = customers[c.customerId];
              const vehicle = vehicles[c.vehicleId];
              return (
                <Link key={c.id} href={`/contratos/${c.id}`}
                      onClick={(e) => { if (sel.selecting) { e.preventDefault(); sel.toggle(c.id); } }}
                      className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3 hover:bg-gray-50 transition-colors block">
                  {sel.selecting && (
                    <CheckExclusao checked={sel.isSelected(c.id)} onChange={() => sel.toggle(c.id)} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-sm text-gray-900 truncate">
                        {customer?.name ?? "—"}
                      </p>
                      <span
                        className={`flex-shrink-0 inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[c.status]}`}
                      >
                        {statusLabel[c.status]}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {vehicle ? `${vehicle.brand} ${vehicle.model}` : "—"}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs font-medium text-gray-900">{formatCurrency(c.salePrice)}</span>
                      <span className="text-xs text-gray-500">
                        {c.installmentsCount}x {formatCurrency(c.installmentValue)}
                      </span>
                      <span className="text-xs text-gray-500">{formatDate(c.createdAt.split("T")[0])}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Tabela — desktop */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto hidden md:block">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {sel.selecting && <th className="px-4 py-3 w-8" />}
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Cliente</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Veículo</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Valor</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Parcelas</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Início</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((c) => {
                  const customer = customers[c.customerId];
                  const vehicle = vehicles[c.vehicleId];
                  return (
                    <tr key={c.id} className="hover:bg-gray-50"
                        style={{ cursor: sel.selecting ? "pointer" : undefined }}
                        onClick={() => sel.selecting && sel.toggle(c.id)}>
                      {sel.selecting && (
                        <td className="px-4 py-3">
                          <CheckExclusao checked={sel.isSelected(c.id)} onChange={() => sel.toggle(c.id)} />
                        </td>
                      )}
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {customer?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {vehicle ? `${vehicle.brand} ${vehicle.model}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-900 font-medium">
                        {formatCurrency(c.salePrice)}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {c.installmentsCount}x {formatCurrency(c.installmentValue)}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {formatDate(c.createdAt.split("T")[0])}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${statusColor[c.status]}`}
                        >
                          {statusLabel[c.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/contratos/${c.id}`}
                          className="text-blue-600 hover:text-blue-700 text-xs font-medium"
                        >
                          Ver
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <sel.Bar itemLabel="contrato(s)" />
    </div>
  );
}
