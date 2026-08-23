"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getContract, getInstallments, getPayments, updateInstallment, renegotiateInstallments, updateContract } from "@/lib/firestore/contracts";
import { getCustomer } from "@/lib/firestore/customers";
import { getVehicle } from "@/lib/firestore/vehicles";
import { getWarrantyByContract, createWarranty, updateWarranty } from "@/lib/firestore/warranties";
import { getRevisionsByContract, createRevision } from "@/lib/firestore/revisions";
import { getWorkshops } from "@/lib/firestore/workshops";
import { formatCurrency, formatDate, daysBetween, todayISO } from "@/lib/utils";
import { calcularValorAtualizado } from "@/lib/financiamento";
import { addDoc, collection, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { registrarAuditoria } from "@/lib/audit";
import type {
  Contract, Installment, Customer, Vehicle, Payment, PaymentMethod,
  Warranty, Revision, Workshop,
} from "@financer-auto/shared";
import { ArrowLeft, CheckCircle, Clock, AlertCircle, ShieldCheck, Wrench, Plus, Save, X, Download, FileSignature, RefreshCw } from "lucide-react";
import { gerarPDFContrato } from "@/lib/pdf/gerarContrato";
import { gerarPDFPromissorias } from "@/lib/pdf/gerarPromissoria";

import { useToast } from "@/components/ui/Toast";
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
  const { toast } = useToast();
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

  // Renegociação
  const [renegMode, setRenegMode] = useState(false);
  const [renegSelected, setRenegSelected] = useState<Set<string>>(new Set());
  const [renegForm, setRenegForm] = useState({
    downPayment: 0,
    newInstallmentValue: 0,
    newInstallmentsCount: 1,
    primeiroVencimento: "",
    notes: "",
  });
  const [savingReneg, setSavingReneg] = useState(false);

  // Garantia & Revisões
  const [warranty, setWarranty] = useState<Warranty | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [showWarrantyForm, setShowWarrantyForm] = useState(false);
  const [warrantyForm, setWarrantyForm] = useState({ startDate: "", endDate: "", coverage: "", workshopIds: [] as string[] });
  const [savingWarranty, setSavingWarranty] = useState(false);
  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const [revisionForm, setRevisionForm] = useState({
    date: todayISO(), mileage: 0, services: "", parts: "", notes: "", workshopId: "",
  });
  const [savingRevision, setSavingRevision] = useState(false);

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
      const [cust, veh, war, revs, wks] = await Promise.all([
        getCustomer(c.customerId),
        getVehicle(c.vehicleId),
        getWarrantyByContract(c.id),
        getRevisionsByContract(c.id),
        getWorkshops(),
      ]);
      setCustomer(cust);
      setVehicle(veh);
      setWarranty(war);
      setRevisions(revs);
      setWorkshops(wks);
    }
    setLoading(false);
  }

  async function handleCreateWarranty(e: React.FormEvent) {
    e.preventDefault();
    if (!contract) return;
    if (!warrantyForm.startDate || !warrantyForm.endDate) return;
    setSavingWarranty(true);
    try {
      await createWarranty({
        contractId: contract.id,
        vehicleId: contract.vehicleId,
        customerId: contract.customerId,
        startDate: warrantyForm.startDate,
        endDate: warrantyForm.endDate,
        coverage: warrantyForm.coverage.trim(),
        status: warrantyForm.endDate >= todayISO() ? "active" : "expired",
        workshopIds: warrantyForm.workshopIds,
      });
      setShowWarrantyForm(false);
      await load();
    } finally {
      setSavingWarranty(false);
    }
  }

  async function handleCreateRevision(e: React.FormEvent) {
    e.preventDefault();
    if (!contract || !user) return;
    setSavingRevision(true);
    try {
      await createRevision({
        vehicleId: contract.vehicleId,
        contractId: contract.id,
        ...(revisionForm.workshopId ? { workshopId: revisionForm.workshopId } : {}),
        date: revisionForm.date,
        mileage: Number(revisionForm.mileage) || 0,
        services: revisionForm.services.split(",").map((s) => s.trim()).filter(Boolean),
        parts: revisionForm.parts.split(",").map((s) => s.trim()).filter(Boolean),
        photos: [],
        ...(revisionForm.notes.trim() ? { notes: revisionForm.notes.trim() } : {}),
        createdBy: user.uid,
      });
      setShowRevisionForm(false);
      setRevisionForm({ date: todayISO(), mileage: 0, services: "", parts: "", notes: "", workshopId: "" });
      await load();
    } finally {
      setSavingRevision(false);
    }
  }

  function workshopName(wid?: string) {
    if (!wid) return "—";
    return workshops.find((w) => w.id === wid)?.name ?? "—";
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
    registrarAuditoria(
      "pagamento_registrado",
      `Baixa de parcela #${installment.number} (${formatCurrency(payAmount)})` + (customer ? ` — ${customer.name}` : ""),
      user, { tipo: "contrato", id: contract.id },
    );
    // Marca como Quitado se todas as parcelas estiverem pagas/renegociadas
    const todas = await getInstallments(contract.id);
    if (todas.length > 0 && todas.every((i) => i.id === installment.id || i.status === "paid" || i.status === "renegotiated")) {
      await updateContract(contract.id, { status: "settled" });
    }
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
  const pendingCount = installments.filter((i) => i.status !== "paid" && i.status !== "renegotiated").length;
  const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0);

  function valorAtualizadoDe(inst: Installment): number {
    if (inst.status === "paid" || inst.status === "renegotiated") return inst.value;
    const dias = daysBetween(inst.dueDate, today);
    return dias > 0
      ? calcularValorAtualizado(inst.value, dias, contract!.penaltyRate, contract!.dailyInterestRate)
      : inst.value;
  }

  const renegociaveis = installments.filter((i) => i.status === "pending" || i.status === "overdue");
  const totalSelecionado = installments
    .filter((i) => renegSelected.has(i.id))
    .reduce((acc, i) => acc + valorAtualizadoDe(i), 0);

  function toggleRenegSelecionado(id: string) {
    setRenegSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSaveRenegociacao() {
    if (!contract || !user) return;
    const selecionadas = installments.filter((i) => renegSelected.has(i.id));
    if (selecionadas.length === 0) {
      toast("Selecione ao menos uma parcela para renegociar.", "error");
      return;
    }
    if (renegForm.newInstallmentValue <= 0 || renegForm.newInstallmentsCount <= 0 || !renegForm.primeiroVencimento) {
      toast("Preencha o valor da nova parcela, a quantidade e o primeiro vencimento.", "error");
      return;
    }
    setSavingReneg(true);
    try {
      await renegotiateInstallments(contract.id, {
        installments: selecionadas,
        originalTotalValue: totalSelecionado,
        downPayment: renegForm.downPayment,
        newInstallmentValue: renegForm.newInstallmentValue,
        newInstallmentsCount: renegForm.newInstallmentsCount,
        primeiroVencimento: renegForm.primeiroVencimento,
        notes: renegForm.notes.trim() || undefined,
        renegotiatedBy: user.uid,
        customerId: contract.customerId,
      });
      registrarAuditoria(
        "contrato_renegociado",
        `Renegociou ${selecionadas.length} parcela(s) (total ${formatCurrency(totalSelecionado)}) → ${renegForm.newInstallmentsCount}x de ${formatCurrency(renegForm.newInstallmentValue)}` +
          (customer ? ` — ${customer.name}` : ""),
        user, { tipo: "contrato", id: contract.id },
      );
      setRenegMode(false);
      setRenegSelected(new Set());
      setRenegForm({ downPayment: 0, newInstallmentValue: 0, newInstallmentsCount: 1, primeiroVencimento: "", notes: "" });
      await load();
    } catch (e) {
      console.error("Erro ao renegociar:", e);
      toast("Erro ao salvar renegociação.", "error");
    } finally {
      setSavingReneg(false);
    }
  }

  async function handleDownloadPDF() {
    if (!contract || !customer || !vehicle) return;
    try {
      const bytes = await gerarPDFContrato({
        contratoId: contract.id,
        dataContrato: new Date().toLocaleDateString("pt-BR"),
        clienteNome: customer.name,
        clienteCpf: customer.cpf,
        clienteRg: customer.rg,
        clienteTelefone: customer.phone,
        clienteEmail: customer.email,
        clienteEndereco: customer.address
          ? `${customer.address.street}, ${customer.address.number} — ${customer.address.city}/${customer.address.state}`
          : undefined,
        veiculoMarca: vehicle.brand,
        veiculoModelo: vehicle.model,
        veiculoAno: vehicle.year,
        veiculoPlaca: vehicle.plate,
        veiculoChassi: vehicle.chassis,
        veiculoCor: vehicle.color,
        veiculoKm: vehicle.mileage,
        valorVenda: contract.salePrice,
        entrada: contract.downPayment,
        valorFinanciado: contract.financedAmount,
        numeroParcelas: contract.installmentsCount,
        valorParcela: contract.installmentValue,
        taxaMensal: contract.interestRate,
        multa: contract.penaltyRate,
        jurosDiario: contract.dailyInterestRate,
        primeiroVencimento: contract.firstDueDate,
        tradeIn: (contract as any).tradeIn,
        cronograma: installments.map((i) => ({
          numero: i.number,
          vencimento: i.dueDate,
          valor: i.value,
        })),
        notas: contract.notes,
      });
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `contrato_${contract.id.slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Erro ao gerar PDF:", e);
      toast("Erro ao gerar PDF do contrato.", "error");
    }
  }

  async function handleDownloadPromissorias() {
    if (!contract || !customer) return;
    try {
      const empresaSnap = await getDoc(doc(db, "config", "empresa"));
      const empresa = empresaSnap.exists() ? (empresaSnap.data() as any) : {};

      const pendentes = installments.filter((i) => i.status !== "paid" && i.status !== "renegotiated");
      const lista = pendentes.length > 0 ? pendentes : installments;

      const bytes = await gerarPDFPromissorias({
        contratoId: contract.id,
        cidadeEmissao: empresa.address?.split("—")[1]?.trim() || empresa.address || "—",
        dataEmissao: new Date().toLocaleDateString("pt-BR"),
        credorNome: empresa.companyName || "Financer Auto",
        credorDocumento: empresa.cnpj,
        credorEndereco: empresa.address,
        devedorNome: customer.name,
        devedorCpf: customer.cpf,
        devedorRg: customer.rg,
        devedorEndereco: customer.address
          ? `${customer.address.street}, ${customer.address.number} — ${customer.address.city}/${customer.address.state}`
          : undefined,
        veiculoDescricao: vehicle
          ? `${vehicle.brand} ${vehicle.model} ${vehicle.year} — Placa ${vehicle.plate}`
          : undefined,
        parcelas: lista.map((i) => ({
          numero: i.number,
          vencimento: formatDate(i.dueDate),
          valor: i.value,
        })),
      });
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `promissorias_${contract.id.slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Erro ao gerar promissórias:", e);
      toast("Erro ao gerar PDF das notas promissórias.", "error");
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/contratos" style={{ color: "var(--text-muted)" }} className="hover:opacity-70 transition-opacity">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1" />
        <button
          onClick={handleDownloadPDF}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all hover:opacity-80"
          style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
        >
          <Download className="w-4 h-4" />
          <span className="hidden sm:inline">Baixar PDF</span>
        </button>
        <button
          onClick={handleDownloadPromissorias}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all hover:opacity-80"
          style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
        >
          <FileSignature className="w-4 h-4" />
          <span className="hidden sm:inline">Baixar Promissórias</span>
        </button>
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
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-2">
          <h2 className="font-semibold text-gray-800 text-sm">
            Parcelas · {formatCurrency(contract.installmentValue)}/mês
          </h2>
          {user?.role === "admin" && renegociaveis.length > 0 && (
            <button
              onClick={() => {
                setRenegMode((v) => !v);
                setRenegSelected(new Set());
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                renegMode ? "bg-gray-200 text-gray-700" : "bg-amber-100 text-amber-700 hover:bg-amber-200"
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {renegMode ? "Cancelar renegociação" : "Renegociar parcelas"}
            </button>
          )}
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {renegMode && <th className="px-4 py-2 w-8" />}
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
              const dias = inst.status !== "paid" && inst.status !== "renegotiated" ? daysBetween(inst.dueDate, today) : 0;
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
              const podeRenegociar = inst.status === "pending" || inst.status === "overdue";

              return (
                <>
                  <tr key={inst.id} className="hover:bg-gray-50">
                    {renegMode && (
                      <td className="px-4 py-3">
                        {podeRenegociar && (
                          <input
                            type="checkbox"
                            checked={renegSelected.has(inst.id)}
                            onChange={() => toggleRenegSelecionado(inst.id)}
                            className="w-4 h-4"
                          />
                        )}
                      </td>
                    )}
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
                          : inst.status === "renegotiated"
                          ? "Renegociado"
                          : "Pendente"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {inst.paidAt ? formatDate(inst.paidAt.split("T")[0]) : "—"}
                    </td>
                    {user?.role === "admin" && (
                      <td className="px-4 py-3 text-right">
                        {inst.status !== "paid" && inst.status !== "renegotiated" && !renegMode && (
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

        {renegMode && (
          <div className="px-5 py-4 border-t border-gray-100 bg-amber-50 space-y-3">
            <p className="text-sm font-semibold text-amber-800">Novo acordo (renegociação)</p>
            <p className="text-xs text-amber-700">
              Selecione acima as parcelas a renegociar. Total selecionado (com multa/juros até hoje):{" "}
              <span className="font-bold">{formatCurrency(totalSelecionado)}</span>
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Entrada agora (R$)</label>
                <input
                  type="number" step={0.01} value={renegForm.downPayment || ""} placeholder="0,00"
                  onChange={(e) => setRenegForm({ ...renegForm, downPayment: Number(e.target.value) })}
                  className="px-2 py-1.5 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nº de novas parcelas</label>
                <input
                  type="number" min={1} value={renegForm.newInstallmentsCount}
                  onChange={(e) => setRenegForm({ ...renegForm, newInstallmentsCount: Number(e.target.value) })}
                  className="px-2 py-1.5 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Valor de cada parcela (R$)</label>
                <input
                  type="number" step={0.01} value={renegForm.newInstallmentValue || ""} placeholder="0,00"
                  onChange={(e) => setRenegForm({ ...renegForm, newInstallmentValue: Number(e.target.value) })}
                  className="px-2 py-1.5 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">1º vencimento</label>
                <input
                  type="date" value={renegForm.primeiroVencimento}
                  onChange={(e) => setRenegForm({ ...renegForm, primeiroVencimento: e.target.value })}
                  className="px-2 py-1.5 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Observações (opcional)</label>
              <input
                type="text" value={renegForm.notes}
                onChange={(e) => setRenegForm({ ...renegForm, notes: e.target.value })}
                placeholder="Ex: cliente solicitou prazo maior por dificuldade financeira"
                className="px-2 py-1.5 border border-gray-300 rounded text-sm w-full focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            {renegForm.newInstallmentValue > 0 && renegForm.newInstallmentsCount > 0 && (
              <p className="text-xs text-amber-700">
                Novo total combinado: {formatCurrency(renegForm.downPayment + renegForm.newInstallmentValue * renegForm.newInstallmentsCount)}
                {" "}({renegForm.newInstallmentsCount}x de {formatCurrency(renegForm.newInstallmentValue)}
                {renegForm.downPayment > 0 ? ` + entrada de ${formatCurrency(renegForm.downPayment)}` : ""})
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleSaveRenegociacao}
                disabled={savingReneg}
                className="px-4 py-1.5 bg-amber-600 text-white rounded text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
              >
                {savingReneg ? "Salvando..." : "Confirmar renegociação"}
              </button>
              <button
                onClick={() => { setRenegMode(false); setRenegSelected(new Set()); }}
                className="px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Garantia */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-6">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600" /> Garantia
          </h2>
          {!warranty && !showWarrantyForm && (
            <button
              onClick={() => {
                setWarrantyForm({ startDate: contract.createdAt.split("T")[0], endDate: "", coverage: "", workshopIds: [] });
                setShowWarrantyForm(true);
              }}
              className="flex items-center gap-1.5 text-sm text-blue-600 font-medium hover:underline"
            >
              <Plus className="w-4 h-4" /> Cadastrar garantia
            </button>
          )}
        </div>

        <div className="p-5">
          {warranty ? (
            <div className="grid sm:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-500">Vigência</p>
                <p className="font-medium text-gray-900 mt-0.5">
                  {formatDate(warranty.startDate)} até {formatDate(warranty.endDate)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Cobertura</p>
                <p className="font-medium text-gray-900 mt-0.5">{warranty.coverage || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Status</p>
                <span className={`inline-flex mt-0.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                  warranty.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
                }`}>
                  {warranty.status === "active" ? "Ativa" : "Expirada"}
                </span>
              </div>
              <div className="sm:col-span-3">
                <p className="text-xs text-gray-500 mb-1">Oficinas autorizadas</p>
                {warranty.workshopIds?.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {warranty.workshopIds.map((wid) => (
                      <span key={wid} className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                        {workshopName(wid)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">Nenhuma oficina vinculada</p>
                )}
              </div>
            </div>
          ) : showWarrantyForm ? (
            <form onSubmit={handleCreateWarranty} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Início da garantia</label>
                  <input
                    type="date"
                    value={warrantyForm.startDate}
                    onChange={(e) => setWarrantyForm({ ...warrantyForm, startDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Fim da garantia</label>
                  <input
                    type="date"
                    value={warrantyForm.endDate}
                    onChange={(e) => setWarrantyForm({ ...warrantyForm, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Cobertura</label>
                <input
                  value={warrantyForm.coverage}
                  onChange={(e) => setWarrantyForm({ ...warrantyForm, coverage: e.target.value })}
                  placeholder="Ex.: motor e câmbio, 12 meses ou 20.000km"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Oficinas autorizadas</label>
                <div className="flex flex-wrap gap-2">
                  {workshops.length === 0 && <p className="text-xs text-gray-400">Nenhuma oficina cadastrada — cadastre em &quot;Oficinas&quot;.</p>}
                  {workshops.map((w) => {
                    const checked = warrantyForm.workshopIds.includes(w.id);
                    return (
                      <label key={w.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer ${
                        checked ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-white border-gray-200 text-gray-600"
                      }`}>
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={checked}
                          onChange={() => setWarrantyForm({
                            ...warrantyForm,
                            workshopIds: checked
                              ? warrantyForm.workshopIds.filter((id) => id !== w.id)
                              : [...warrantyForm.workshopIds, w.id],
                          })}
                        />
                        <Wrench className="w-3.5 h-3.5" /> {w.name}
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={savingWarranty}
                  className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" /> {savingWarranty ? "Salvando..." : "Salvar garantia"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowWarrantyForm(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                >
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-gray-400">Nenhuma garantia cadastrada para este contrato.</p>
          )}
        </div>
      </div>

      {/* Revisões */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-6">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
            <Wrench className="w-4 h-4 text-blue-600" /> Revisões e Manutenções
          </h2>
          {!showRevisionForm && (
            <button
              onClick={() => setShowRevisionForm(true)}
              className="flex items-center gap-1.5 text-sm text-blue-600 font-medium hover:underline"
            >
              <Plus className="w-4 h-4" /> Registrar revisão
            </button>
          )}
        </div>

        {showRevisionForm && (
          <form onSubmit={handleCreateRevision} className="p-5 border-b border-gray-100 space-y-4">
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Data</label>
                <input
                  type="date"
                  value={revisionForm.date}
                  onChange={(e) => setRevisionForm({ ...revisionForm, date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Quilometragem</label>
                <input
                  type="number"
                  value={revisionForm.mileage || ""}
                  placeholder="0"
                  onChange={(e) => setRevisionForm({ ...revisionForm, mileage: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Oficina</label>
                <select
                  value={revisionForm.workshopId}
                  onChange={(e) => setRevisionForm({ ...revisionForm, workshopId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— Não informado —</option>
                  {workshops.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Serviços (separados por vírgula)</label>
                <input
                  value={revisionForm.services}
                  onChange={(e) => setRevisionForm({ ...revisionForm, services: e.target.value })}
                  placeholder="Troca de óleo, alinhamento"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Peças trocadas (separadas por vírgula)</label>
                <input
                  value={revisionForm.parts}
                  onChange={(e) => setRevisionForm({ ...revisionForm, parts: e.target.value })}
                  placeholder="Filtro de óleo, pastilhas de freio"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Observações</label>
              <textarea
                value={revisionForm.notes}
                onChange={(e) => setRevisionForm({ ...revisionForm, notes: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={savingRevision}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                <Save className="w-4 h-4" /> {savingRevision ? "Salvando..." : "Salvar revisão"}
              </button>
              <button
                type="button"
                onClick={() => setShowRevisionForm(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                <X className="w-4 h-4 inline -mt-0.5 mr-1" /> Cancelar
              </button>
            </div>
          </form>
        )}

        {revisions.length === 0 ? (
          <p className="text-sm text-gray-400 px-5 py-6">Nenhuma revisão registrada ainda.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Data</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">KM</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Oficina</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Serviços</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Peças</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {revisions.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 text-gray-700">{formatDate(r.date)}</td>
                  <td className="px-4 py-3 text-gray-700">{r.mileage?.toLocaleString("pt-BR")} km</td>
                  <td className="px-4 py-3 text-gray-700">{workshopName(r.workshopId)}</td>
                  <td className="px-4 py-3 text-gray-600">{r.services?.join(", ") || "—"}</td>
                  <td className="px-4 py-3 text-gray-600">{r.parts?.join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
