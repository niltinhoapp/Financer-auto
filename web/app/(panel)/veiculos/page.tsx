"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getVehicles } from "@/lib/firestore/vehicles";
import { formatCurrency } from "@/lib/utils";
import type { Vehicle, VehicleStatus } from "@financer-auto/shared";
import { Plus, Search, Car } from "lucide-react";

const statusLabel: Record<VehicleStatus, string> = {
  available: "Disponível",
  reserved: "Reservado",
  sold: "Vendido",
  warranty: "Em Garantia",
};

const statusColor: Record<VehicleStatus, string> = {
  available: "bg-emerald-100 text-emerald-700",
  reserved: "bg-amber-100 text-amber-700",
  sold: "bg-gray-100 text-gray-600",
  warranty: "bg-blue-100 text-blue-700",
};

export default function VeiculosPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("");

  useEffect(() => {
    getVehicles()
      .then(setVehicles)
      .finally(() => setLoading(false));
  }, []);

  const filtered = vehicles.filter((v) => {
    const matchesSearch =
      !search ||
      `${v.brand} ${v.model} ${v.plate}`.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = !filterStatus || v.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Veículos</h1>
          <p className="text-gray-500 text-sm mt-1">{vehicles.length} cadastrados</p>
        </div>
        <Link
          href="/veiculos/novo"
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo Veículo
        </Link>
      </div>

      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por marca, modelo ou placa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos os status</option>
          <option value="available">Disponível</option>
          <option value="reserved">Reservado</option>
          <option value="sold">Vendido</option>
          <option value="warranty">Em Garantia</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Car className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>Nenhum veículo encontrado</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Veículo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Placa</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Ano</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Km</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Preço</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((v) => (
                <tr key={v.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {v.brand} {v.model}
                  </td>
                  <td className="px-4 py-3 text-gray-600 font-mono">{v.plate}</td>
                  <td className="px-4 py-3 text-gray-600">{v.year}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {v.mileage.toLocaleString("pt-BR")} km
                  </td>
                  <td className="px-4 py-3 text-gray-900 font-medium">
                    {formatCurrency(v.price)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${statusColor[v.status]}`}
                    >
                      {statusLabel[v.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/veiculos/${v.id}`}
                      className="text-blue-600 hover:text-blue-700 text-xs font-medium"
                    >
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
