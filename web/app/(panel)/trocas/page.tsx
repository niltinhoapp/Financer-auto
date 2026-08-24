"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy, limit, doc, updateDoc, getDoc } from "firebase/firestore";
import * as Sentry from "@sentry/nextjs";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ArrowLeftRight, Check, X, Clock, AlertCircle, Car } from "lucide-react";

interface ExchangeRequest {
  id: string;
  customerId: string;
  customerName: string;
  contractId: string;
  currentVehicle: { brand: string; model: string; year: string; plate: string };
  desiredVehicle?: { brand: string; model: string; year: string };
  reason: string;
  status: "pending" | "approved" | "rejected";
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

const statusCfg = {
  pending:  { label: "Pendente",  color: "#f59e0b", icon: Clock },
  approved: { label: "Aprovado",  color: "#10b981", icon: Check },
  rejected: { label: "Recusado",  color: "#ef4444", icon: X },
};

export default function TrocasPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [requests, setRequests] = useState<ExchangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    try {
      // Limita às 300 solicitações mais recentes — evita crescimento ilimitado de leitura.
      const snap = await getDocs(query(collection(db, "exchangeRequests"), orderBy("createdAt", "desc"), limit(300)));
      setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ExchangeRequest[]);
    } catch (e) {
      console.error("Erro ao carregar solicitações de troca:", e);
      Sentry.captureException(e);
      toast("Não foi possível carregar as solicitações de troca. Tente novamente.", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    Promise.resolve().then(() => load());
  }, []);

  async function handleApprove(req: ExchangeRequest) {
    if (!user) return;
    setProcessingId(req.id);
    try {
      await updateDoc(doc(db, "exchangeRequests", req.id), {
        status: "approved",
        approvedBy: user.uid,
        approvedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await load();
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject(req: ExchangeRequest) {
    if (!user) return;
    setProcessingId(req.id);
    try {
      await updateDoc(doc(db, "exchangeRequests", req.id), {
        status: "rejected",
        rejectionReason: rejectReason[req.id] ?? "",
        rejectedBy: user.uid,
        updatedAt: new Date().toISOString(),
      });
      await load();
    } finally {
      setProcessingId(null);
    }
  }

  const filtered = tab === "pending" ? requests.filter((r) => r.status === "pending") : requests;

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Solicitações de Troca</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Clientes que solicitaram troca do veículo financiado
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl w-fit" style={{ background: "var(--bg-hover)" }}>
        {([
          { key: "pending", label: `Pendentes${requests.filter(r => r.status === "pending").length ? ` (${requests.filter(r => r.status === "pending").length})` : ""}` },
          { key: "all",     label: "Todas" },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={{
              background: tab === key ? "var(--bg-card)" : "transparent",
              color: tab === key ? "var(--text-primary)" : "var(--text-muted)",
              boxShadow: tab === key ? "var(--shadow-sm)" : "none",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-4" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card py-16 text-center">
          <ArrowLeftRight className="w-10 h-10 mx-auto mb-3 opacity-20" style={{ color: "var(--text-muted)" }} />
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Nenhuma solicitação de troca encontrada</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((req) => {
            const cfg = statusCfg[req.status];
            const Icon = cfg.icon;
            return (
              <div key={req.id} className="card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold" style={{ color: "var(--text-primary)" }}>{req.customerName}</p>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{ background: `${cfg.color}18`, color: cfg.color }}>
                        <Icon className="w-3 h-3 inline mr-1" />{cfg.label}
                      </span>
                    </div>
                    <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                      Solicitado em {formatDate(req.createdAt.split("T")[0])}
                    </p>

                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-xl" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)" }}>
                        <p className="text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>Veículo atual</p>
                        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                          {req.currentVehicle.brand} {req.currentVehicle.model} {req.currentVehicle.year}
                        </p>
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>{req.currentVehicle.plate}</p>
                      </div>
                      {req.desiredVehicle && (
                        <div className="p-3 rounded-xl" style={{ background: "var(--accent-light)", border: "1px solid var(--accent)" }}>
                          <p className="text-xs font-medium mb-1" style={{ color: "var(--accent)" }}>Deseja trocar por</p>
                          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                            {req.desiredVehicle.brand} {req.desiredVehicle.model} {req.desiredVehicle.year}
                          </p>
                        </div>
                      )}
                    </div>

                    {req.reason && (
                      <p className="text-xs mt-3 italic" style={{ color: "var(--text-secondary)" }}>
                        &quot;{req.reason}&quot;
                      </p>
                    )}
                  </div>
                </div>

                {req.status === "pending" && (
                  <div className="mt-4 flex items-center gap-3">
                    <button
                      onClick={() => handleApprove(req)}
                      disabled={processingId === req.id}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-all"
                      style={{ background: "#10b981" }}
                    >
                      <Check className="w-4 h-4" />
                      {processingId === req.id ? "Processando..." : "Aprovar troca"}
                    </button>
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        value={rejectReason[req.id] ?? ""}
                        onChange={(e) => setRejectReason((p) => ({ ...p, [req.id]: e.target.value }))}
                        placeholder="Motivo da recusa"
                        className="flex-1 px-3 py-2 rounded-xl text-xs"
                        style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                      />
                      <button
                        onClick={() => handleReject(req)}
                        disabled={processingId === req.id}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium disabled:opacity-40 transition-all"
                        style={{ color: "#ef4444", border: "1px solid #fca5a5" }}
                      >
                        <X className="w-4 h-4" /> Recusar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
