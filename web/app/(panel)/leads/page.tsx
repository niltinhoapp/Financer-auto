"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy, limit, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { formatDate } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";
import { Phone, Mail, Car, Clock, CheckCircle2, XCircle, MessageSquare, User, Zap } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useSelecaoExclusao, CheckExclusao } from "@/components/admin/SelecaoExclusao";

interface Lead {
  id: string;
  vehicleId: string;
  vehicleName: string;
  vehiclePrice: number;
  name: string;
  email: string;
  phone: string;
  message?: string;
  status: "new" | "contacted" | "negotiating" | "converted" | "lost";
  userId?: string;
  createdAt: string;
  updatedAt: string;
}

const statusCfg = {
  new:         { label: "Novo",         color: "#3b82f6", icon: Zap },
  contacted:   { label: "Contatado",    color: "#f59e0b", icon: Phone },
  negotiating: { label: "Negociando",   color: "#8b5cf6", icon: MessageSquare },
  converted:   { label: "Convertido",   color: "#10b981", icon: CheckCircle2 },
  lost:        { label: "Perdido",      color: "#94a3b8", icon: XCircle },
};

const STATUSES = Object.keys(statusCfg) as Lead["status"][];

export default function LeadsPage() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Lead["status"] | "all">("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      // Limita aos 300 leads mais recentes — evita crescimento ilimitado de leitura
      // conforme a base cresce. Listagem histórica completa fica para um relatório dedicado.
      const snap = await getDocs(query(collection(db, "leads"), orderBy("createdAt", "desc"), limit(300)));
      setLeads(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Lead[]);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: string, status: Lead["status"]) {
    setUpdatingId(id);
    try {
      await updateDoc(doc(db, "leads", id), { status, updatedAt: new Date().toISOString() });
      setLeads((prev) => prev.map((l) => l.id === id ? { ...l, status } : l));
    } finally {
      setUpdatingId(null);
    }
  }

  const sel = useSelecaoExclusao(
    async (id) => { await deleteDoc(doc(db, "leads", id)); },
    load
  );

  const filtered = filter === "all" ? leads : leads.filter((l) => l.status === filter);

  const counts = STATUSES.reduce((acc, s) => {
    acc[s] = leads.filter((l) => l.status === s).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="p-4 md:p-8">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            Leads
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Interessados da loja virtual
          </p>
        </div>
        <div className="flex items-center gap-3">
          {user?.role === "admin" && <sel.ToggleButton />}
          <div className="text-right">
            <p className="text-2xl font-bold" style={{ color: "var(--accent)" }}>
              {leads.filter(l => l.status === "new").length}
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>novos</p>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 md:gap-3 mb-6">
        {STATUSES.map((s) => {
          const cfg = statusCfg[s];
          const Icon = cfg.icon;
          return (
            <div key={s} className="card p-4 text-center cursor-pointer transition-all"
                 onClick={() => setFilter(s)}
                 style={filter === s ? { borderColor: cfg.color, background: `${cfg.color}0a` } : {}}>
              <Icon className="w-5 h-5 mx-auto mb-1" style={{ color: cfg.color }} />
              <p className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>{counts[s]}</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>{cfg.label}</p>
            </div>
          );
        })}
      </div>

      {/* Filtro */}
      <div className="flex gap-1 p-1 rounded-xl mb-5 overflow-x-auto" style={{ background: "var(--bg-hover)" }}>
        <button onClick={() => setFilter("all")}
                className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
                style={filter === "all"
                  ? { background: "var(--bg-card)", color: "var(--text-primary)", boxShadow: "var(--shadow-sm)" }
                  : { color: "var(--text-muted)" }}>
          Todos ({leads.length})
        </button>
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setFilter(s)}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
                  style={filter === s
                    ? { background: "var(--bg-card)", color: "var(--text-primary)", boxShadow: "var(--shadow-sm)" }
                    : { color: "var(--text-muted)" }}>
            {statusCfg[s].label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-4"
               style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card py-16 text-center">
          <Zap className="w-10 h-10 mx-auto mb-3 opacity-20" style={{ color: "var(--text-muted)" }} />
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Nenhum lead nesta categoria</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((lead) => {
            const cfg = statusCfg[lead.status];
            const Icon = cfg.icon;
            return (
              <div key={lead.id} className="card p-5"
                   style={{ cursor: sel.selecting ? "pointer" : undefined }}
                   onClick={() => sel.selecting && sel.toggle(lead.id)}>
                <div className="flex items-start gap-4">
                  {sel.selecting && (
                    <CheckExclusao checked={sel.isSelected(lead.id)} onChange={() => sel.toggle(lead.id)} />
                  )}
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                       style={{ background: `${cfg.color}18` }}>
                    <User className="w-5 h-5" style={{ color: cfg.color }} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold" style={{ color: "var(--text-primary)" }}>{lead.name}</p>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{ background: `${cfg.color}18`, color: cfg.color }}>
                        <Icon className="w-3 h-3 inline mr-1" />{cfg.label}
                      </span>
                      {lead.userId && (
                        <span className="text-xs px-2 py-0.5 rounded-full"
                              style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                          Conta criada
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                      <a href={`tel:${lead.phone}`} className="flex items-center gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                        <Phone className="w-3 h-3" /> {lead.phone}
                      </a>
                      {lead.email && (
                        <a href={`mailto:${lead.email}`} className="flex items-center gap-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                          <Mail className="w-3 h-3" /> {lead.email}
                        </a>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-2">
                      <Car className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
                      <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                        {lead.vehicleName}
                      </p>
                      <span className="text-xs font-semibold" style={{ color: "var(--accent)" }}>
                        {formatCurrency(lead.vehiclePrice)}
                      </span>
                      <Link href={`/veiculos/${lead.vehicleId}`}
                            className="text-xs ml-auto"
                            style={{ color: "var(--accent)" }}>
                        Ver veículo →
                      </Link>
                    </div>

                    {lead.message && (
                      <p className="text-xs mt-2 italic" style={{ color: "var(--text-secondary)" }}>
                        &quot;{lead.message}&quot;
                      </p>
                    )}

                    <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
                      <Clock className="w-3 h-3 inline mr-1" />
                      {formatDate(lead.createdAt.split("T")[0])}
                    </p>
                  </div>

                  {/* Status selector */}
                  <div className="flex-shrink-0">
                    <select
                      value={lead.status}
                      disabled={updatingId === lead.id}
                      onChange={(e) => updateStatus(lead.id, e.target.value as Lead["status"])}
                      className="px-3 py-1.5 rounded-xl text-xs font-medium"
                      style={{
                        background: `${cfg.color}18`,
                        border: `1px solid ${cfg.color}40`,
                        color: cfg.color,
                      }}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>{statusCfg[s].label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Ação rápida: converter em cliente */}
                {(lead.status === "new" || lead.status === "contacted" || lead.status === "negotiating") && (
                  <div className="mt-4 pt-3 flex items-center gap-3 flex-wrap" style={{ borderTop: "1px solid var(--border)" }}>
                    <Link href={`/clientes/novo?leadId=${lead.id}&name=${encodeURIComponent(lead.name)}&email=${encodeURIComponent(lead.email ?? "")}&phone=${encodeURIComponent(lead.phone)}`}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                          style={{ background: "#10b981" }}>
                      <CheckCircle2 className="w-4 h-4" />
                      Converter em Cliente
                    </Link>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      Abre o cadastro já preenchido e marca o lead como convertido
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <sel.Bar itemLabel="lead(s)" />
    </div>
  );
}
