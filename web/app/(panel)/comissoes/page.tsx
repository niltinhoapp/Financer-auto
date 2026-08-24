"use client";

import { useEffect, useState } from "react";
import {
  collection, getDocs, addDoc, updateDoc, doc, query, orderBy,
} from "firebase/firestore";
import * as Sentry from "@sentry/nextjs";
import { db } from "@/lib/firebase";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui/Toast";
import { TrendingUp, Check, Clock, DollarSign, User, ChevronDown, ChevronUp } from "lucide-react";

interface Commission {
  id: string;
  sellerId: string;
  sellerName: string;
  contractId: string;
  vehicleName?: string;
  customerName?: string;
  percentage: number;
  amount: number;
  status: "pending" | "paid";
  createdAt: string;
  paidAt?: string;
}

interface SellerSummary {
  sellerId: string;
  sellerName: string;
  pending: number;
  paid: number;
  total: number;
  commissions: Commission[];
}

interface ContractLite {
  id: string;
  salePrice?: number;
  vehicleId?: string;
  customerId?: string;
}

export default function ComissoesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tab, setTab] = useState<"pendentes" | "pagas" | "todas">("pendentes");
  const [showNewModal, setShowNewModal] = useState(false);
  const [sellers, setSellers] = useState<{ id: string; name: string }[]>([]);
  const [contracts, setContracts] = useState<ContractLite[]>([]);

  // Form nova comissão
  const [form, setForm] = useState({
    sellerId: "", contractId: "", percentage: 2.5, amount: 0, usePercentage: true,
  });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [commSnap, usersSnap, contractsSnap] = await Promise.all([
        getDocs(query(collection(db, "commissions"), orderBy("createdAt", "desc"))),
        getDocs(collection(db, "users")),
        getDocs(collection(db, "contracts")),
      ]);
      const usersMap = Object.fromEntries(
        usersSnap.docs.map((d) => [d.id, d.data() as { name?: string; role?: string }])
      );
      const conts = contractsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as ContractLite));
      setContracts(conts);
      setSellers(
        usersSnap.docs
          .filter((d) => ["admin", "seller"].includes(d.data().role))
          .map((d) => ({ id: d.id, name: d.data().name ?? d.id }))
      );
      setCommissions(
        commSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          sellerName: usersMap[d.data().sellerId]?.name ?? d.data().sellerId?.slice(0, 8) ?? "—",
        })) as Commission[]
      );
    } catch (e) {
      console.error("Erro ao carregar comissões:", e);
      Sentry.captureException(e);
      toast("Não foi possível carregar as comissões. Tente novamente.", "error");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    Promise.resolve().then(() => load());
  }, []);

  async function handlePay(id: string) {
    setPayingId(id);
    try {
      await updateDoc(doc(db, "commissions", id), { status: "paid", paidAt: new Date().toISOString() });
      await load();
    } finally { setPayingId(null); }
  }

  async function handleSaveCommission() {
    if (!form.sellerId || !form.contractId) return;
    setSaving(true);
    try {
      const contract = contracts.find((c) => c.id === form.contractId);
      const amount = form.usePercentage
        ? (contract?.salePrice ?? 0) * (form.percentage / 100)
        : form.amount;
      const seller = sellers.find((s) => s.id === form.sellerId);
      await addDoc(collection(db, "commissions"), {
        sellerId: form.sellerId,
        contractId: form.contractId,
        vehicleName: contract?.vehicleId ? `Contrato ${contract.id.slice(0, 8)}` : "—",
        customerName: contract?.customerId ?? "—",
        percentage: form.percentage,
        amount,
        status: "pending",
        createdAt: new Date().toISOString(),
      });
      setShowNewModal(false);
      setForm({ sellerId: "", contractId: "", percentage: 2.5, amount: 0, usePercentage: true });
      await load();
    } finally { setSaving(false); }
  }

  // Agrupado por vendedor
  const summaries: SellerSummary[] = [];
  const sellerMap: Record<string, SellerSummary> = {};
  for (const c of commissions) {
    if (!sellerMap[c.sellerId]) {
      sellerMap[c.sellerId] = { sellerId: c.sellerId, sellerName: c.sellerName, pending: 0, paid: 0, total: 0, commissions: [] };
      summaries.push(sellerMap[c.sellerId]);
    }
    sellerMap[c.sellerId].total += c.amount;
    if (c.status === "pending") sellerMap[c.sellerId].pending += c.amount;
    else sellerMap[c.sellerId].paid += c.amount;
    sellerMap[c.sellerId].commissions.push(c);
  }

  const totalPending = commissions.filter((c) => c.status === "pending").reduce((a, c) => a + c.amount, 0);
  const totalPaid    = commissions.filter((c) => c.status === "paid").reduce((a, c) => a + c.amount, 0);

  const filteredComm = commissions.filter((c) => {
    if (tab === "pendentes") return c.status === "pending";
    if (tab === "pagas") return c.status === "paid";
    return true;
  });

  if (loading) {
    return (
      <div className="p-4 md:p-8 flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-4"
             style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Comissões</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>Controle de comissões por vendedor</p>
        </div>
        {user?.role === "admin" && (
          <button onClick={() => setShowNewModal(true)}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
                  style={{ background: "var(--accent-gradient)" }}>
            + Lançar
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <div className="card p-4">
          <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>A Pagar</p>
          <p className="text-lg font-bold" style={{ color: "#f59e0b" }}>{formatCurrency(totalPending)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>Total Pago</p>
          <p className="text-lg font-bold" style={{ color: "#10b981" }}>{formatCurrency(totalPaid)}</p>
        </div>
        <div className="card p-4 col-span-2 md:col-span-1">
          <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>Total Acumulado</p>
          <p className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{formatCurrency(totalPending + totalPaid)}</p>
        </div>
      </div>

      {/* Resumo por vendedor */}
      {summaries.length > 0 && (
        <div className="space-y-3 mb-6">
          <p className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>Resumo por Vendedor</p>
          {summaries.map((s) => {
            const isExpanded = expanded === s.sellerId;
            return (
              <div key={s.sellerId} className="card overflow-hidden">
                <button className="w-full p-4 flex items-center gap-3 text-left"
                        onClick={() => setExpanded(isExpanded ? null : s.sellerId)}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                       style={{ background: "var(--accent-light)" }}>
                    <User className="w-4 h-4" style={{ color: "var(--accent)" }} />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{s.sellerName}</p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {s.commissions.length} {s.commissions.length !== 1 ? "comissões" : "comissão"}
                    </p>
                  </div>
                  <div className="text-right mr-2">
                    {s.pending > 0 && (
                      <p className="text-sm font-bold" style={{ color: "#f59e0b" }}>{formatCurrency(s.pending)} pendente</p>
                    )}
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>Total: {formatCurrency(s.total)}</p>
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
                               : <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: "var(--text-muted)" }} />}
                </button>

                {isExpanded && (
                  <div style={{ borderTop: "1px solid var(--border)" }}>
                    {s.commissions.map((c) => (
                      <div key={c.id} className="px-4 py-3 flex items-center gap-3"
                           style={{ borderBottom: "1px solid var(--border)" }}>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                            Contrato {c.contractId.slice(0, 8)}...
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                            {c.percentage}% · {formatDate(c.createdAt.split("T")[0])}
                          </p>
                        </div>
                        <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>
                          {formatCurrency(c.amount)}
                        </p>
                        {c.status === "pending" ? (
                          user?.role === "admin" ? (
                            <button onClick={() => handlePay(c.id)} disabled={payingId === c.id}
                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50 transition-opacity"
                                    style={{ background: "#10b981" }}>
                              {payingId === c.id ? "..." : "Pagar"}
                            </button>
                          ) : (
                            <span className="text-xs px-2 py-1 rounded-full"
                                  style={{ background: "#f59e0b18", color: "#f59e0b" }}>Pendente</span>
                          )
                        ) : (
                          <span className="text-xs px-2 py-1 rounded-full"
                                style={{ background: "#10b98118", color: "#10b981" }}>Pago</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {commissions.length === 0 && (
        <div className="card py-14 text-center">
          <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-20" style={{ color: "var(--text-muted)" }} />
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Nenhuma comissão registrada</p>
          {user?.role === "admin" && (
            <button onClick={() => setShowNewModal(true)}
                    className="mt-3 text-sm font-medium"
                    style={{ color: "var(--accent)" }}>
              Lançar comissão
            </button>
          )}
        </div>
      )}

      {/* Modal nova comissão */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
             style={{ background: "rgba(0,0,0,.6)" }}>
          <div className="card w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>Lançar Comissão</h3>
              <button onClick={() => setShowNewModal(false)} style={{ color: "var(--text-muted)" }}>✕</button>
            </div>

            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>Vendedor</label>
              <select value={form.sellerId} onChange={(e) => setForm((p) => ({ ...p, sellerId: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl text-sm"
                      style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                <option value="">Selecione...</option>
                {sellers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>Contrato</label>
              <select value={form.contractId} onChange={(e) => setForm((p) => ({ ...p, contractId: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl text-sm"
                      style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                <option value="">Selecione...</option>
                {contracts.map((c) => <option key={c.id} value={c.id}>{c.id.slice(0, 10)} — {formatCurrency(c.salePrice ?? 0)}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>% Comissão</label>
                <input type="number" value={form.percentage}
                       onChange={(e) => setForm((p) => ({ ...p, percentage: Number(e.target.value) }))}
                       min={0} step={0.5} max={100}
                       className="w-full px-3 py-2.5 rounded-xl text-sm"
                       style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--text-secondary)" }}>Valor calculado</label>
                <div className="px-3 py-2.5 rounded-xl text-sm font-bold" style={{ background: "var(--bg-hover)", color: "var(--text-primary)" }}>
                  {formatCurrency(
                    (contracts.find((c) => c.id === form.contractId)?.salePrice ?? 0) * (form.percentage / 100)
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setShowNewModal(false)}
                      className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                      style={{ background: "var(--bg-hover)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                Cancelar
              </button>
              <button onClick={handleSaveCommission} disabled={saving || !form.sellerId || !form.contractId}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                      style={{ background: "var(--accent-gradient)" }}>
                {saving ? "Salvando..." : "Lançar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
