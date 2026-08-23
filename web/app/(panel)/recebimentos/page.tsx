"use client";

import { useEffect, useState } from "react";
import {
  collectionGroup, getDocs, query, orderBy, getDoc, doc,
  updateDoc, addDoc, collection, where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { formatCurrency, formatDate, daysBetween, todayISO } from "@/lib/utils";
import { calcularValorAtualizado } from "@/lib/financiamento";
import { getPendingPaymentRequests, updatePaymentRequestStatus } from "@/lib/firestore/paymentRequests";
import { gerarUrlAssinadaFn, notificarClienteFn } from "@/lib/functions";
import { registrarAuditoria } from "@/lib/audit";
import { useAuth } from "@/hooks/useAuth";
import type { PaymentRequest } from "@financer-auto/shared";
import {
  DollarSign, AlertTriangle, CheckCircle, Clock, Bell,
  Check, X, FileImage, ExternalLink, ChevronDown, ChevronUp,
  Plus, CreditCard, MessageCircle, Search, Send,
} from "lucide-react";

import { useToast } from "@/components/ui/Toast";
interface InstallmentRow {
  id: string;
  contractId: string;
  number: number;
  dueDate: string;
  value: number;
  status: string;
  paidAt?: string;
  paidAmount?: number;
  penaltyRate?: number;
  dailyRate?: number;
  // extra para exibição
  customerName?: string;
  customerPhone?: string;
  customerId?: string;
}

/** Monta link wa.me com mensagem de cobrança pré-preenchida (envio manual). */
function buildWhatsAppLink(phone: string | undefined, message: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(message)}`;
}

/** Mensagem padrão de cobrança amigável para parcela em atraso. */
function buildCobrancaMessage(r: InstallmentRow, valorAtualizado: number, diasAtraso: number): string {
  const nome = r.customerName ? r.customerName.split(" ")[0] : "tudo bem";
  return (
    `Olá, ${nome}! Tudo bem? 😊\n\n` +
    `Passando para lembrar que a parcela #${r.number} do seu contrato, ` +
    `com vencimento em ${formatDate(r.dueDate)}, está em aberto há ${diasAtraso} dia${diasAtraso > 1 ? "s" : ""}.\n\n` +
    `Valor atualizado: ${formatCurrency(valorAtualizado)}\n\n` +
    `Qualquer dúvida ou para combinar o pagamento, é só responder por aqui. Obrigado!`
  );
}

interface AvisoNotification {
  id: string;
  status: string;
  createdAt?: string;
  tipo?: "cobranca" | "lembreteHoje" | "lembrete3dias" | string;
  customerName?: string;
  installmentNumber?: number;
  dueDate?: string;
  mensagem?: string;
  phone?: string;
}

interface RegisterModal {
  contractId: string;
  installmentId: string;
  customerId?: string;
  number: number;
  value: number;
  dueDate: string;
  customerName: string;
  penaltyRate: number;
  dailyRate: number;
}

export default function RecebimentosPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [rows, setRows] = useState<InstallmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pending" | "overdue" | "paid" | "requests" | "avisos">("requests");
  const [search, setSearch] = useState("");
  const [avisos, setAvisos] = useState<AvisoNotification[]>([]);
  const [loadingAvisos, setLoadingAvisos] = useState(false);
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [loadingReqs, setLoadingReqs] = useState(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [expandedReq, setExpandedReq] = useState<string | null>(null);

  // Modal registro manual
  const [registerModal, setRegisterModal] = useState<RegisterModal | null>(null);
  const [registerMethod, setRegisterMethod] = useState<"pix" | "dinheiro" | "transferencia">("dinheiro");
  const [registerNotes, setRegisterNotes] = useState("");
  const [registering, setRegistering] = useState(false);

  async function loadInstallments() {
    const [snap, contractsSnap, customersSnap] = await Promise.all([
      getDocs(query(collectionGroup(db, "installments"), orderBy("dueDate", "asc"))),
      getDocs(collection(db, "contracts")),
      getDocs(collection(db, "customers")),
    ]);

    const customerById: Record<string, { name?: string; phone?: string }> = {};
    customersSnap.docs.forEach((d) => { customerById[d.id] = d.data(); });

    const contractById: Record<
      string,
      { customerId?: string; penaltyRate?: number; dailyInterestRate?: number }
    > = {};
    contractsSnap.docs.forEach((d) => { contractById[d.id] = d.data(); });

    const data = snap.docs.map((d) => {
      const contractId = d.ref.parent.parent!.id;
      const contract = contractById[contractId];
      const customer = contract?.customerId ? customerById[contract.customerId] : undefined;
      return {
        id: d.id,
        contractId,
        ...d.data(),
        customerName: customer?.name,
        customerPhone: customer?.phone,
        customerId: contract?.customerId,
        // taxas reais do contrato (multa e juros diários)
        penaltyRate: contract?.penaltyRate,
        dailyRate: contract?.dailyInterestRate,
      };
    }) as InstallmentRow[];
    setRows(data);
    setLoading(false);
  }

  async function loadRequests() {
    setLoadingReqs(true);
    try { setRequests(await getPendingPaymentRequests()); }
    finally { setLoadingReqs(false); }
  }

  async function loadAvisos() {
    setLoadingAvisos(true);
    try {
      const snap = await getDocs(query(
        collection(db, "notifications"),
        where("status", "in", ["manual", "error"]),
        orderBy("createdAt", "desc"),
      ));
      setAvisos(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AvisoNotification));
    } catch (e) { console.error(e); }
    finally { setLoadingAvisos(false); }
  }

  async function marcarAvisoEnviado(id: string) {
    await updateDoc(doc(db, "notifications", id), { status: "sent", sentManuallyAt: new Date().toISOString() });
    setAvisos((prev) => prev.filter((a) => a.id !== id));
  }

  // Abre comprovante privado via URL assinada (LGPD)
  async function abrirComprovante(req: PaymentRequest) {
    const path = req.proofPath;
    if (path) {
      try {
        const res = await gerarUrlAssinadaFn({ path });
        window.open(res.data.url, "_blank");
        return;
      } catch { /* fallback abaixo */ }
    }
    if (req.proofUrl) window.open(req.proofUrl, "_blank");
  }

  useEffect(() => {
    Promise.resolve().then(() => {
      loadInstallments();
      loadRequests();
      loadAvisos();
    });
  }, []);

  const today = todayISO();

  // Marca o contrato como Quitado se todas as parcelas estiverem pagas/renegociadas
  async function verificarQuitacao(contractId: string) {
    try {
      const snap = await getDocs(collection(db, "contracts", contractId, "installments"));
      const todas = snap.docs.map((d) => d.data().status);
      if (todas.length > 0 && todas.every((s) => s === "paid" || s === "renegotiated")) {
        await updateDoc(doc(db, "contracts", contractId), { status: "settled", updatedAt: new Date().toISOString() });
      }
    } catch (e) { console.error("verificarQuitacao:", e); }
  }

  async function handleConfirm(req: PaymentRequest) {
    if (!user) return;
    setConfirmingId(req.id);
    try {
      const contractSnap = await getDoc(doc(db, "contracts", req.contractId));
      const contract = contractSnap.data();
      for (const instId of req.installmentIds) {
        const instRef = doc(db, "contracts", req.contractId, "installments", instId);
        const instSnap = await getDoc(instRef);
        const inst = instSnap.data();
        if (!inst || inst.status === "paid") continue;
        const dias = daysBetween(inst.dueDate, today);
        const valor = dias > 0 && contract
          ? calcularValorAtualizado(inst.value, dias, contract.penaltyRate ?? 2, contract.dailyInterestRate ?? 0.1)
          : inst.value;
        await updateDoc(instRef, { status: "paid", paidAt: today, paidAmount: valor, paymentMethod: req.paymentMethod ?? "pix" });
        await addDoc(collection(db, "payments"), {
          contractId: req.contractId, installmentId: instId,
          customerId: req.customerId, amount: valor,
          method: req.paymentMethod ?? "pix", paidAt: today,
          registeredBy: user.uid,
          notes: `Confirmado via solicitação #${req.id.slice(0, 6)}`,
        });
      }
      await updatePaymentRequestStatus(req.id, "confirmed", { confirmedBy: user.uid });
      await verificarQuitacao(req.contractId);
      registrarAuditoria(
        "pagamento_confirmado",
        `Confirmou pagamento de ${req.customerName} — parcela(s) #${req.installmentNumbers.join(", ")} (${formatCurrency(req.totalAmount)})`,
        user, { tipo: "contrato", id: req.contractId },
      );

      // Avisa o cliente que o pagamento foi confirmado
      const parcelas = req.installmentNumbers.join(", ");
      const msg =
        `Olá, ${req.customerName.split(" ")[0]}! ✅\n\n` +
        `Confirmamos o recebimento do pagamento da${req.installmentNumbers.length > 1 ? "s parcelas" : " parcela"} ` +
        `#${parcelas}, no valor de ${formatCurrency(req.totalAmount)}.\n\n` +
        `Obrigado! Você pode acompanhar tudo na sua área do cliente.`;
      notificarClienteFn({ customerId: req.customerId, tipo: "pagamento_confirmado", mensagem: msg })
        .then((r) => toast(r.data.status === "sent" ? "Pagamento confirmado e cliente avisado." : "Pagamento confirmado. Aviso na aba Avisos para envio.", "success"))
        .catch(() => toast("Pagamento confirmado (não foi possível gerar o aviso).", "info"))
        .finally(() => loadAvisos());

      await loadRequests();
      await loadInstallments();
    } catch (err) {
      console.error(err);
      toast("Erro ao confirmar pagamento.", "error");
    } finally {
      setConfirmingId(null);
    }
  }

  async function handleReject(req: PaymentRequest) {
    if (!rejectReason.trim()) { toast("Informe o motivo.", "error"); return; }
    setRejectingId(req.id);
    try {
      await updatePaymentRequestStatus(req.id, "rejected", { rejectionReason: rejectReason });
      registrarAuditoria(
        "pagamento_recusado",
        `Recusou pagamento de ${req.customerName} — parcela(s) #${req.installmentNumbers.join(", ")}. Motivo: ${rejectReason.trim()}`,
        user, { tipo: "contrato", id: req.contractId },
      );

      // Avisa o cliente sobre a recusa, com o motivo
      const msg =
        `Olá, ${req.customerName.split(" ")[0]}.\n\n` +
        `Não conseguimos confirmar o pagamento da${req.installmentNumbers.length > 1 ? "s parcelas" : " parcela"} ` +
        `#${req.installmentNumbers.join(", ")}.\n\n` +
        `Motivo: ${rejectReason.trim()}\n\n` +
        `Por favor, verifique e envie novamente pela sua área do cliente, ou fale com a gente. Obrigado!`;
      notificarClienteFn({ customerId: req.customerId, tipo: "pagamento_recusado", mensagem: msg })
        .then(() => loadAvisos())
        .catch(() => {});

      setRejectReason("");
      await loadRequests();
    } finally { setRejectingId(null); }
  }

  async function handleRegisterPayment() {
    if (!user || !registerModal) return;
    setRegistering(true);
    try {
      const instRef = doc(db, "contracts", registerModal.contractId, "installments", registerModal.installmentId);
      const dias = daysBetween(registerModal.dueDate, today);
      const valor = dias > 0
        ? calcularValorAtualizado(registerModal.value, dias, registerModal.penaltyRate, registerModal.dailyRate)
        : registerModal.value;

      await updateDoc(instRef, { status: "paid", paidAt: today, paidAmount: valor, paymentMethod: registerMethod });
      await addDoc(collection(db, "payments"), {
        contractId: registerModal.contractId,
        installmentId: registerModal.installmentId,
        ...(registerModal.customerId ? { customerId: registerModal.customerId } : {}),
        amount: valor, method: registerMethod,
        paidAt: today, registeredBy: user.uid,
        notes: registerNotes || `Registro manual — parcela #${registerModal.number}`,
      });
      await verificarQuitacao(registerModal.contractId);
      registrarAuditoria(
        "pagamento_registrado",
        `Registrou pagamento manual (${registerMethod}) de ${registerModal.customerName} — parcela #${registerModal.number} (${formatCurrency(valor)})`,
        user, { tipo: "contrato", id: registerModal.contractId },
      );
      setRegisterModal(null);
      setRegisterNotes("");
      await loadInstallments();
    } catch (err) {
      console.error(err);
      toast("Erro ao registrar pagamento.", "error");
    } finally { setRegistering(false); }
  }

  // Parcelas renegociadas foram substituídas por um novo cronograma — não entram nos totais
  const isOpen = (r: InstallmentRow) => r.status !== "paid" && r.status !== "renegotiated";

  const filtered = rows.filter((r) => {
    const q = search.trim().toLowerCase();
    if (q && !(r.customerName ?? "").toLowerCase().includes(q)) return false;
    if (tab === "paid") return r.status === "paid";
    if (tab === "overdue") return isOpen(r) && r.dueDate < today;
    if (tab === "pending") return isOpen(r) && r.dueDate >= today;
    return false;
  });

  const totalPending  = rows.filter(isOpen).reduce((a, r) => a + r.value, 0);
  const totalReceived = rows.filter((r) => r.status === "paid").reduce((a, r) => a + (r.paidAmount ?? r.value), 0);
  const totalOverdue  = rows.filter((r) => isOpen(r) && r.dueDate < today).reduce((a, r) => a + r.value, 0);

  const tabs = [
    { key: "requests", label: `Solicitações${requests.length ? ` (${requests.length})` : ""}` },
    { key: "pending",  label: "A Vencer" },
    { key: "overdue",  label: "Em Atraso" },
    { key: "paid",     label: "Pagas" },
    { key: "avisos",   label: `Avisos${avisos.length ? ` (${avisos.length})` : ""}` },
  ] as const;

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Contas a Receber</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>Carteira completa de parcelas</p>
        </div>
        {requests.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium w-fit"
               style={{ background: "#f59e0b18", border: "1px solid #f59e0b40", color: "#f59e0b" }}>
            <Bell className="w-4 h-4" />
            {requests.length} pendente{requests.length > 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: "A Receber",      value: totalPending,  color: "#f59e0b", icon: Clock },
          { label: "Total Recebido", value: totalReceived, color: "#10b981", icon: CheckCircle },
          { label: "Em Atraso",      value: totalOverdue,  color: "#ef4444", icon: AlertTriangle },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="card p-3 md:p-5">
            <div className="flex items-center gap-2 mb-1">
              <Icon className="w-3.5 h-3.5 md:w-5 md:h-5" style={{ color }} />
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</p>
            </div>
            <p className="text-sm md:text-xl font-bold" style={{ color: "var(--text-primary)" }}>
              {formatCurrency(value)}
            </p>
          </div>
        ))}
      </div>

      {/* Busca por cliente */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-muted)" }} />
        <input value={search} onChange={(e) => setSearch(e.target.value)}
               placeholder="Buscar por nome do cliente..."
               className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm"
               style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 p-1 rounded-xl overflow-x-auto"
           style={{ background: "var(--bg-hover)" }}>
        {tabs.map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
                  className="flex-shrink-0 px-3 md:px-4 py-1.5 rounded-lg text-xs md:text-sm font-medium transition-all"
                  style={tab === key
                    ? { background: "var(--bg-card)", color: "var(--text-primary)", boxShadow: "var(--shadow-sm)" }
                    : { color: "var(--text-muted)" }}>
            {label}
          </button>
        ))}
      </div>

      {/* Solicitações de pagamento */}
      {tab === "requests" && (
        <div className="space-y-3">
          {loadingReqs ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-4"
                   style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
            </div>
          ) : requests.length === 0 ? (
            <div className="card py-14 text-center">
              <Bell className="w-10 h-10 mx-auto mb-2 opacity-20" style={{ color: "var(--text-muted)" }} />
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>Nenhuma solicitação pendente</p>
            </div>
          ) : (
            requests.map((req) => {
              const expanded = expandedReq === req.id;
              return (
                <div key={req.id} className="card overflow-hidden">
                  {/* Linha principal */}
                  <button
                    className="w-full p-4 flex items-start gap-3 text-left"
                    onClick={() => setExpandedReq(expanded ? null : req.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate" style={{ color: "var(--text-primary)" }}>
                        {req.customerName}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                        Parcela{req.installmentNumbers.length > 1 ? "s" : ""}{" "}
                        #{req.installmentNumbers.join(", #")} ·{" "}
                        <span className="font-mono">{req.contractId.slice(0, 8)}...</span>
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {formatDate(req.createdAt.split("T")[0])}
                        {req.paymentMethod === "dinheiro" && (
                          <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium"
                                style={{ background: "#10b98118", color: "#10b981" }}>Dinheiro</span>
                        )}
                        {req.paymentMethod === "pix" && (
                          <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium"
                                style={{ background: "#3b82f618", color: "#3b82f6" }}>PIX</span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>
                        {formatCurrency(req.totalAmount)}
                      </p>
                      {expanded
                        ? <ChevronUp className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
                        : <ChevronDown className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
                      }
                    </div>
                  </button>

                  {/* Expandido */}
                  {expanded && (
                    <div className="px-4 pb-4 pt-0 space-y-3" style={{ borderTop: "1px solid var(--border)" }}>
                      {req.notes && (
                        <p className="text-xs italic pt-3" style={{ color: "var(--text-secondary)" }}>
                          &ldquo;{req.notes}&rdquo;
                        </p>
                      )}
                      {(req.proofUrl || req.proofPath) && (
                        <button onClick={() => abrirComprovante(req)}
                           className="inline-flex items-center gap-1.5 mt-2 text-xs font-medium px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                           style={{ background: "#3b82f618", border: "1px solid #3b82f640", color: "#3b82f6" }}>
                          <FileImage className="w-3.5 h-3.5" />
                          {req.proofFileName ?? "Ver comprovante"}
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      )}

                      <div className="flex flex-col sm:flex-row gap-2 pt-1">
                        <button onClick={() => handleConfirm(req)} disabled={confirmingId === req.id}
                                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-50"
                                style={{ background: "#10b981" }}>
                          <Check className="w-4 h-4" />
                          {confirmingId === req.id ? "Confirmando..." : "Confirmar recebimento"}
                        </button>

                        <div className="flex gap-2 flex-1">
                          <input
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            onFocus={() => setRejectingId(req.id)}
                            placeholder="Motivo da recusa"
                            className="flex-1 px-3 py-2 rounded-xl text-xs"
                            style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                          />
                          <button onClick={() => handleReject(req)} disabled={!rejectReason.trim()}
                                  aria-label="Recusar comprovante"
                                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-opacity disabled:opacity-40"
                                  style={{ background: "#ef444418", border: "1px solid #ef444440", color: "#ef4444" }}>
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Avisos do robô diário aguardando envio manual */}
      {tab === "avisos" && (
        <div className="space-y-3">
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Lembretes e cobranças gerados automaticamente todo dia às 9h. Sem a API de WhatsApp
            configurada, envie manualmente com 1 clique e marque como enviado.
          </p>
          {loadingAvisos ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-4"
                   style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
            </div>
          ) : avisos.length === 0 ? (
            <div className="card py-14 text-center">
              <Bell className="w-10 h-10 mx-auto mb-2 opacity-20" style={{ color: "var(--text-muted)" }} />
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>Nenhum aviso pendente de envio</p>
            </div>
          ) : (
            avisos.map((a) => {
              const tipoCfg = a.tipo === "cobranca"
                ? { label: "Cobrança", color: "#ef4444" }
                : a.tipo === "lembreteHoje"
                ? { label: "Vence hoje", color: "#f59e0b" }
                : { label: "Lembrete (3 dias)", color: "#3b82f6" };
              return (
                <div key={a.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{a.customerName}</p>
                        <span className="badge" style={{ background: `${tipoCfg.color}18`, color: tipoCfg.color }}>{tipoCfg.label}</span>
                        {a.status === "error" && <span className="badge badge-danger">falha no envio automático</span>}
                      </div>
                      <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                        Parcela #{a.installmentNumber} · venc. {formatDate(a.dueDate ?? "")}
                      </p>
                      <p className="text-xs mt-2 whitespace-pre-line" style={{ color: "var(--text-muted)" }}>{a.mensagem}</p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <a href={`https://wa.me/${a.phone}?text=${encodeURIComponent(a.mensagem ?? "")}`}
                         target="_blank" rel="noopener noreferrer"
                         className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white"
                         style={{ background: "#25D366" }}>
                        <Send className="w-3.5 h-3.5" /> Enviar
                      </a>
                      <button onClick={() => marcarAvisoEnviado(a.id)}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium"
                              style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                        <Check className="w-3.5 h-3.5" /> Enviado
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Parcelas — lista em cards (mobile-first) */}
      {tab !== "requests" && tab !== "avisos" && (
        loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-4"
                 style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="card py-14 text-center">
            <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-20" style={{ color: "var(--text-muted)" }} />
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Nenhuma parcela encontrada</p>
          </div>
        ) : (
          <>
            {/* Tabela — apenas desktop */}
            <div className="card overflow-hidden hidden md:block">
              <table className="w-full text-sm">
                <thead style={{ background: "var(--bg-hover)", borderBottom: "1px solid var(--border)" }}>
                  <tr>
                    {["Cliente","Parcela","Vencimento","Valor","Status/Atualizado",""].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold"
                          style={{ color: "var(--text-secondary)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const dias = daysBetween(r.dueDate, today);
                    const atualizado = tab === "overdue"
                      ? calcularValorAtualizado(r.value, dias, r.penaltyRate ?? 2, r.dailyRate ?? 0.1)
                      : r.value;
                    return (
                      <tr key={`${r.contractId}-${r.id}`}
                          className="transition-colors"
                          style={{ borderBottom: "1px solid var(--border)" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                        <td className="px-4 py-3" style={{ color: "var(--text-primary)" }}>
                          <span className="font-medium">{r.customerName ?? r.contractId.slice(0, 8)}</span>
                          <span className="block font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                            {r.contractId.slice(0, 8)}...
                          </span>
                        </td>
                        <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>#{r.number}</td>
                        <td className="px-4 py-3" style={{ color: "var(--text-primary)" }}>{formatDate(r.dueDate)}</td>
                        <td className="px-4 py-3 font-medium" style={{ color: "var(--text-primary)" }}>
                          {formatCurrency(r.value)}
                        </td>
                        <td className="px-4 py-3">
                          {tab === "overdue" && (
                            <span className="font-bold" style={{ color: "#ef4444" }}>
                              {formatCurrency(atualizado)}
                              <span className="text-xs font-normal ml-1" style={{ color: "#f87171" }}>({dias}d)</span>
                            </span>
                          )}
                          {tab === "paid" && (
                            <span style={{ color: "#10b981" }}>{r.paidAt ? formatDate(r.paidAt.split("T")[0]) : "—"}</span>
                          )}
                          {tab === "pending" && (
                            <span className="text-xs px-2 py-1 rounded-full"
                                  style={{ background: "#f59e0b18", color: "#f59e0b" }}>Pendente</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {tab === "overdue" && (() => {
                              const link = buildWhatsAppLink(r.customerPhone, buildCobrancaMessage(r, atualizado, dias));
                              return link ? (
                                <a href={link} target="_blank" rel="noopener noreferrer"
                                   title="Cobrar via WhatsApp"
                                   className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                                   style={{ background: "#10b98118", color: "#10b981", border: "1px solid #10b98130" }}>
                                  <MessageCircle className="w-3 h-3" /> Cobrar
                                </a>
                              ) : null;
                            })()}
                            {(tab === "overdue" || tab === "pending") && user?.role === "admin" && (
                              <button
                                onClick={() => setRegisterModal({
                                  contractId: r.contractId, installmentId: r.id, customerId: r.customerId,
                                  number: r.number, value: r.value, dueDate: r.dueDate,
                                  customerName: r.customerName ?? r.contractId.slice(0, 8),
                                  penaltyRate: r.penaltyRate ?? 2, dailyRate: r.dailyRate ?? 0.1,
                                })}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
                                style={{ background: "#3b82f618", color: "#3b82f6", border: "1px solid #3b82f630" }}>
                                <Plus className="w-3 h-3" /> Registrar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Cards — mobile */}
            <div className="space-y-2 md:hidden">
              {filtered.map((r) => {
                const dias = daysBetween(r.dueDate, today);
                const atualizado = tab === "overdue"
                  ? calcularValorAtualizado(r.value, dias, r.penaltyRate ?? 2, r.dailyRate ?? 0.1)
                  : r.value;
                return (
                  <div key={`${r.contractId}-${r.id}`} className="card p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                          {r.customerName ?? r.contractId.slice(0, 8)}
                        </p>
                        <p className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                          {r.contractId.slice(0, 8)}... · Parcela #{r.number}
                        </p>
                        <p className="text-sm font-bold mt-1" style={{ color: "var(--text-primary)" }}>
                          {formatCurrency(r.value)}
                          {tab === "overdue" && atualizado > r.value && (
                            <span className="ml-2 text-xs font-bold" style={{ color: "#ef4444" }}>
                              → {formatCurrency(atualizado)}
                            </span>
                          )}
                        </p>
                        <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                          Venc. {formatDate(r.dueDate)}
                          {tab === "overdue" && <span style={{ color: "#ef4444" }}> · {dias} dias em atraso</span>}
                          {tab === "paid" && r.paidAt && (
                            <span style={{ color: "#10b981" }}> · Pago em {formatDate(r.paidAt.split("T")[0])}</span>
                          )}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 flex-shrink-0">
                        {tab === "overdue" && (() => {
                          const link = buildWhatsAppLink(r.customerPhone, buildCobrancaMessage(r, atualizado, dias));
                          return link ? (
                            <a href={link} target="_blank" rel="noopener noreferrer"
                               className="p-2 rounded-xl"
                               style={{ background: "#10b98118", color: "#10b981" }}>
                              <MessageCircle className="w-4 h-4" />
                            </a>
                          ) : null;
                        })()}
                        {(tab === "overdue" || tab === "pending") && user?.role === "admin" && (
                          <button
                            onClick={() => setRegisterModal({
                              contractId: r.contractId, installmentId: r.id, customerId: r.customerId,
                              number: r.number, value: r.value, dueDate: r.dueDate,
                              customerName: r.customerName ?? r.contractId.slice(0, 8),
                              penaltyRate: r.penaltyRate ?? 2, dailyRate: r.dailyRate ?? 0.1,
                            })}
                            className="p-2 rounded-xl"
                            style={{ background: "#3b82f618", color: "#3b82f6" }}>
                            <Plus className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )
      )}

      {/* Modal: registrar pagamento manual */}
      {registerModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
             style={{ background: "rgba(0,0,0,.6)" }}>
          <div className="card w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>
                  Registrar Pagamento
                </h3>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                  Parcela #{registerModal.number} — Contrato {registerModal.contractId.slice(0, 8)}
                </p>
              </div>
              <button onClick={() => setRegisterModal(null)} aria-label="Fechar" style={{ color: "var(--text-muted)" }}>
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Valor */}
            <div className="p-3 rounded-xl" style={{ background: "var(--bg-hover)" }}>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Valor a receber</p>
              {(() => {
                const dias = daysBetween(registerModal.dueDate, today);
                const atualizado = dias > 0
                  ? calcularValorAtualizado(registerModal.value, dias, registerModal.penaltyRate, registerModal.dailyRate)
                  : registerModal.value;
                return (
                  <div>
                    <p className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
                      {formatCurrency(atualizado)}
                    </p>
                    {dias > 0 && (
                      <p className="text-xs" style={{ color: "#ef4444" }}>
                        Original: {formatCurrency(registerModal.value)} · {dias} dias em atraso (multa + juros inclusos)
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Forma de pagamento */}
            <div>
              <p className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
                Forma de Pagamento
              </p>
              <div className="grid grid-cols-3 gap-2">
                {(["dinheiro", "pix", "transferencia"] as const).map((m) => (
                  <button key={m} onClick={() => setRegisterMethod(m)}
                          className="py-2 rounded-xl text-xs font-medium capitalize transition-all"
                          style={registerMethod === m
                            ? { background: "var(--accent)", color: "#fff" }
                            : { background: "var(--bg-hover)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                    {m === "pix" ? "PIX" : m === "dinheiro" ? "Dinheiro" : "Transferência"}
                  </button>
                ))}
              </div>
            </div>

            {/* Observações */}
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>
                Observações (opcional)
              </label>
              <textarea value={registerNotes} onChange={(e) => setRegisterNotes(e.target.value)}
                        rows={2} placeholder="Ex: Pago em mãos, recibo emitido..."
                        className="w-full px-3 py-2 rounded-xl text-sm resize-none"
                        style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
            </div>

            <div className="flex gap-2">
              <button onClick={() => setRegisterModal(null)}
                      className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                      style={{ background: "var(--bg-hover)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                Cancelar
              </button>
              <button onClick={handleRegisterPayment} disabled={registering}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-opacity"
                      style={{ background: "#10b981" }}>
                <CreditCard className="w-4 h-4" />
                {registering ? "Salvando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
