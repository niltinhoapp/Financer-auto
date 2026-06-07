"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { createVehicle } from "@/lib/firestore/vehicles";
import type { VehicleType } from "@financer-auto/shared";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NovoVeiculoPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    type: "car" as VehicleType,
    brand: "",
    model: "",
    year: new Date().getFullYear(),
    color: "",
    plate: "",
    chassis: "",
    mileage: 0,
    price: 0,
    purchasePrice: 0,
    features: "",
  });

  function set(key: string, value: unknown) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError("");
    try {
      const id = await createVehicle({
        ...form,
        status: "available",
        photos: [],
        createdBy: user.uid,
      });
      router.push(`/veiculos/${id}`);
    } catch {
      setError("Erro ao salvar veículo. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/veiculos" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Novo Veículo</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
            <select
              value={form.type}
              onChange={(e) => set("type", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="car">Carro</option>
              <option value="motorcycle">Moto</option>
              <option value="truck">Caminhão</option>
              <option value="utility">Utilitário</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Placa</label>
            <input
              type="text"
              value={form.plate}
              onChange={(e) => set("plate", e.target.value.toUpperCase())}
              required
              maxLength={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="ABC-1234"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Marca</label>
            <input
              type="text"
              value={form.brand}
              onChange={(e) => set("brand", e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Toyota, Honda, Ford..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Modelo</label>
            <input
              type="text"
              value={form.model}
              onChange={(e) => set("model", e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Corolla, Civic, Ka..."
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ano</label>
            <input
              type="number"
              value={form.year}
              onChange={(e) => set("year", Number(e.target.value))}
              required
              min={1950}
              max={new Date().getFullYear() + 1}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cor</label>
            <input
              type="text"
              value={form.color}
              onChange={(e) => set("color", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Prata, Preto..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quilometragem</label>
            <input
              type="number"
              value={form.mileage}
              onChange={(e) => set("mileage", Number(e.target.value))}
              min={0}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Chassi</label>
          <input
            type="text"
            value={form.chassis}
            onChange={(e) => set("chassis", e.target.value.toUpperCase())}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="17 caracteres"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Preço de Compra (R$)</label>
            <input
              type="number"
              value={form.purchasePrice}
              onChange={(e) => set("purchasePrice", Number(e.target.value))}
              min={0}
              step={0.01}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Preço de Venda (R$)</label>
            <input
              type="number"
              value={form.price}
              onChange={(e) => set("price", Number(e.target.value))}
              required
              min={0}
              step={0.01}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Opcionais / Observações</label>
          <textarea
            value={form.features}
            onChange={(e) => set("features", e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Ar condicionado, direção hidráulica, rodas de liga..."
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Link
            href="/veiculos"
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Salvando..." : "Salvar Veículo"}
          </button>
        </div>
      </form>
    </div>
  );
}
