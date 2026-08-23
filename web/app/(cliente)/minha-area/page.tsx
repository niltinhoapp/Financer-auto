"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, query, where, getDocs, orderBy, getDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { uploadComprovanteFn } from "@/lib/functions";
import { useAuth } from "@/hooks/useAuth";
import { getCustomer } from "@/lib/firestore/customers";
import { getInstallments } from "@/lib/firestore/contracts";
import { createPaymentRequest, getPaymentRequestsByCustomer } from "@/lib/firestore/paymentRequests";
import { formatCurrency, formatDate, daysBetween, todayISO } from "@/lib/utils";
import { calcularValorAtualizado } from "@/lib/financiamento";
import { useToast } from "@/components/ui/Toast";
import type { Contract, Installment, Customer, PaymentRequest } from "@financer-auto/shared";
import {
  Car, FileText, CheckCircle, Clock, AlertCircle,
  DollarSign, TrendingUp, Calendar, FileSignature, ChevronRight, ShieldCheck,
  CreditCard, X, Copy, CheckCircle2, Upload, FileImage, Trash2, FolderOpen,
  Banknote, Smartphone, ArrowLeftRight,
} from "lucide-react";

const statusConfig = {
  pending:      { label: "A vencer",  cls: "bg-amber-100 text-amber-700",   icon: Clock },
  paid:         { label: "Pago",      cls: "bg-emerald-100 text-emerald-700", icon: CheckCircle },
  overdue:      { label: "Atrasado",  cls: "bg-red-100 text-red-700",       icon: AlertCircle },
  renegotiated: { label: "Renegoc.",  cls: "bg-gray-100 text-gray-600",     icon: FileText },
};

export default function MinhaAreaPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [contract, setContract] = useState<Contract | null>(null);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"parcelas" | "historico">("parcelas");
  const [debugInfo, setDebugInfo] = useState<string>("");

  // Pagamento
  const [customerId, setCustomerId] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showPayModal, setShowPayModal] = useState(false);
  const [pixConfig, setPixConfig] = useState<{ pixKey?: string; pixKeyType?: string; pixName?: string; companyName?: string } | null>(null);
  const [payNotes, setPayNotes] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [paymentDone, setPaymentDone] = useState(false);
  const [myRequests, setMyRequests] = useState<PaymentRequest[]>([]);
  const [copied, setCopied] = useState(false);
  const [payMethod, setPayMethod] = useState<"pix" | "dinheiro">("pix");

  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        const userDoc = await getDoc(doc(db, "users", user!.uid));
        const userData = userDoc.data();
        const cid = userData?.customerId;

        if (!cid) {
          setDebugInfo(`uid=${user!.uid} SEM_customerId userData=${JSON.stringify(userData ?? {})}`);
          return;
        }
        setCustomerId(cid);

        const cust = await getCustomer(cid);
        setCustomer(cust);
        if (!cust) {
          setDebugInfo(`customerId=${cid} getCustomer=null`);
          return;
        }

        const q = query(
          collection(db, "contracts"),
          where("customerId", "==", cid),
          where("status", "in", ["active", "settled"]),
          orderBy("createdAt", "desc")
        );
        const snap = await getDocs(q);
        setDebugInfo(`uid=${user!.uid} customerId=${cid} contratos=${snap.size}`);

        if (!snap.empty) {
          const c = { id: snap.docs[0].id, ...snap.docs[0].data() } as Contract;
          setContract(c);
          const inst = await getInstallments(c.id);
          setInstallments(inst);
        }

        // Carrega configuração PIX e solicitações anteriores
        const [configSnap, reqs] = await Promise.allSettled([
          getDoc(doc(db, "config", "empresa")),
          getPaymentRequestsByCustomer(cid),
        ]);
        if (configSnap.status === "fulfilled" && configSnap.value.exists()) {
          setPixConfig(configSnap.value.data());
        }
        if (reqs.status === "fulfilled") {
          setMyRequests(reqs.value);
        }
      } catch (err) {
        const msg = (err as Error)?.message ?? String(err);
        setDebugInfo(`ERRO: ${msg}`);
        console.error("Erro ao carregar dados da área do cliente:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user]);

  const today = todayISO();

  function toggleInstallment(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedInstallments = installments.filter((i) => selected.has(i.id) && i.status !== "paid" && i.status !== "renegotiated");

  function calcTotal() {
    return selectedInstallments.reduce((acc, i) => {
      const dias = daysBetween(i.dueDate, today);
      const valor = dias > 0 && contract
        ? calcularValorAtualizado(i.value, dias, contract.penaltyRate, contract.dailyInterestRate)
        : i.value;
      return acc + valor;
    }, 0);
  }

  async function handleSolicitarPagamento() {
    if (!contract || !customer || selectedInstallments.length === 0) return;
    setSubmitting(true);
    try {
      // Upload do comprovante via Cloud Function (bypass CORS) — obrigatório só no PIX
      let proofUrl: string | undefined;
      let proofPath: string | undefined;
      let proofFileName: string | undefined;
      if (proofFile) {
        setUploading(true);
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(proofFile);
        });
        const result = await uploadComprovanteFn({ base64, fileName: proofFile.name, customerId });
        proofUrl = result.data.url;
        proofPath = result.data.path;
        proofFileName = proofFile.name;
        setUploading(false);
      }

      await createPaymentRequest({
        contractId: contract.id,
        customerId,
        customerName: customer.name,
        installmentIds: selectedInstallments.map((i) => i.id),
        installmentNumbers: selectedInstallments.map((i) => i.number),
        totalAmount: calcTotal(),
        status: "pending",
        paymentMethod: payMethod,
        ...(payNotes.trim() ? { notes: payNotes.trim() } : {}),
        ...(proofUrl ? { proofUrl, proofFileName, ...(proofPath ? { proofPath } : {}) } : {}),
      });
      setPaymentDone(true);
      setSelected(new Set());
      setProofFile(null);
      const reqs = await getPaymentRequestsByCustomer(customerId);
      setMyRequests(reqs);
    } catch (err) {
      console.error("Erro ao criar solicitação:", err);
      toast("Erro ao enviar solicitação. Tente novamente.", "error");
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  }

  function copyPix() {
    if (pixConfig?.pixKey) {
      navigator.clipboard.writeText(pixConfig.pixKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

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
        {debugInfo && process.env.NODE_ENV !== "production" && (
          <p className="mt-6 text-xs text-gray-400 font-mono bg-gray-100 rounded-lg px-4 py-3 text-left break-all max-w-lg mx-auto">
            {debugInfo}
          </p>
        )}
      </div>
    );
  }

  // Parcelas renegociadas foram substituídas por novas — não contam como devidas
  const activeInstallments = installments.filter((i) => i.status !== "renegotiated");
  const paidInstallments = activeInstallments.filter((i) => i.status === "paid");
  const pendingInstallments = activeInstallments.filter((i) => i.status !== "paid");
  const totalPaid = paidInstallments.reduce((acc, i) => acc + (i.paidAmount ?? i.value), 0);
  const totalRemaining = pendingInstallments.reduce((acc, i) => acc + i.value, 0);
  const overdueCount = pendingInstallments.filter((i) => i.dueDate < today).length;
  const nextInstallment = pendingInstallments.find((i) => i.dueDate >= today);
  const progressPct = activeInstallments.length > 0
    ? Math.round((paidInstallments.length / activeInstallments.length) * 100)
    : 0;

  const pendingRequest = myRequests.find((r) => r.status === "pending");

  // Parcelas em atraso (para o destaque) e valor atualizado da próxima
  const overdueInstallments = pendingInstallments.filter((i) => i.dueDate < today);
  const heroInstallment = overdueInstallments[0] ?? nextInstallment;
  const heroIsOverdue = overdueInstallments.length > 0;
  const heroValue = heroInstallment
    ? (() => {
        const dias = daysBetween(heroInstallment.dueDate, today);
        return dias > 0
          ? calcularValorAtualizado(heroInstallment.value, dias, contract.penaltyRate, contract.dailyInterestRate)
          : heroInstallment.value;
      })()
    : 0;

  function payHero() {
    if (!heroInstallment) return;
    setSelected(new Set(heroIsOverdue ? overdueInstallments.map((i) => i.id) : [heroInstallment.id]));
    setShowPayModal(true);
    setPaymentDone(false);
    setPayNotes("");
  }

  return (
    <div className="space-y-6">

      {/* Destaque: próxima parcela / regularização */}
      {heroInstallment && contract.status !== "settled" && (
        <div className="rounded-2xl p-5 text-white"
             style={{ background: heroIsOverdue
               ? "linear-gradient(135deg,#b45309,#d97706)"
               : "var(--accent-gradient)",
               boxShadow: "var(--shadow-md)" }}>
          <p className="text-xs font-medium opacity-90">
            {heroIsOverdue
              ? `Você tem ${overdueCount} parcela${overdueCount > 1 ? "s" : ""} aguardando regularização`
              : "Sua próxima parcela"}
          </p>
          <div className="flex items-end justify-between gap-4 mt-2 flex-wrap">
            <div>
              <p className="text-3xl font-bold leading-tight">
                {formatCurrency(heroIsOverdue
                  ? overdueInstallments.reduce((acc, i) => {
                      const dias = daysBetween(i.dueDate, today);
                      return acc + (dias > 0
                        ? calcularValorAtualizado(i.value, dias, contract.penaltyRate, contract.dailyInterestRate)
                        : i.value);
                    }, 0)
                  : heroValue)}
              </p>
              <p className="text-sm opacity-90 mt-1">
                {heroIsOverdue
                  ? "Sem estresse — regularize agora e siga em dia."
                  : `Vence em ${formatDate(heroInstallment.dueDate)}`}
              </p>
            </div>
            <button onClick={payHero}
                    className="px-5 py-3 rounded-xl text-sm font-bold transition-transform active:scale-95"
                    style={{ background: "#fff", color: heroIsOverdue ? "#b45309" : "var(--accent-dark)" }}>
              {heroIsOverdue ? "Regularizar agora" : "Pagar agora"}
            </button>
          </div>
          {/* Progresso do contrato */}
          <div className="mt-4">
            <div className="flex justify-between text-xs opacity-90 mb-1">
              <span>{paidInstallments.length} de {activeInstallments.length} parcelas pagas</span>
              <span>{progressPct}%</span>
            </div>
            <div className="w-full rounded-full h-2" style={{ background: "rgba(255,255,255,.25)" }}>
              <div className="h-2 rounded-full transition-all" style={{ width: `${progressPct}%`, background: "#fff" }} />
            </div>
          </div>
        </div>
      )}

      {/* Alerta: solicitação pendente */}
      {pendingRequest && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <Clock className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-800 text-sm">Pagamento aguardando confirmação</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Parcela{pendingRequest.installmentNumbers.length > 1 ? "s" : ""} nº{" "}
              {pendingRequest.installmentNumbers.join(", ")} — {formatCurrency(pendingRequest.totalAmount)} —
              aguardando confirmação da revenda.
            </p>
          </div>
        </div>
      )}

      {/* Contrato */}
      <Link
        href="/minha-area/contrato"
        className="flex items-center gap-3 rounded-xl p-4 border transition-colors"
        style={{
          background: contract.signature ? "#10b98112" : "#f59e0b12",
          borderColor: contract.signature ? "#10b981" : "#f59e0b",
        }}
      >
        <FileSignature className="w-5 h-5 flex-shrink-0" style={{ color: contract.signature ? "#10b981" : "#f59e0b" }} />
        <div className="flex-1">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {contract.signature ? "Contrato assinado digitalmente" : "Assinatura do contrato pendente"}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {contract.signature ? "Toque para ler novamente o contrato." : "Toque para ler e assinar o contrato."}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
      </Link>

      {/* Documentos */}
      <Link
        href="/minha-area/documentos"
        className="flex items-center gap-3 rounded-xl p-4 border transition-colors"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <FolderOpen className="w-5 h-5 flex-shrink-0" style={{ color: "var(--accent)" }} />
        <div className="flex-1">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Meus Documentos</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Envie CPF, RG, comprovantes de residência e renda.
          </p>
        </div>
        <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
      </Link>

      {/* Troca de veículo */}
      <Link
        href="/minha-area/troca"
        className="flex items-center gap-3 rounded-xl p-4 border transition-colors"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <ArrowLeftRight className="w-5 h-5 flex-shrink-0" style={{ color: "#8b5cf6" }} />
        <div className="flex-1">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Solicitar Troca de Veículo</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Negocie a troca do seu veículo por outro da revenda.
          </p>
        </div>
        <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
      </Link>

      {/* Garantia */}
      <Link
        href="/minha-area/garantia"
        className="flex items-center gap-3 rounded-xl p-4 border transition-colors"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
      >
        <ShieldCheck className="w-5 h-5 flex-shrink-0" style={{ color: "#0ea5e9" }} />
        <div className="flex-1">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Garantia e Revisões</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>Validade, oficinas autorizadas e histórico de manutenções.</p>
        </div>
        <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
      </Link>

      {/* Card do contrato */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Car className="w-5 h-5 text-blue-600" />
          <h2 className="font-bold text-gray-900">Meu Contrato</h2>
          <span className={`ml-auto text-xs font-medium px-2.5 py-1 rounded-full ${
            contract.status === "settled" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
          }`}>
            {contract.status === "settled" ? "Quitado" : "Ativo"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><p className="text-xs text-gray-500">Valor de Venda</p><p className="font-semibold">{formatCurrency(contract.salePrice)}</p></div>
          <div><p className="text-xs text-gray-500">Entrada</p><p className="font-semibold">{formatCurrency(contract.downPayment)}</p></div>
          <div><p className="text-xs text-gray-500">Parcelas</p><p className="font-semibold">{contract.installmentsCount}x {formatCurrency(contract.installmentValue)}</p></div>
          <div><p className="text-xs text-gray-500">Taxa de Juros</p><p className="font-semibold">{contract.interestRate}% a.m.</p></div>
        </div>
        <div className="mt-5">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>{paidInstallments.length} de {activeInstallments.length} parcelas pagas</span>
            <span>{progressPct}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
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
          <p className="font-bold text-gray-900 text-sm">{nextInstallment ? formatDate(nextInstallment.dueDate) : "—"}</p>
        </div>
      </div>

      {/* Tabs parcelas / histórico */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
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

          {tab === "parcelas" && selected.size > 0 && (
            <button
              onClick={() => { setShowPayModal(true); setPaymentDone(false); setPayNotes(""); }}
              className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors"
            >
              <CreditCard className="w-4 h-4" />
              Pagar {selected.size} parcela{selected.size > 1 ? "s" : ""} · {formatCurrency(calcTotal())}
            </button>
          )}
        </div>

        {tab === "parcelas" && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {selected.size === 0 && (
              <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 text-xs text-blue-700">
                Selecione as parcelas que deseja pagar e clique em &quot;Pagar&quot;.
              </div>
            )}
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 w-8" />
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">#</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Vencimento</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Valor</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {installments.map((inst) => {
                  const dias = inst.status !== "paid" && inst.status !== "renegotiated" ? daysBetween(inst.dueDate, today) : 0;
                  const valorAtual = dias > 0 && contract
                    ? calcularValorAtualizado(inst.value, dias, contract.penaltyRate, contract.dailyInterestRate)
                    : inst.value;
                  const cfg = statusConfig[inst.status as keyof typeof statusConfig] ?? statusConfig.pending;
                  const Icon = cfg.icon;
                  const isSelectable = inst.status !== "paid" && inst.status !== "renegotiated";
                  const isSelected = selected.has(inst.id);

                  return (
                    <tr
                      key={inst.id}
                      onClick={() => isSelectable && toggleInstallment(inst.id)}
                      className={`${isSelectable ? "cursor-pointer" : ""} ${isSelected ? "bg-emerald-50" : "hover:bg-gray-50"}`}
                    >
                      <td className="px-4 py-3">
                        {isSelectable ? (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleInstallment(inst.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                          />
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{inst.number}</td>
                      <td className="px-4 py-3 text-gray-700">{formatDate(inst.dueDate)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-medium text-gray-900">{formatCurrency(valorAtual)}</span>
                        {dias > 0 && <span className="block text-xs text-red-500">{dias}d atraso</span>}
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
                      <td className="px-4 py-3 text-gray-700">{inst.paidAt ? formatDate(inst.paidAt.split("T")[0]) : "—"}</td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-700">{formatCurrency(inst.paidAmount ?? inst.value)}</td>
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

      {/* Modal de pagamento */}
      {showPayModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">Solicitar Pagamento</h2>
              <button onClick={() => setShowPayModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {paymentDone ? (
                <div className="text-center py-4">
                  <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto mb-3" />
                  <p className="font-semibold text-gray-900">Solicitação enviada!</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Assim que a revenda confirmar o recebimento, as parcelas serão marcadas como pagas.
                  </p>
                  <button
                    onClick={() => setShowPayModal(false)}
                    className="mt-5 w-full bg-emerald-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-emerald-700"
                  >
                    Fechar
                  </button>
                </div>
              ) : (
                <>
                  {/* Resumo das parcelas */}
                  <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Parcelas selecionadas</p>
                    {selectedInstallments.map((i) => {
                      const dias = daysBetween(i.dueDate, today);
                      const val = dias > 0 && contract
                        ? calcularValorAtualizado(i.value, dias, contract.penaltyRate, contract.dailyInterestRate)
                        : i.value;
                      return (
                        <div key={i.id} className="flex justify-between text-sm">
                          <span className="text-gray-700">Parcela #{i.number} · {formatDate(i.dueDate)}</span>
                          <span className={`font-medium ${dias > 0 ? "text-red-600" : "text-gray-900"}`}>{formatCurrency(val)}</span>
                        </div>
                      );
                    })}
                    <div className="border-t border-gray-200 pt-2 flex justify-between font-bold text-gray-900">
                      <span>Total</span>
                      <span>{formatCurrency(calcTotal())}</span>
                    </div>
                  </div>

                  {/* Forma de pagamento */}
                  <div>
                    <p className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Forma de pagamento</p>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { key: "pix",      label: "PIX",      Icon: Smartphone },
                        { key: "dinheiro", label: "Dinheiro", Icon: Banknote  },
                      ] as const).map(({ key, label, Icon }) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setPayMethod(key)}
                          className="flex items-center gap-2 p-3 rounded-xl border text-sm font-medium transition-all"
                          style={{
                            borderColor: payMethod === key ? "var(--accent)" : "var(--border)",
                            background:  payMethod === key ? "var(--accent-light)" : "var(--bg-hover)",
                            color:       payMethod === key ? "var(--accent)" : "var(--text-secondary)",
                          }}
                        >
                          <Icon className="w-4 h-4" />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Instrução de pagamento */}
                  {payMethod === "dinheiro" ? (
                    <div className="rounded-xl p-4" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)" }}>
                      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Pagamento em Dinheiro</p>
                      <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                        Dirija-se à revenda com o valor de {formatCurrency(calcTotal())} em mãos.
                        Após confirmação presencial, as parcelas serão quitadas pelo administrador.
                      </p>
                    </div>
                  ) : pixConfig?.pixKey ? (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2">
                      <p className="text-sm font-semibold text-emerald-800">Pague via PIX</p>
                      {pixConfig.pixName && (
                        <p className="text-xs text-emerald-700">Favorecido: <strong>{pixConfig.pixName}</strong></p>
                      )}
                      <p className="text-xs text-emerald-700">
                        Tipo: <strong className="uppercase">{pixConfig.pixKeyType}</strong>
                      </p>
                      <div className="flex items-center gap-2 bg-white rounded-lg border border-emerald-200 px-3 py-2">
                        <span className="text-sm font-mono text-gray-800 flex-1 break-all">{pixConfig.pixKey}</span>
                        <button onClick={copyPix} className="text-emerald-600 hover:text-emerald-700 flex-shrink-0">
                          {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                      <p className="text-xs text-emerald-600">
                        Após enviar o PIX, clique em &quot;Confirmar envio&quot; abaixo.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-xl p-4" style={{ background: "var(--accent-light)", border: "1px solid var(--accent)" }}>
                      <p className="text-sm" style={{ color: "var(--accent)" }}>Entre em contato com a revenda para informações de pagamento PIX.</p>
                    </div>
                  )}

                  {/* Comprovante */}
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                      Comprovante de pagamento{payMethod === "pix" && <span style={{ color: "#ef4444" }}> *</span>}
                      {payMethod === "dinheiro" && <span style={{ color: "var(--text-muted)" }}> (opcional)</span>}
                    </label>
                    {proofFile ? (
                      <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5">
                        <FileImage className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                        <span className="text-sm text-gray-700 flex-1 truncate">{proofFile.name}</span>
                        <button
                          type="button"
                          onClick={() => setProofFile(null)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-lg py-4 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                        <Upload className="w-5 h-5 text-gray-400" />
                        <span className="text-sm text-gray-500">Clique para anexar o comprovante</span>
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          className="hidden"
                          onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                        />
                      </label>
                    )}
                    <p className="text-xs text-gray-400 mt-1">Foto da tela, print ou PDF. Aceita JPG, PNG, PDF.</p>
                  </div>

                  {/* Observação */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Observação (opcional)</label>
                    <textarea
                      value={payNotes}
                      onChange={(e) => setPayNotes(e.target.value)}
                      rows={2}
                      placeholder="Ex.: Pago via PIX às 14h"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <button
                    onClick={handleSolicitarPagamento}
                    disabled={submitting || uploading || (payMethod === "pix" && !proofFile)}
                    className="w-full bg-emerald-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                  >
                    {uploading ? "Enviando comprovante..." : submitting ? "Registrando..." : (payMethod === "pix" && !proofFile) ? "Anexe o comprovante para continuar" : "✓ Confirmar pagamento"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
