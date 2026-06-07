"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { getCustomers } from "@/lib/firestore/customers";
import { getVehicles } from "@/lib/firestore/vehicles";
import { createContract } from "@/lib/firestore/contracts";
import { calcularResumoFinanciamento, gerarCronograma } from "@/lib/financiamento";
import { formatCurrency, todayISO } from "@/lib/utils";
import type { Customer, Vehicle } from "@financer-auto/shared";
import { ArrowLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

const inputCls =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

type Step = 1 | 2 | 3 | 4;

export default function NovoContratoPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [vehicleSearch, setVehicleSearch] = useState("");

  const [financiamento, setFinanciamento] = useState({
    entrada: 0,
    parcelas: 12,
    taxaMensal: 2.5,
    primeiroVencimento: "",
    multa: 2,
    jurosDiario: 0.1,
    notas: "",
  });

  useEffect(() => {
    // Set default first due date to next month
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    d.setDate(1);
    setFinanciamento((prev) => ({
      ...prev,
      primeiroVencimento: d.toISOString().split("T")[0],
    }));
    Promise.all([getCustomers(), getVehicles("available")]).then(([c, v]) => {
      setCustomers(c);
      setVehicles(v);
    });
  }, []);

  const preco = selectedVehicle?.price ?? 0;
  const resumo = calcularResumoFinanciamento(
    preco,
    financiamento.entrada,
    financiamento.taxaMensal,
    financiamento.parcelas
  );
  const cronograma = selectedVehicle
    ? gerarCronograma({
        valorFinanciado: resumo.valorFinanciado,
        taxaMensal: financiamento.taxaMensal,
        numeroParcelas: financiamento.parcelas,
        primeiroVencimento: financiamento.primeiroVencimento,
        multaPerc: financiamento.multa,
        jurosDiarioPerc: financiamento.jurosDiario,
      })
    : [];

  async function handleSave() {
    if (!user || !selectedCustomer || !selectedVehicle) return;
    setSaving(true);
    setError("");
    try {
      const id = await createContract({
        customerId: selectedCustomer.id,
        vehicleId: selectedVehicle.id,
        sellerId: user.uid,
        salePrice: preco,
        downPayment: financiamento.entrada,
        financedAmount: resumo.valorFinanciado,
        installmentsCount: financiamento.parcelas,
        installmentValue: resumo.valorParcela,
        firstDueDate: financiamento.primeiroVencimento,
        interestRate: financiamento.taxaMensal,
        penaltyRate: financiamento.multa,
        dailyInterestRate: financiamento.jurosDiario,
        notes: financiamento.notas,
      });
      router.push(`/contratos/${id}`);
    } catch {
      setError("Erro ao salvar contrato. Tente novamente.");
      setSaving(false);
    }
  }

  const filteredCustomers = customers.filter(
    (c) =>
      !customerSearch ||
      c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
      c.cpf.includes(customerSearch)
  );

  const filteredVehicles = vehicles.filter(
    (v) =>
      !vehicleSearch ||
      `${v.brand} ${v.model} ${v.plate}`
        .toLowerCase()
        .includes(vehicleSearch.toLowerCase())
  );

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/contratos" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Nova Venda</h1>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-2 mb-8">
        {(["1. Cliente", "2. Veículo", "3. Financiamento", "4. Revisão"] as const).map(
          (label, i) => (
            <div key={label} className="flex items-center gap-2">
              <span
                className={`text-xs font-medium px-3 py-1 rounded-full ${
                  step === i + 1
                    ? "bg-blue-600 text-white"
                    : step > i + 1
                    ? "bg-blue-100 text-blue-700"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {label}
              </span>
              {i < 3 && <ChevronRight className="w-4 h-4 text-gray-300" />}
            </div>
          )
        )}
      </div>

      {/* Step 1: Cliente */}
      {step === 1 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-800 mb-4">Selecionar Cliente</h2>
          <input
            type="text"
            placeholder="Buscar por nome ou CPF..."
            value={customerSearch}
            onChange={(e) => setCustomerSearch(e.target.value)}
            className={`${inputCls} mb-4`}
          />
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {filteredCustomers.map((c) => {
              const aprovado = c.approvalStatus === "approved";
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={!aprovado}
                  onClick={() => {
                    if (!aprovado) return;
                    setSelectedCustomer(c);
                    setStep(2);
                  }}
                  className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                    !aprovado
                      ? "border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed"
                      : selectedCustomer?.id === c.id
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-gray-900">{c.name}</p>
                    {!aprovado && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                        {c.approvalStatus === "rejected" ? "Rejeitado" : "Pendente"}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    CPF: {c.cpf} · {c.address.city}/{c.address.state}
                  </p>
                </button>
              );
            })}
            {filteredCustomers.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">
                Nenhum cliente encontrado.{" "}
                <Link href="/clientes/novo" className="text-blue-600">
                  Cadastrar novo
                </Link>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Step 2: Veículo */}
      {step === 2 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="font-semibold text-gray-800 mb-1">Selecionar Veículo</h2>
          <p className="text-xs text-gray-500 mb-4">
            Cliente: <span className="font-medium">{selectedCustomer?.name}</span>
          </p>
          <input
            type="text"
            placeholder="Buscar por marca, modelo ou placa..."
            value={vehicleSearch}
            onChange={(e) => setVehicleSearch(e.target.value)}
            className={`${inputCls} mb-4`}
          />
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {filteredVehicles.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => {
                  setSelectedVehicle(v);
                  setStep(3);
                }}
                className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                  selectedVehicle?.id === v.id
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <p className="font-medium text-gray-900">
                  {v.brand} {v.model} {v.year}
                </p>
                <p className="text-xs text-gray-500">
                  {v.plate} · {v.mileage.toLocaleString("pt-BR")} km ·{" "}
                  <span className="font-semibold text-gray-700">
                    {formatCurrency(v.price)}
                  </span>
                </p>
              </button>
            ))}
            {filteredVehicles.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">
                Nenhum veículo disponível.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setStep(1)}
            className="mt-4 text-sm text-gray-500 hover:text-gray-700"
          >
            ← Voltar
          </button>
        </div>
      )}

      {/* Step 3: Financiamento */}
      {step === 3 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <div>
            <h2 className="font-semibold text-gray-800 mb-1">Condições de Financiamento</h2>
            <p className="text-xs text-gray-500">
              {selectedVehicle?.brand} {selectedVehicle?.model} ·{" "}
              {formatCurrency(preco)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Entrada (R$)
              </label>
              <input
                type="number"
                value={financiamento.entrada}
                onChange={(e) =>
                  setFinanciamento((p) => ({ ...p, entrada: Number(e.target.value) }))
                }
                min={0}
                max={preco}
                step={0.01}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nº de Parcelas
              </label>
              <select
                value={financiamento.parcelas}
                onChange={(e) =>
                  setFinanciamento((p) => ({ ...p, parcelas: Number(e.target.value) }))
                }
                className={inputCls}
              >
                {[3, 6, 9, 12, 18, 24, 36, 48, 60].map((n) => (
                  <option key={n} value={n}>
                    {n}x
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Taxa de Juros (% ao mês)
              </label>
              <input
                type="number"
                value={financiamento.taxaMensal}
                onChange={(e) =>
                  setFinanciamento((p) => ({ ...p, taxaMensal: Number(e.target.value) }))
                }
                min={0}
                step={0.1}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                1º Vencimento
              </label>
              <input
                type="date"
                value={financiamento.primeiroVencimento}
                onChange={(e) =>
                  setFinanciamento((p) => ({ ...p, primeiroVencimento: e.target.value }))
                }
                min={todayISO()}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Multa por Atraso (%)
              </label>
              <input
                type="number"
                value={financiamento.multa}
                onChange={(e) =>
                  setFinanciamento((p) => ({ ...p, multa: Number(e.target.value) }))
                }
                min={0}
                step={0.1}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Juros por Dia de Atraso (%)
              </label>
              <input
                type="number"
                value={financiamento.jurosDiario}
                onChange={(e) =>
                  setFinanciamento((p) => ({ ...p, jurosDiario: Number(e.target.value) }))
                }
                min={0}
                step={0.01}
                className={inputCls}
              />
            </div>
          </div>

          {/* Resumo */}
          <div className="bg-blue-50 rounded-lg p-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-500 text-xs">Valor Financiado</p>
              <p className="font-bold text-gray-900">{formatCurrency(resumo.valorFinanciado)}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Parcela Mensal</p>
              <p className="font-bold text-blue-700">{formatCurrency(resumo.valorParcela)}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Total a Pagar</p>
              <p className="font-bold text-gray-900">{formatCurrency(resumo.totalPago)}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs">Total de Juros</p>
              <p className="font-bold text-red-600">{formatCurrency(resumo.totalJuros)}</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
            <textarea
              value={financiamento.notas}
              onChange={(e) =>
                setFinanciamento((p) => ({ ...p, notas: e.target.value }))
              }
              rows={2}
              className={inputCls}
            />
          </div>

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              ← Voltar
            </button>
            <button
              type="button"
              onClick={() => setStep(4)}
              disabled={!financiamento.primeiroVencimento || resumo.valorFinanciado <= 0}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              Revisar →
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Revisão */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-800 mb-4">Revisão do Contrato</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Cliente</p>
                <p className="font-medium text-gray-900">{selectedCustomer?.name}</p>
              </div>
              <div>
                <p className="text-gray-500">Veículo</p>
                <p className="font-medium text-gray-900">
                  {selectedVehicle?.brand} {selectedVehicle?.model} ({selectedVehicle?.year})
                </p>
              </div>
              <div>
                <p className="text-gray-500">Valor de Venda</p>
                <p className="font-medium text-gray-900">{formatCurrency(preco)}</p>
              </div>
              <div>
                <p className="text-gray-500">Entrada</p>
                <p className="font-medium text-gray-900">{formatCurrency(financiamento.entrada)}</p>
              </div>
              <div>
                <p className="text-gray-500">Valor Financiado</p>
                <p className="font-medium text-gray-900">{formatCurrency(resumo.valorFinanciado)}</p>
              </div>
              <div>
                <p className="text-gray-500">Parcelas</p>
                <p className="font-medium text-gray-900">
                  {financiamento.parcelas}x {formatCurrency(resumo.valorParcela)}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Taxa de Juros</p>
                <p className="font-medium text-gray-900">{financiamento.taxaMensal}% a.m.</p>
              </div>
              <div>
                <p className="text-gray-500">1º Vencimento</p>
                <p className="font-medium text-gray-900">{financiamento.primeiroVencimento}</p>
              </div>
            </div>
          </div>

          {/* Cronograma resumido */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-800 mb-3 text-sm">
              Cronograma de Parcelas
            </h3>
            <div className="max-h-52 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500">
                    <th className="text-left py-1">#</th>
                    <th className="text-left py-1">Vencimento</th>
                    <th className="text-right py-1">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {cronograma.map((p) => (
                    <tr key={p.numero}>
                      <td className="py-1 text-gray-500">{p.numero}</td>
                      <td className="py-1 text-gray-700">{p.vencimento}</td>
                      <td className="py-1 text-right font-medium text-gray-900">
                        {formatCurrency(p.valor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setStep(3)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              ← Voltar
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-8 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Salvando..." : "Confirmar Venda"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
