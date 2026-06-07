"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getVehicle, updateVehicleStatus } from "@/lib/firestore/vehicles";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency } from "@/lib/utils";
import type { Vehicle, VehicleStatus } from "@financer-auto/shared";
import { ArrowLeft, Car, Gauge, Calendar, Palette, Hash, Tag } from "lucide-react";

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

const typeLabel: Record<string, string> = {
  car: "Carro",
  motorcycle: "Moto",
  truck: "Caminhão",
  utility: "Utilitário",
};

export default function VeiculoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  async function load() {
    if (!id) return;
    const v = await getVehicle(id);
    setVehicle(v);
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);

  async function handleStatusChange(status: VehicleStatus) {
    if (!vehicle) return;
    setUpdating(true);
    await updateVehicleStatus(vehicle.id, status);
    await load();
    setUpdating(false);
  }

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="p-8 text-center text-gray-400">
        <Car className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p>Veículo não encontrado.</p>
        <Link href="/veiculos" className="text-blue-600 text-sm hover:underline mt-2 inline-block">
          Voltar para a lista
        </Link>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/veiculos" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {vehicle.brand} {vehicle.model} <span className="text-gray-400 font-normal">{vehicle.year}</span>
          </h1>
          <p className="text-xs text-gray-500 mt-0.5 font-mono">{vehicle.plate}</p>
        </div>
        <span className={`ml-auto inline-flex px-3 py-1 rounded-full text-xs font-medium ${statusColor[vehicle.status]}`}>
          {statusLabel[vehicle.status]}
        </span>
      </div>

      {/* Foto placeholder */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center mb-4">
          <Car className="w-16 h-16 text-gray-300" />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">Tipo</p>
              <p className="font-medium text-gray-800">{typeLabel[vehicle.type] ?? vehicle.type}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Palette className="w-4 h-4 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">Cor</p>
              <p className="font-medium text-gray-800">{vehicle.color || "—"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">Quilometragem</p>
              <p className="font-medium text-gray-800">{vehicle.mileage.toLocaleString("pt-BR")} km</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">Ano</p>
              <p className="font-medium text-gray-800">{vehicle.year}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Hash className="w-4 h-4 text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">Chassi</p>
              <p className="font-medium text-gray-800 font-mono text-xs">{vehicle.chassis || "—"}</p>
            </div>
          </div>
        </div>

        {vehicle.features && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-500 mb-1">Opcionais / Observações</p>
            <p className="text-sm text-gray-700">{vehicle.features}</p>
          </div>
        )}
      </div>

      {/* Preços */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Preço de Compra</p>
          <p className="text-lg font-bold text-gray-900">{formatCurrency(vehicle.purchasePrice)}</p>
        </div>
        <div className="bg-emerald-50 rounded-xl border border-emerald-100 p-4">
          <p className="text-xs text-emerald-700">Preço de Venda</p>
          <p className="text-lg font-bold text-emerald-800">{formatCurrency(vehicle.price)}</p>
        </div>
      </div>

      {/* Mudança de status — admin/vendedor */}
      {(user?.role === "admin" || user?.role === "seller") && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Alterar Status</h2>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(statusLabel) as VehicleStatus[]).map((s) => (
              <button
                key={s}
                disabled={updating || vehicle.status === s}
                onClick={() => handleStatusChange(s)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  vehicle.status === s
                    ? statusColor[s]
                    : "border border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {statusLabel[s]}
              </button>
            ))}
          </div>
          {vehicle.status === "sold" && (
            <p className="text-xs text-gray-400 mt-3">
              Este veículo está vendido — o status normalmente é definido automaticamente ao criar um contrato.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
