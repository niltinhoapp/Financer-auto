"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getContract, getInstallments, getPayments, updateInstallment } from "@/lib/firestore/contracts";
import { getCustomer } from "@/lib/firestore/customers";
import { getVehicle } from "@/lib/firestore/vehicles";
import { formatCurrency, formatDate, daysBetween, todayISO } from "@/lib/utils";
import { calcularValorAtualizado } from "@/lib/financiamento";
import { addDoc, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import type { Contract, Installment, Customer, Vehicle, Payment, PaymentMethod } from "@financer-auto/shared";
import { ArrowLeft, CheckCircle, Clock, AlertCircle } from "lucide-react";

const statusColor: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  paid: "bg-emerald-100 text-emerald-700",
  overdue: "bg-red-100 text-red-700",
  renegotiated: "bg-gray-100 text-gray-600",
};

const StatusIcon = ({ status }: { status: string }) => {
  if (status === "paid") return <CheckCircle className="w-4 h-4 text-emerald-500" />;
  if (status === "overdue") return <AlertCircle className="w-4 h-4 text-red-500" />;
  return <Clock className="w-4 h-4 text-amber-500" />;
};

export default function ContratoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [contract, setContract] = useState<Contract | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState<PaymentMethod>("cash");
  const [payAmount, setPayAmount] = useState(0);

  async function load() {
    if (!id) return;
    const [c, inst, pays] = await Promise.all([
      getContract(id),
      getInstallments(id),
      getPayments(id),
    ]);
    setContract(c);
    setInstallments(inst);
    setPayments(pays);
    if (c) {
      const [cust, veh] = await Promise.all([
        getCustomer(c.customerId),
        getVehicle(c.vehicleId),
      ]);
      setCustomer(cust);
      setVehicle(veh);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);

  async function registerPayment(installment: Installment) {
    if (!contract || !user) return;
    const today = todayISO();
    await addDoc(collection(db, "payments"), {
      contractId: contract.id,
      installmentId: installment.id,
      customerId: contract.customerId,
      amount: payAmount,
      method: payMethod,
      paidAt: today,
      registeredBy: user.uid,
      notes: "",
    });
    await updateInstallment(contract.id, installment.id, {
      status: "paid",
      paidAt: today,
      paidAmount: payAmount,
      paymentMethod: payMethod,
    });
    setPayingId(null);
    load();
  }

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!contract) {
    return <div className="p-8 text-gray-500">Contrato não encontrado.</div>;
  }

  const today = todayISO();
  const paidCount = installments.filter((i) => i.status === "paid").length;
  const pendingCount = installments.filter((i) => i.status !== "paid").length;
  const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/contratos" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Contrato</h1>
        <span className="text-xs text-gray-400 font-mono">{id}</span>
      </div>

      {/* Status da assinatura digital */}
      <div
        className={`flex items-center gap-3 rounded-xl p-4 mb-6 border text-sm ${
          contract.signature
            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
            : "bg-amber-50 border-amber-200 text-amber-800"
        }`}
      >
        {contract.signature ? (
          <>
            <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <div>
              <p className="font-semibold">Contrato assinado digitalmente</p>
              <p className="text-xs mt-0.5 opacity-80">
                {contract.signature.signerName} · CPF {contract.signature.signerCpf} ·{" "}
                {new Date(contract.signature.signedAt).toLocaleString("pt-BR")}
              </p>
            </div>
          </>
        ) : (
          <>
            <Clock className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div>
              <p className="font-semibold">Aguardando assinatura do cliente</p>
              <p className="text-xs mt-0.5 opacity-80">
                O cliente pode ler e assinar o contrato digitalmente pelo portal &quot;Minha Área&quot;.
              </p>
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500">Cliente</p>
          <p className="font-semibold text-gray-900 mt-1">{customer?.name}</p>
          <p className="text-xs text-gray-500">{customer?.phone}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500">Veículo</p>
          <p className="font-semibold text-gray-900 mt-1">
            {vehicle?.brand} {vehicle?.model}
          </p>
          <p className="text-xs text-gray-500">{vehicle?.plate} · {vehicle?.year}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-xs text-gray-500">Valor de Venda</p>
          <p className="font-semibold text-gray-900 mt-1">{formatCurrency(contract.salePrice)}</p>
          <p className="text-xs text-gray-500">Entrada: {formatCurrency(contract.downPayment)}</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-blue-700">{contract.installmentsCount}</p>
          <p className="text-xs text-blue-600">Parcelas Total</p>
        </div>
        <div className="bg-emerald-50 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-emerald-700">{paidCount}</p>
          <p className="text-xs text-emerald-600">Pagas</p>
        </div>
        <div className="bg-amber-50 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-amber-700">{pendingCount}</p>
          <p className="text-xs text-amber-600">Pendentes</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-4 text-center">
          <p className="text-lg font-bold text-gray-700">{formatCurrency(totalPaid)}</p>
          <p className="text-xs text-gray-500">Total Recebido</p>
        </div>
      </div>

      {/* Installments */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800 text-sm">
            Parcelas · {formatCurrency(contract.installmentValue)}/mês
          </h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">#</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Vencimento</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Valor</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Status</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Pagto.</th>
              {user?.role === "admin" && <th />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {installments.map((inst) => {
              const dias = inst.status !== "paid" ? daysBetween(inst.dueDate, today) : 0;
              const valorAtual =
                dias > 0
                  ? calcularValorAtualizado(
                      inst.value,
                      dias,
                      contract.penaltyRate,
                      contract.dailyInterestRate
                    )
                  : inst.value;
              const isPaying = payingId === inst.id;

              return (
                <>
                  <tr key={inst.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500">{inst.number}</td>
                    <td className="px-4 py-3 text-gray-700">{formatDate(inst.dueDate)}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900">
                        {formatCurrency(valorAtual)}
                      </span>
                      {dias > 0 && (
                        <span className="text-xs text-red-500 ml-1">
                          ({dias}d atraso)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[inst.status]}`}
                      >
                        <StatusIcon status={inst.status} />
                        {inst.status === "paid"
                          ? "Pago"
                          : inst.status === "overdue"
                          ? "Atrasado"
                          : "Pendente"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {inst.paidAt ? formatDate(inst.paidAt.split("T")[0]) : "—"}
                    </td>
                    {user?.role === "admin" && (
                      <td className="px-4 py-3 text-right">
                        {inst.status !== "paid" && (
                          <button
                            onClick={() => {
                              setPayingId(inst.id);
                              setPayAmount(valorAtual);
                            }}
                            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                          >
                            Registrar Pagto.
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                  {isPaying && (
                    <tr key={`pay-${inst.id}`} className="bg-blue-50">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="flex items-end gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Valor Recebido (R$)
                            </label>
                            <input
                              type="number"
                              value={payAmount}
                              onChange={(e) => setPayAmount(Number(e.target.value))}
                              step={0.01}
                              className="px-2 py-1.5 border border-gray-300 rounded text-sm w-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Forma de Pagamento
                            </label>
                            <select
                              value={payMethod}
                              onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                              className="px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="cash">Dinheiro</option>
                              <option value="pix">PIX</option>
                              <option value="credit_card">Cartão de Crédito</option>
                              <option value="transfer">Transferência</option>
                              <option value="check">Cheque</option>
                            </select>
                          </div>
                          <button
                            onClick={() => registerPayment(inst)}
                            className="px-4 py-1.5 bg-emerald-600 text-white rounded text-sm font-medium hover:bg-emerald-700"
                          >
                            Confirmar
                          </button>
                          <button
                            onClick={() => setPayingId(null)}
                            className="px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50"
                          >
                            Cancelar
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
