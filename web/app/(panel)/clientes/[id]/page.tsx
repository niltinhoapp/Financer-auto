"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getCustomer, updateCustomer } from "@/lib/firestore/customers";
import { getContracts } from "@/lib/firestore/contracts";
import { criarAcessoClienteFn, excluirClienteFn, gerarUrlAssinadaFn } from "@/lib/functions";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";
import { registrarAuditoria } from "@/lib/audit";
import { formatarCPF, formatarTelefone, validarCPF } from "@/lib/validations";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Customer, Contract } from "@financer-auto/shared";
import {
  ArrowLeft, CheckCircle, Clock, XCircle, KeyRound,
  Mail, Copy, ExternalLink, Pencil, X, Save, FileImage, Check, FolderOpen,
  ShieldAlert, Shield, FileText,
} from "lucide-react";
import { collection, getDocs, doc as fsDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

const approvalBadge: Record<string, { label: string; bg: string; color: string; icon: React.ReactNode }> = {
  pending:  { label: "Pendente",  bg: "#f59e0b18", color: "#f59e0b",  icon: <Clock className="w-3.5 h-3.5" /> },
  approved: { label: "Aprovado",  bg: "#10b98118", color: "#10b981", icon: <CheckCircle className="w-3.5 h-3.5" /> },
  rejected: { label: "Rejeitado", bg: "#ef444418", color: "#ef4444", icon: <XCircle className="w-3.5 h-3.5" /> },
};

const inputCls = "input-base";
const labelCls = "block text-xs font-medium mb-1";

export default function ClienteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [accessResult, setAccessResult] = useState<{ resetLink: string; tempPassword?: string } | null>(null);
  const [accessError, setAccessError] = useState("");
  const [copied, setCopied] = useState(false);

  const [customerDocs, setCustomerDocs] = useState<Array<{ tipo: string; url: string; path?: string; fileName: string; status: string; uploadedAt: string }>>([]);

  // Abre arquivo privado com URL assinada de curta duração (LGPD)
  async function abrirArquivo(path: string | undefined, fallbackUrl: string) {
    if (!path) { window.open(fallbackUrl, "_blank"); return; }
    try {
      const res = await gerarUrlAssinadaFn({ path });
      window.open(res.data.url, "_blank");
    } catch {
      window.open(fallbackUrl, "_blank");
    }
  }
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [approvingDoc, setApprovingDoc] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "", cpf: "", phone: "", email: "", birthDate: "",
    street: "", number: "", complement: "", district: "", city: "", state: "", zip: "",
  });
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Restrição interna
  const [restrictionModal, setRestrictionModal] = useState(false);
  const [restrictionReason, setRestrictionReason] = useState("");
  const [savingRestriction, setSavingRestriction] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([getCustomer(id), getContracts({ customerId: id })]).then(([c, ct]) => {
      setCustomer(c);
      setContracts(ct);
      setLoading(false);
    });
    loadDocs();
  }, [id]);

  async function loadDocs() {
    if (!id) return;
    setLoadingDocs(true);
    try {
      const snap = await getDocs(collection(db, "customers", id, "documents"));
      setCustomerDocs(snap.docs.map((d) => ({ tipo: d.id, ...d.data() })) as typeof customerDocs);
    } finally {
      setLoadingDocs(false);
    }
  }

  async function handleDocAction(tipo: string, action: "approved" | "rejected") {
    if (!id) return;
    setApprovingDoc(tipo);
    try {
      await updateDoc(fsDoc(db, "customers", id, "documents", tipo), {
        status: action,
        reviewedAt: new Date().toISOString(),
        reviewedBy: user?.uid,
      });
      await loadDocs();
    } finally {
      setApprovingDoc(null);
    }
  }

  async function handleGenerateAccess() {
    if (!customer) return;
    if (!customer.email) {
      setAccessError("Cliente não possui e-mail cadastrado. Edite o cadastro antes de gerar o acesso.");
      return;
    }
    setGenerating(true);
    setAccessError("");
    setAccessResult(null);
    try {
      const res = await criarAcessoClienteFn({
        customerId: customer.id,
        email: customer.email,
        name: customer.name,
      });
      setAccessResult({ resetLink: res.data.resetLink, tempPassword: (res.data as any).tempPassword });
    } catch (e: any) {
      setAccessError(e?.message ?? "Erro ao gerar acesso. Tente novamente.");
    } finally {
      setGenerating(false);
    }
  }

  function startEdit() {
    if (!customer) return;
    setEditForm({
      name: customer.name ?? "",
      cpf: customer.cpf ?? "",
      phone: customer.phone ?? "",
      email: customer.email ?? "",
      birthDate: customer.birthDate ?? "",
      street: customer.address?.street ?? "",
      number: customer.address?.number ?? "",
      complement: customer.address?.complement ?? "",
      district: customer.address?.district ?? "",
      city: customer.address?.city ?? "",
      state: customer.address?.state ?? "",
      zip: customer.address?.zip ?? "",
    });
    setEditError("");
    setEditing(true);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!customer) return;
    setEditError("");

    const cpfDigits = editForm.cpf.replace(/\D/g, "");
    if (!validarCPF(cpfDigits)) {
      setEditError("CPF inválido. Confira os números digitados.");
      return;
    }
    if (!editForm.name.trim()) {
      setEditError("Informe o nome do cliente.");
      return;
    }

    setSavingEdit(true);
    try {
      await updateCustomer(customer.id, {
        name: editForm.name.trim(),
        cpf: cpfDigits,
        phone: editForm.phone.replace(/\D/g, ""),
        email: editForm.email.trim(),
        birthDate: editForm.birthDate,
        address: {
          street: editForm.street.trim(),
          number: editForm.number.trim(),
          complement: editForm.complement.trim(),
          district: editForm.district.trim(),
          city: editForm.city.trim(),
          state: editForm.state.trim().toUpperCase(),
          zip: editForm.zip.replace(/\D/g, ""),
        },
      });
      const updated = await getCustomer(customer.id);
      setCustomer(updated);
      setEditing(false);
    } catch (err: unknown) {
      setEditError((err as Error)?.message ?? "Erro ao salvar alterações. Tente novamente.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleApplyRestriction() {
    if (!customer || !user) return;
    if (!restrictionReason.trim()) return;
    setSavingRestriction(true);
    try {
      await updateCustomer(customer.id, {
        restricted: true,
        restrictionReason: restrictionReason.trim(),
        restrictedBy: user.uid,
        restrictedAt: new Date().toISOString(),
      } as any);
      registrarAuditoria("cliente_restrito",
        `Bloqueou (restrição interna) ${customer.name} — ${restrictionReason.trim()}`,
        user, { tipo: "cliente", id: customer.id });
      const updated = await getCustomer(customer.id);
      setCustomer(updated);
      setRestrictionModal(false);
      setRestrictionReason("");
    } finally {
      setSavingRestriction(false);
    }
  }

  async function handleRemoveRestriction() {
    if (!customer) return;
    setSavingRestriction(true);
    try {
      await updateCustomer(customer.id, {
        restricted: false,
        restrictionReason: "",
      } as any);
      const updated = await getCustomer(customer.id);
      setCustomer(updated);
    } finally {
      setSavingRestriction(false);
    }
  }

  function copyLink() {
    if (!accessResult) return;
    navigator.clipboard.writeText(accessResult.resetLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="p-4 md:p-8 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-4"
             style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
      </div>
    );
  }

  if (!customer) {
    return <div className="p-4 md:p-8" style={{ color: "var(--text-muted)" }}>Cliente não encontrado.</div>;
  }

  const badge = approvalBadge[customer.approvalStatus ?? "pending"];

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <Link href="/clientes" className="hover:opacity-70" style={{ color: "var(--text-muted)" }}>
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-lg md:text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{customer.name}</h1>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{ background: badge.bg, color: badge.color }}>
          {badge.icon} {badge.label}
        </span>
        {customer.restricted && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                style={{ background: "#ef444418", color: "#ef4444" }}>
            <ShieldAlert className="w-3.5 h-3.5" /> Restrição Interna
          </span>
        )}
        <div className="flex-1" />
        <Link href={`/clientes/${id}/extrato`}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all hover:opacity-80"
              style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
          <FileText className="w-4 h-4" />
          <span className="hidden sm:inline">Extrato</span>
        </Link>
      </div>

      {/* Restrição interna */}
      <div className="card p-4 md:p-6 mb-4" style={customer.restricted ? { borderColor: "#ef444450" } : undefined}>
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
          {customer.restricted
            ? <ShieldAlert className="w-4 h-4" style={{ color: "#ef4444" }} />
            : <Shield className="w-4 h-4" style={{ color: "var(--text-muted)" }} />}
          Restrição Interna de Crédito
        </h2>
        <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
          Marcação interna da loja (não consulta SPC/Serasa). Use para sinalizar clientes com
          histórico de inadimplência antes de aprovar novos contratos.
        </p>

        {customer.restricted ? (
          <div className="rounded-xl p-3 space-y-2" style={{ background: "#ef444410", border: "1px solid #ef444430" }}>
            <p className="text-sm" style={{ color: "var(--text-primary)" }}>
              <strong>Motivo:</strong> {customer.restrictionReason || "—"}
            </p>
            {customer.restrictedAt && (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Marcado em {formatDate(customer.restrictedAt.split("T")[0])}
              </p>
            )}
            {user?.role === "admin" && (
              <button onClick={handleRemoveRestriction} disabled={savingRestriction}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80 disabled:opacity-50"
                      style={{ background: "#10b98118", color: "#10b981", border: "1px solid #10b98130" }}>
                {savingRestriction ? "Removendo..." : "Remover restrição"}
              </button>
            )}
          </div>
        ) : (
          user?.role === "admin" && (
            <button onClick={() => setRestrictionModal(true)}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                    style={{ background: "#ef444418", color: "#ef4444", border: "1px solid #ef444430" }}>
              Marcar restrição interna
            </button>
          )
        )}

        {restrictionModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
               style={{ background: "rgba(0,0,0,.6)" }}>
            <div className="card w-full max-w-md p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>Marcar restrição interna</h3>
                <button onClick={() => setRestrictionModal(false)} style={{ color: "var(--text-muted)" }}>
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Descreva o motivo (ex: parcelas em atraso há mais de 90 dias, contrato anterior renegociado sem acordo).
              </p>
              <textarea value={restrictionReason} onChange={(e) => setRestrictionReason(e.target.value)}
                        rows={3} className={inputCls} placeholder="Motivo da restrição..." />
              <button onClick={handleApplyRestriction} disabled={!restrictionReason.trim() || savingRestriction}
                      className="btn-primary w-full" style={{ background: "#ef4444" }}>
                {savingRestriction ? "Salvando..." : "Confirmar restrição"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Dados pessoais */}
      <div className="card p-4 md:p-6 mb-4">
        <div className="flex items-center justify-between mb-4 pb-2" style={{ borderBottom: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Dados Pessoais</h2>
          {!editing && (
            <button
              onClick={startEdit}
              className="flex items-center gap-1.5 text-xs font-medium hover:opacity-70"
              style={{ color: "var(--accent)" }}
            >
              <Pencil className="w-3.5 h-3.5" />
              Editar cadastro
            </button>
          )}
        </div>

        {editing ? (
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls} style={{ color: "var(--text-secondary)" }}>Nome completo</label>
                <input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                  className={inputCls} required />
              </div>
              <div>
                <label className={labelCls} style={{ color: "var(--text-secondary)" }}>CPF</label>
                <input value={editForm.cpf} onChange={(e) => setEditForm((p) => ({ ...p, cpf: e.target.value }))}
                  className={inputCls} required />
              </div>
              <div>
                <label className={labelCls} style={{ color: "var(--text-secondary)" }}>Telefone</label>
                <input value={editForm.phone} onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))}
                  className={inputCls} />
              </div>
              <div>
                <label className={labelCls} style={{ color: "var(--text-secondary)" }}>E-mail</label>
                <input type="email" value={editForm.email} onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                  className={inputCls} />
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Use o e-mail real do cliente — não reutilize e-mails de admin/vendedor.</p>
              </div>
              <div>
                <label className={labelCls} style={{ color: "var(--text-secondary)" }}>Nascimento</label>
                <input type="date" value={editForm.birthDate} onChange={(e) => setEditForm((p) => ({ ...p, birthDate: e.target.value }))}
                  className={inputCls} />
              </div>
            </div>

            <div className="pt-2" style={{ borderTop: "1px solid var(--border)" }}>
              <p className="text-xs font-medium mb-3 mt-3" style={{ color: "var(--text-secondary)" }}>Endereço</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className={labelCls} style={{ color: "var(--text-secondary)" }}>Rua</label>
                  <input value={editForm.street} onChange={(e) => setEditForm((p) => ({ ...p, street: e.target.value }))}
                    className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} style={{ color: "var(--text-secondary)" }}>Número</label>
                  <input value={editForm.number} onChange={(e) => setEditForm((p) => ({ ...p, number: e.target.value }))}
                    className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} style={{ color: "var(--text-secondary)" }}>Complemento</label>
                  <input value={editForm.complement} onChange={(e) => setEditForm((p) => ({ ...p, complement: e.target.value }))}
                    className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} style={{ color: "var(--text-secondary)" }}>Bairro</label>
                  <input value={editForm.district} onChange={(e) => setEditForm((p) => ({ ...p, district: e.target.value }))}
                    className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} style={{ color: "var(--text-secondary)" }}>Cidade</label>
                  <input value={editForm.city} onChange={(e) => setEditForm((p) => ({ ...p, city: e.target.value }))}
                    className={inputCls} />
                </div>
                <div>
                  <label className={labelCls} style={{ color: "var(--text-secondary)" }}>UF</label>
                  <input value={editForm.state} maxLength={2} onChange={(e) => setEditForm((p) => ({ ...p, state: e.target.value }))}
                    className={`${inputCls} uppercase`} />
                </div>
                <div>
                  <label className={labelCls} style={{ color: "var(--text-secondary)" }}>CEP</label>
                  <input value={editForm.zip} onChange={(e) => setEditForm((p) => ({ ...p, zip: e.target.value }))}
                    className={inputCls} />
                </div>
              </div>
            </div>

            {editError && (
              <p className="text-sm px-3 py-2 rounded-lg" style={{ background: "#ef444418", color: "#ef4444" }}>{editError}</p>
            )}

            <div className="flex flex-col sm:flex-row justify-end gap-3 pt-2">
              <button type="button" onClick={() => setEditing(false)}
                className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium hover:opacity-80"
                style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                <X className="w-4 h-4" /> Cancelar
              </button>
              <button type="submit" disabled={savingEdit} className="btn-primary flex items-center justify-center gap-1.5">
                <Save className="w-4 h-4" /> {savingEdit ? "Salvando..." : "Salvar Alterações"}
              </button>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div><p className="text-xs" style={{ color: "var(--text-muted)" }}>CPF</p><p className="font-mono" style={{ color: "var(--text-primary)" }}>{formatarCPF(customer.cpf)}</p></div>
            <div><p className="text-xs" style={{ color: "var(--text-muted)" }}>Telefone</p><p style={{ color: "var(--text-primary)" }}>{formatarTelefone(customer.phone)}</p></div>
            <div><p className="text-xs" style={{ color: "var(--text-muted)" }}>E-mail</p><p style={{ color: "var(--text-primary)" }}>{customer.email || "—"}</p></div>
            <div><p className="text-xs" style={{ color: "var(--text-muted)" }}>Nascimento</p><p style={{ color: "var(--text-primary)" }}>{customer.birthDate ? formatDate(customer.birthDate) : "—"}</p></div>
            <div className="sm:col-span-2">
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Endereço</p>
              <p style={{ color: "var(--text-primary)" }}>
                {customer.address.street}, {customer.address.number} — {customer.address.district},{" "}
                {customer.address.city}/{customer.address.state} · CEP {customer.address.zip}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Acesso à área do cliente */}
      <div className="card p-4 md:p-6 mb-4">
        <h2 className="text-sm font-semibold mb-1 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
          <KeyRound className="w-4 h-4" style={{ color: "var(--accent)" }} /> Acesso à Área do Cliente
        </h2>

        {customer.approvalStatus !== "approved" ? (
          <p className="text-sm mt-3" style={{ color: "var(--text-muted)" }}>
            O cliente precisa estar <strong>aprovado</strong> antes de gerar o acesso.{" "}
            <Link href="/clientes/aprovacao" className="hover:underline" style={{ color: "var(--accent)" }}>Ir para aprovação</Link>
          </p>
        ) : customer.authUid ? (
          <div className="mt-3 flex items-center gap-2 text-sm rounded-lg px-3 py-2"
               style={{ background: "#10b98118", color: "#10b981" }}>
            <CheckCircle className="w-4 h-4" />
            Acesso já criado para este cliente — ele pode entrar pelo app/portal com o e-mail cadastrado.
          </div>
        ) : (
          <div className="mt-3">
            <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
              Cria um login para o cliente acompanhar contrato, parcelas e pagamentos. Um e-mail de
              definição de senha será enviado para <strong>{customer.email || "—"}</strong>.
            </p>
            <button
              onClick={handleGenerateAccess}
              disabled={generating || !customer.email}
              className="btn-primary flex items-center gap-2"
            >
              <Mail className="w-4 h-4" />
              {generating ? "Gerando..." : "Gerar Acesso e Enviar E-mail"}
            </button>

            {accessError && (
              <p className="text-sm px-3 py-2 rounded-lg mt-3" style={{ background: "#ef444418", color: "#ef4444" }}>{accessError}</p>
            )}

            {accessResult && (
              <div className="mt-3 rounded-lg p-3 space-y-3" style={{ background: "var(--accent-light)", border: "1px solid var(--border)" }}>
                {accessResult.tempPassword && (
                  <div>
                    <p className="text-xs font-medium mb-2" style={{ color: "var(--accent)" }}>
                      ✅ Acesso criado! Entregue ao cliente a senha temporária abaixo — ele será obrigado a trocá-la no primeiro acesso:
                    </p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="text-base font-bold px-3 py-2 rounded tracking-wide"
                            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                        {accessResult.tempPassword}
                      </code>
                      <button onClick={() => { navigator.clipboard.writeText(accessResult.tempPassword!); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                              className="p-1.5 rounded hover:opacity-70" style={{ color: "var(--accent)" }} title="Copiar senha">
                        {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </button>
                      {customer.phone && (
                        <a href={`https://wa.me/55${customer.phone.replace(/\D/g, "")}?text=${encodeURIComponent(
                              `Olá, ${customer.name.split(" ")[0]}! Seu acesso à área do cliente está pronto. 🎉\n\n` +
                              `Acesse: https://financer-auto.vercel.app/login\n` +
                              `E-mail: ${customer.email}\n` +
                              `Senha temporária: ${accessResult.tempPassword}\n\n` +
                              `No primeiro acesso, o sistema pedirá para você criar sua senha pessoal.`
                            )}`}
                           target="_blank" rel="noreferrer"
                           className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                           style={{ background: "#25D366" }}>
                          Enviar pelo WhatsApp
                        </a>
                      )}
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
                    Alternativa: link para o cliente definir a senha por conta própria:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs px-2 py-1.5 rounded flex-1 truncate"
                          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                      {accessResult.resetLink}
                    </code>
                    <button onClick={copyLink} className="p-1.5 rounded hover:opacity-70" style={{ color: "var(--accent)" }}>
                      <Copy className="w-4 h-4" />
                    </button>
                    <a href={accessResult.resetLink} target="_blank" rel="noreferrer" className="p-1.5 rounded hover:opacity-70" style={{ color: "var(--accent)" }}>
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Documentos */}
      <div className="card overflow-hidden mb-4">
        <div className="px-4 md:px-6 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <FolderOpen className="w-4 h-4" style={{ color: "var(--accent)" }} /> Documentos do Cliente
          </h2>
          {customerDocs.length > 0 && (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>{customerDocs.filter(d => d.status === "approved").length}/{customerDocs.length} aprovados</span>
          )}
        </div>
        {loadingDocs ? (
          <div className="flex justify-center py-6">
            <div className="animate-spin rounded-full h-5 w-5 border-4" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
          </div>
        ) : customerDocs.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: "var(--text-muted)" }}>Nenhum documento enviado ainda.</p>
        ) : (
          <div>
            {customerDocs.map((d) => {
              const statusColor = d.status === "approved" ? "#10b981" : d.status === "rejected" ? "#ef4444" : "#f59e0b";
              const statusLabel = d.status === "approved" ? "Aprovado" : d.status === "rejected" ? "Recusado" : "Em análise";
              const labels: Record<string, string> = {
                cpf: "CPF", rg: "RG", residencia: "Comprovante Residência",
                renda: "Comprovante Renda", cnh: "CNH", outros: "Outros",
              };
              return (
                <div key={d.tipo} className="px-4 md:px-6 py-3 flex items-center gap-3 md:gap-4" style={{ borderTop: "1px solid var(--border)" }}>
                  <FileImage className="w-5 h-5 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{labels[d.tipo] ?? d.tipo}</p>
                    <button onClick={() => abrirArquivo(d.path, d.url)}
                            className="text-xs hover:underline truncate block text-left" style={{ color: "var(--accent)" }}>{d.fileName}</button>
                  </div>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: `${statusColor}18`, color: statusColor }}>
                    {statusLabel}
                  </span>
                  {d.status === "pending" && (
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => handleDocAction(d.tipo, "approved")}
                              disabled={approvingDoc === d.tipo}
                              className="p-1.5 rounded-lg transition-colors hover:opacity-70"
                              style={{ color: "#10b981" }}
                              title="Aprovar">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDocAction(d.tipo, "rejected")}
                              disabled={approvingDoc === d.tipo}
                              className="p-1.5 rounded-lg transition-colors hover:opacity-70"
                              style={{ color: "#ef4444" }}
                              title="Recusar">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Contratos */}
      <div className="card overflow-hidden">
        <div className="px-4 md:px-6 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Contratos</h2>
        </div>
        {contracts.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>Nenhum contrato registrado ainda.</p>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="md:hidden">
              {contracts.map((c) => (
                <Link key={c.id} href={`/contratos/${c.id}`}
                      className="block px-4 py-3" style={{ borderTop: "1px solid var(--border)" }}>
                  <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{formatCurrency(c.financedAmount)}</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>{c.installmentsCount}x {formatCurrency(c.installmentValue)}</p>
                  <p className="text-xs mt-0.5 capitalize" style={{ color: "var(--text-muted)" }}>{c.status}</p>
                </Link>
              ))}
            </div>
            {/* Desktop table */}
            <table className="w-full text-sm hidden md:table">
              <thead style={{ background: "var(--bg-hover)" }}>
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Valor Financiado</th>
                  <th className="text-left px-4 py-2 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Parcelas</th>
                  <th className="text-left px-4 py-2 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => (
                  <tr key={c.id} style={{ borderTop: "1px solid var(--border)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                    <td className="px-4 py-3 font-medium" style={{ color: "var(--text-primary)" }}>{formatCurrency(c.financedAmount)}</td>
                    <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>{c.installmentsCount}x {formatCurrency(c.installmentValue)}</td>
                    <td className="px-4 py-3 capitalize" style={{ color: "var(--text-secondary)" }}>{c.status}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/contratos/${c.id}`} className="text-xs font-medium hover:opacity-70" style={{ color: "var(--accent)" }}>Ver</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* ── Zona de perigo: excluir cliente (somente admin, sem contratos) ── */}
      {user?.role === "admin" && (
        <div className="card p-5 mt-4" style={{ borderColor: "var(--danger)" }}>
          <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--danger)" }}>Excluir cliente</h2>
          <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
            Remove o cadastro, os documentos enviados e a conta de acesso do cliente.
            {contracts.length > 0 && " Este cliente possui contratos — não pode ser excluído (use a Restrição Interna para bloquear)."}
          </p>
          {contracts.length === 0 && (
            !confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)}
                      className="px-4 py-2 rounded-xl text-sm font-semibold"
                      style={{ background: "var(--danger-light)", color: "var(--danger)", border: "1px solid var(--danger)" }}>
                Excluir este cliente
              </button>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Tem certeza? Esta ação não pode ser desfeita.</p>
                <button
                  onClick={async () => {
                    setDeleting(true);
                    try {
                      await excluirClienteFn({ customerId: id });
                      toast("Cliente excluído.", "success");
                      router.replace("/clientes");
                    } catch (e: any) {
                      toast(e?.message ?? "Erro ao excluir cliente.", "error");
                      setDeleting(false);
                      setConfirmDelete(false);
                    }
                  }}
                  disabled={deleting}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: "var(--danger)" }}>
                  {deleting ? "Excluindo..." : "Sim, excluir"}
                </button>
                <button onClick={() => setConfirmDelete(false)} className="btn-secondary !py-2">Cancelar</button>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
