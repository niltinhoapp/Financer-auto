"use client";

import { useEffect, useState } from "react";
import { collection, addDoc, getDocs, query, where, getDoc, doc, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { formatDate } from "@/lib/utils";
import { ArrowLeft, ArrowLeftRight, Clock, CheckCircle2, XCircle, Send } from "lucide-react";
import Link from "next/link";

import { useToast } from "@/components/ui/Toast";
interface ExchangeReq {
  id: string;
  status: "pending" | "approved" | "rejected";
  reason: string;
  desiredVehicle?: { brand: string; model: string; year: string };
  createdAt: string;
  rejectionReason?: string;
}

const inputCls = "w-full px-3 py-2.5 rounded-xl text-sm";

export default function TrocaPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [customerId, setCustomerId] = useState("");
  const [contractId, setContractId] = useState("");
  const [currentVehicle, setCurrentVehicle] = useState<{ brand: string; model: string; year: string; plate: string } | null>(null);
  const [requests, setRequests] = useState<ExchangeReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    reason: "",
    desiredBrand: "",
    desiredModel: "",
    desiredYear: "",
  });

  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        const userDoc = await getDoc(doc(db, "users", user!.uid));
        const cid = userDoc.data()?.customerId;
        if (!cid) return;
        setCustomerId(cid);

        // Busca contrato ativo
        const snap = await getDocs(query(
          collection(db, "contracts"),
          where("customerId", "==", cid),
          where("status", "in", ["active", "settled"]),
          orderBy("createdAt", "desc")
        ));

        if (!snap.empty) {
          const c = snap.docs[0];
          setContractId(c.id);
          const data = c.data();

          // Busca veículo
          if (data.vehicleId) {
            const vSnap = await getDoc(doc(db, "vehicles", data.vehicleId));
            if (vSnap.exists()) {
              const v = vSnap.data();
              setCurrentVehicle({ brand: v.brand, model: v.model, year: String(v.year), plate: v.plate });
            }
          }
        }

        // Busca solicitações de troca
        const reqSnap = await getDocs(query(
          collection(db, "exchangeRequests"),
          where("customerId", "==", cid),
          orderBy("createdAt", "desc")
        ));
        setRequests(reqSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as ExchangeReq[]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user]);

  async function handleSubmit() {
    if (!customerId || !contractId || !form.reason.trim()) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, "exchangeRequests"), {
        customerId,
        contractId,
        customerName: user?.name ?? "Cliente",
        currentVehicle: currentVehicle ?? {},
        ...(form.desiredBrand ? { desiredVehicle: { brand: form.desiredBrand, model: form.desiredModel, year: form.desiredYear } } : {}),
        reason: form.reason.trim(),
        status: "pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setForm({ reason: "", desiredBrand: "", desiredModel: "", desiredYear: "" });
      setShowForm(false);
      // Reload
      const reqSnap = await getDocs(query(collection(db, "exchangeRequests"), where("customerId", "==", customerId), orderBy("createdAt", "desc")));
      setRequests(reqSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as ExchangeReq[]);
    } catch (err) {
      console.error(err);
      toast("Erro ao enviar solicitação. Tente novamente.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  const statusCfg = {
    pending:  { label: "Pendente",  Icon: Clock,         color: "#f59e0b" },
    approved: { label: "Aprovado",  Icon: CheckCircle2,  color: "#10b981" },
    rejected: { label: "Recusado",  Icon: XCircle,       color: "#ef4444" },
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-4"
             style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
      </div>
    );
  }

  const hasPending = requests.some((r) => r.status === "pending");

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/minha-area" style={{ color: "var(--text-muted)" }}>
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Solicitação de Troca</h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Solicite a troca do seu veículo financiado
          </p>
        </div>
      </div>

      {/* Veículo atual */}
      {currentVehicle && (
        <div className="card p-5">
          <p className="text-xs font-medium mb-2" style={{ color: "var(--text-muted)" }}>SEU VEÍCULO ATUAL</p>
          <p className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
            {currentVehicle.brand} {currentVehicle.model} {currentVehicle.year}
          </p>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Placa: {currentVehicle.plate}</p>
        </div>
      )}

      {/* Aviso */}
      <div className="card p-4" style={{ background: "var(--accent-light)", borderColor: "var(--accent)" }}>
        <p className="text-sm font-medium" style={{ color: "var(--accent)" }}>Como funciona a troca?</p>
        <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
          Envie sua solicitação com o motivo e o veículo desejado (opcional).
          A revenda avaliará e entrará em contato para negociar as condições.
          A troca está sujeita à aprovação e pode envolver ajuste nas parcelas.
        </p>
      </div>

      {/* Botão para nova solicitação */}
      {!hasPending && !showForm && contractId && (
        <button
          onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm text-white transition-all"
          style={{ background: "linear-gradient(135deg, var(--accent), #6366f1)" }}
        >
          <ArrowLeftRight className="w-4 h-4" />
          Solicitar Troca de Veículo
        </button>
      )}

      {hasPending && (
        <div className="card p-4 flex items-center gap-3" style={{ background: "#fef3c718", borderColor: "#f59e0b" }}>
          <Clock className="w-5 h-5 flex-shrink-0" style={{ color: "#f59e0b" }} />
          <p className="text-sm" style={{ color: "var(--text-primary)" }}>
            Você já tem uma solicitação de troca pendente. Aguarde a análise da revenda.
          </p>
        </div>
      )}

      {/* Formulário */}
      {showForm && (
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>Nova Solicitação de Troca</h2>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
              Motivo da troca <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <textarea
              value={form.reason}
              onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
              rows={3}
              placeholder="Ex.: Preciso de um veículo maior para a família..."
              className={inputCls}
              style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
            />
          </div>

          <div>
            <p className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
              Veículo desejado (opcional)
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Marca</label>
                <input type="text" value={form.desiredBrand}
                  onChange={(e) => setForm((p) => ({ ...p, desiredBrand: e.target.value }))}
                  placeholder="Ex: Toyota" className={inputCls}
                  style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Modelo</label>
                <input type="text" value={form.desiredModel}
                  onChange={(e) => setForm((p) => ({ ...p, desiredModel: e.target.value }))}
                  placeholder="Ex: Corolla" className={inputCls}
                  style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: "var(--text-muted)" }}>Ano</label>
                <input type="text" value={form.desiredYear}
                  onChange={(e) => setForm((p) => ({ ...p, desiredYear: e.target.value }))}
                  placeholder="Ex: 2022" className={inputCls}
                  style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={() => setShowForm(false)}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium"
              style={{ background: "var(--bg-hover)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !form.reason.trim()}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--accent)" }}
            >
              <Send className="w-4 h-4" />
              {submitting ? "Enviando..." : "Enviar Solicitação"}
            </button>
          </div>
        </div>
      )}

      {/* Histórico */}
      {requests.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>Histórico de Solicitações</h2>
          {requests.map((req) => {
            const cfg = statusCfg[req.status];
            const Icon = cfg.Icon;
            return (
              <div key={req.id} className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full"
                        style={{ background: `${cfg.color}18`, color: cfg.color }}>
                    <Icon className="w-3 h-3 inline mr-1" />{cfg.label}
                  </span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {formatDate(req.createdAt.split("T")[0])}
                  </span>
                </div>
                <p className="text-sm" style={{ color: "var(--text-primary)" }}>{req.reason}</p>
                {req.desiredVehicle && (
                  <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                    Desejado: {req.desiredVehicle.brand} {req.desiredVehicle.model} {req.desiredVehicle.year}
                  </p>
                )}
                {req.status === "rejected" && req.rejectionReason && (
                  <p className="text-xs mt-2 font-medium" style={{ color: "#ef4444" }}>
                    Motivo da recusa: {req.rejectionReason}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
