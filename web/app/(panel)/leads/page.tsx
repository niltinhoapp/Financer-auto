"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy, limit, doc, updateDoc, deleteDoc } from "firebase/firestore";
import * as Sentry from "@sentry/nextjs";
import { db } from "@/lib/firebase";
import { registrarAuditoria } from "@/lib/audit";
import { getUsersByRole } from "@/lib/firestore/users";
import { formatDate } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";
import { Phone, Mail, Car, Clock, CheckCircle2, XCircle, MessageSquare, User, UserCog, Zap, CalendarClock, Check } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useSelecaoExclusao, CheckExclusao } from "@/components/admin/SelecaoExclusao";
import { useToast } from "@/components/ui/Toast";

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
  // Vendedor responsável pelo acompanhamento — opcional para não quebrar
  // leads existentes (nenhum deles tem esse campo hoje).
  sellerId?: string | null;
  // Follow-up interno (Bloco 2.5). Responsável é o próprio sellerId do lead —
  // não duplicamos essa informação aqui. datetime completo em ISO8601 (não
  // date-only como Revision.nextDueDate): follow-up precisa de hora e de
  // comparação por intervalo ("hoje", "atrasado"), e ISO8601 compara
  // corretamente como string nesses casos, igual ao resto do projeto
  // (createdAt/updatedAt/timestamp já são todos ISO8601 — Timestamp do
  // Firestore está importado em um arquivo mas nunca de fato usado).
  nextFollowUpAt?: string | null;
  nextFollowUpNote?: string | null;
  followUpStatus?: "pending" | "done" | null;
  createdAt: string;
  updatedAt: string;
}

// datetime-local (input do navegador, sem timezone) <-> ISO8601 (armazenado).
// new Date(local) e d.getHours()/getFullYear()/etc. usam o fuso LOCAL do
// navegador nos dois sentidos — isso evita o bug clássico de salvar num fuso
// e reler deslocado (ex: 14:00 virar 11:00 ao reabrir o formulário).
function isoToDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function datetimeLocalToIso(local: string): string {
  return new Date(local).toISOString();
}
function formatDateTimePt(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function isSameLocalDay(iso: string, ref: Date): boolean {
  const d = new Date(iso);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth() && d.getDate() === ref.getDate();
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
  const { toast } = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [sellers, setSellers] = useState<{ uid: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Lead["status"] | "all">("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [followUpFilter, setFollowUpFilter] = useState<"all" | "today" | "overdue" | "none" | "pending">("all");
  const [editingFollowUpId, setEditingFollowUpId] = useState<string | null>(null);
  const [followUpDraft, setFollowUpDraft] = useState({ note: "", datetimeLocal: "" });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      // Limita aos 300 leads mais recentes — evita crescimento ilimitado de leitura
      // conforme a base cresce. Listagem histórica completa fica para um relatório dedicado.
      const snap = await getDocs(query(collection(db, "leads"), orderBy("createdAt", "desc"), limit(300)));
      setLeads(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Lead[]);
      // A lista de vendedores só é buscada (e o seletor só é exibido) para
      // admin: `users/{uid}` só permite leitura do próprio doc ou por admin
      // (firestore.rules:56) — um seller que tentasse listar outros
      // vendedores teria a query inteira rejeitada, quebrando a página.
      if (user?.role === "admin") {
        const sellerUsers = await getUsersByRole("seller");
        setSellers(sellerUsers.map((s) => ({ uid: s.uid, name: s.name })));
      }
    } catch (e) {
      console.error("Erro ao carregar leads:", e);
      Sentry.captureException(e);
      toast("Não foi possível carregar os leads. Tente novamente.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: string, status: Lead["status"]) {
    setUpdatingId(id);
    try {
      // Captura o lead ANTES da escrita — precisamos do status anterior pra
      // auditoria, e o estado `leads` ainda não foi atualizado neste ponto.
      const lead = leads.find((l) => l.id === id);
      const previousStatus = lead?.status;
      await updateDoc(doc(db, "leads", id), { status, updatedAt: new Date().toISOString() });
      setLeads((prev) => prev.map((l) => l.id === id ? { ...l, status } : l));
      if (lead && previousStatus) {
        // Sem await, como em todo o resto do app: auditoria é best-effort e
        // nunca deve travar/reverter a mudança de status que já teve sucesso.
        registrarAuditoria(
          "lead_status_alterado",
          `Lead ${lead.name} mudou de "${statusCfg[previousStatus].label}" para "${statusCfg[status].label}"`,
          user,
          { tipo: "lead", id }
        );
      }
    } finally {
      setUpdatingId(null);
    }
  }

  async function updateSellerId(id: string, sellerId: string | null) {
    setUpdatingId(id);
    try {
      const lead = leads.find((l) => l.id === id);
      const previousSellerId = lead?.sellerId ?? null;
      await updateDoc(doc(db, "leads", id), { sellerId, updatedAt: new Date().toISOString() });
      setLeads((prev) => prev.map((l) => l.id === id ? { ...l, sellerId } : l));
      if (lead) {
        const nomeAnterior = previousSellerId ? (sellers.find((s) => s.uid === previousSellerId)?.name ?? previousSellerId) : "Sem vendedor";
        const nomeNovo = sellerId ? (sellers.find((s) => s.uid === sellerId)?.name ?? sellerId) : "Sem vendedor";
        registrarAuditoria(
          "lead_vendedor_alterado",
          `Lead ${lead.name}: vendedor responsável mudou de "${nomeAnterior}" para "${nomeNovo}"`,
          user,
          { tipo: "lead", id }
        );
      }
    } finally {
      setUpdatingId(null);
    }
  }

  // Cria ou reagenda o follow-up. É a mesma operação nos dois casos — a
  // diferença é só o texto da auditoria (agendado vs. reagendado), decidida
  // conforme já havia ou não um follow-up pendente antes desta chamada.
  async function saveFollowUp(id: string, note: string, datetimeLocalValue: string) {
    setUpdatingId(id);
    try {
      const lead = leads.find((l) => l.id === id);
      const isNew = !lead?.nextFollowUpAt || lead?.followUpStatus !== "pending";
      const previousAt = lead?.nextFollowUpAt ?? null;
      const previousNote = lead?.nextFollowUpNote ?? null;
      const nextFollowUpAt = datetimeLocalToIso(datetimeLocalValue);
      const nextFollowUpNote = note.trim();
      await updateDoc(doc(db, "leads", id), {
        nextFollowUpAt,
        nextFollowUpNote,
        followUpStatus: "pending",
        updatedAt: new Date().toISOString(),
      });
      setLeads((prev) => prev.map((l) => l.id === id ? { ...l, nextFollowUpAt, nextFollowUpNote, followUpStatus: "pending" } : l));
      if (lead) {
        let descricao: string;
        if (isNew) {
          descricao = `Follow-up agendado para Lead ${lead.name}: "${nextFollowUpNote}" — ${formatDateTimePt(nextFollowUpAt)}`;
        } else {
          const mudancas: string[] = [];
          if (previousAt !== nextFollowUpAt) mudancas.push(`data de "${formatDateTimePt(previousAt!)}" para "${formatDateTimePt(nextFollowUpAt)}"`);
          if (previousNote !== nextFollowUpNote) mudancas.push(`ação de "${previousNote}" para "${nextFollowUpNote}"`);
          descricao = `Follow-up do Lead ${lead.name} reagendado` + (mudancas.length ? `: ${mudancas.join("; ")}` : "");
        }
        registrarAuditoria("lead_followup_agendado", descricao, user, { tipo: "lead", id });
      }
    } finally {
      setUpdatingId(null);
      setEditingFollowUpId(null);
    }
  }

  async function completeFollowUp(id: string) {
    setUpdatingId(id);
    try {
      const lead = leads.find((l) => l.id === id);
      // Mantém nextFollowUpAt/nextFollowUpNote intactos ao concluir — não há
      // motivo pra apagar, e isso deixa "último follow-up" visível sem
      // precisar de nenhuma estrutura de histórico embutida (o audit já
      // registra a trilha completa).
      await updateDoc(doc(db, "leads", id), { followUpStatus: "done", updatedAt: new Date().toISOString() });
      setLeads((prev) => prev.map((l) => l.id === id ? { ...l, followUpStatus: "done" } : l));
      if (lead) {
        // O Modelo A guarda só o follow-up atual — se um novo for agendado depois,
        // este texto/data são sobrescritos. Por isso a descrição inclui o que foi
        // concluído: é a única forma de essa informação sobreviver no histórico
        // permanente (audit), como o item 6 do bloco pede.
        const detalhe = lead.nextFollowUpAt ? `: "${lead.nextFollowUpNote}" (${formatDateTimePt(lead.nextFollowUpAt)})` : "";
        registrarAuditoria("lead_followup_concluido", `Follow-up do Lead ${lead.name} concluído${detalhe}`, user, { tipo: "lead", id });
      }
    } finally {
      setUpdatingId(null);
    }
  }

  function openFollowUpForm(lead: Lead) {
    setEditingFollowUpId(lead.id);
    setFollowUpDraft(
      lead.nextFollowUpAt && lead.followUpStatus === "pending"
        ? { note: lead.nextFollowUpNote ?? "", datetimeLocal: isoToDatetimeLocal(lead.nextFollowUpAt) }
        : { note: "", datetimeLocal: "" }
    );
  }

  const sel = useSelecaoExclusao(
    async (id) => { await deleteDoc(doc(db, "leads", id)); },
    load
  );

  const byStatus = filter === "all" ? leads : leads.filter((l) => l.status === filter);

  // Filtro de follow-up é derivado no cliente a partir dos leads já
  // carregados — sem índice composto novo, sem query server-side. A tela já
  // limita a 300 leads (load()), então isso é seguro na escala atual;
  // documentado no ROADMAP.md que uma consulta server-side por
  // sellerId + followUpStatus + nextFollowUpAt vai precisar de índice
  // composto quando/se essa otimização for necessária.
  const now = new Date();
  const filtered = byStatus.filter((l) => {
    if (followUpFilter === "all") return true;
    if (followUpFilter === "none") return !l.nextFollowUpAt;
    if (followUpFilter === "pending") return l.followUpStatus === "pending";
    if (!l.nextFollowUpAt || l.followUpStatus !== "pending") return false;
    if (followUpFilter === "today") return isSameLocalDay(l.nextFollowUpAt, now);
    // Atrasado = já venceu o instante agendado, não "antes de hoje". Um
    // follow-up de hoje às 9h já está atrasado às 14h — "Hoje" e "Atrasados"
    // são filtros independentes, um lead pode aparecer nos dois ao mesmo tempo.
    if (followUpFilter === "overdue") return new Date(l.nextFollowUpAt) < now;
    return true;
  });

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

      {/* Filtro de follow-up — derivado no cliente, sem índice novo (ver comentário acima de `filtered`) */}
      <div className="flex gap-1 p-1 rounded-xl mb-5 overflow-x-auto" style={{ background: "var(--bg-hover)" }}>
        {([
          { key: "all",     label: "Todos" },
          { key: "today",   label: "Hoje" },
          { key: "overdue", label: "Atrasados" },
          { key: "pending", label: "Pendentes" },
          { key: "none",    label: "Sem follow-up" },
        ] as const).map(({ key, label }) => (
          <button key={key} onClick={() => setFollowUpFilter(key)}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
                  style={followUpFilter === key
                    ? { background: "var(--bg-card)", color: "var(--text-primary)", boxShadow: "var(--shadow-sm)" }
                    : { color: "var(--text-muted)" }}>
            {label}
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

                    {/* Vendedor responsável — só admin pode atribuir/trocar (a lista de
                        vendedores só é carregada para admin, ver load()). Seller vê
                        apenas um indicador somente-leitura. */}
                    <div className="flex items-center gap-2 mt-2">
                      <UserCog className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
                      {user?.role === "admin" ? (
                        <select
                          value={lead.sellerId ?? ""}
                          disabled={updatingId === lead.id}
                          onChange={(e) => updateSellerId(lead.id, e.target.value || null)}
                          className="px-2 py-1 rounded-lg text-xs"
                          style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
                        >
                          <option value="">Sem vendedor</option>
                          {sellers.map((s) => (
                            <option key={s.uid} value={s.uid}>{s.name}</option>
                          ))}
                        </select>
                      ) : (
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {lead.sellerId === user?.uid ? "Vendedor responsável: você" : lead.sellerId ? "Vendedor responsável atribuído" : "Sem vendedor responsável"}
                        </p>
                      )}
                    </div>

                    {/* Follow-up interno (Bloco 2.5) — próxima ação, data/hora,
                        concluir/reagendar. Responsável é o próprio sellerId acima,
                        não duplicamos essa informação aqui. */}
                    <div className="mt-2 p-2.5 rounded-lg" style={{ background: "var(--bg-hover)", border: "1px solid var(--border)" }}>
                      {editingFollowUpId === lead.id ? (
                        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            placeholder="Próxima ação (ex: Ligar para confirmar entrada)"
                            value={followUpDraft.note}
                            onChange={(e) => setFollowUpDraft((p) => ({ ...p, note: e.target.value }))}
                            className="w-full px-2 py-1.5 rounded-lg text-xs"
                            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                          />
                          <div className="flex items-center gap-2 flex-wrap">
                            <input
                              type="datetime-local"
                              value={followUpDraft.datetimeLocal}
                              onChange={(e) => setFollowUpDraft((p) => ({ ...p, datetimeLocal: e.target.value }))}
                              className="px-2 py-1.5 rounded-lg text-xs"
                              style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                            />
                            <button
                              disabled={!followUpDraft.note.trim() || !followUpDraft.datetimeLocal || updatingId === lead.id}
                              onClick={() => saveFollowUp(lead.id, followUpDraft.note, followUpDraft.datetimeLocal)}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                              style={{ background: "var(--accent)" }}
                            >
                              Salvar
                            </button>
                            <button
                              onClick={() => setEditingFollowUpId(null)}
                              className="px-3 py-1.5 rounded-lg text-xs"
                              style={{ color: "var(--text-muted)" }}
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div onClick={(e) => e.stopPropagation()}>
                          {lead.nextFollowUpAt && lead.followUpStatus === "pending" ? (
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2 min-w-0">
                                <CalendarClock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
                                <div className="min-w-0">
                                  <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>{lead.nextFollowUpNote}</p>
                                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                                    {formatDateTimePt(lead.nextFollowUpAt)}
                                    {new Date(lead.nextFollowUpAt) < now && (
                                      <span className="ml-1.5 font-semibold" style={{ color: "#ef4444" }}>Atrasado</span>
                                    )}
                                    {isSameLocalDay(lead.nextFollowUpAt, now) && (
                                      <span className="ml-1.5 font-semibold" style={{ color: "var(--accent)" }}>Hoje</span>
                                    )}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <button onClick={() => openFollowUpForm(lead)}
                                        disabled={updatingId === lead.id}
                                        className="px-2 py-1 rounded-lg text-xs" style={{ color: "var(--accent)" }}>
                                  Reagendar
                                </button>
                                <button onClick={() => completeFollowUp(lead.id)}
                                        disabled={updatingId === lead.id}
                                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-white"
                                        style={{ background: "#10b981" }}>
                                  <Check className="w-3 h-3" /> Concluir
                                </button>
                              </div>
                            </div>
                          ) : lead.nextFollowUpAt && lead.followUpStatus === "done" ? (
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="min-w-0">
                                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                                  <CheckCircle2 className="w-3 h-3 inline mr-1" style={{ color: "#10b981" }} />
                                  Concluído: &quot;{lead.nextFollowUpNote}&quot; ({formatDateTimePt(lead.nextFollowUpAt)})
                                </p>
                              </div>
                              <button onClick={() => openFollowUpForm(lead)}
                                      disabled={updatingId === lead.id}
                                      className="px-2 py-1 rounded-lg text-xs font-medium flex-shrink-0" style={{ color: "var(--accent)" }}>
                                Agendar novo
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Sem follow-up</p>
                              <button onClick={() => openFollowUpForm(lead)}
                                      disabled={updatingId === lead.id}
                                      className="px-2 py-1 rounded-lg text-xs font-medium" style={{ color: "var(--accent)" }}>
                                Agendar
                              </button>
                            </div>
                          )}
                          {!lead.sellerId && (
                            <p className="text-xs mt-1" style={{ color: "#f59e0b" }}>
                              ⚠ Sem vendedor responsável atribuído.
                            </p>
                          )}
                        </div>
                      )}
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
