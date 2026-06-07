"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getCustomer } from "@/lib/firestore/customers";
import { getContracts } from "@/lib/firestore/contracts";
import { criarAcessoClienteFn } from "@/lib/functions";
import { useAuth } from "@/hooks/useAuth";
import { formatarCPF, formatarTelefone } from "@/lib/validations";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Customer, Contract } from "@financer-auto/shared";
import {
  ArrowLeft, CheckCircle, Clock, XCircle, KeyRound,
  Mail, Copy, ExternalLink,
} from "lucide-react";

const approvalBadge: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  pending:  { label: "Pendente",  cls: "bg-amber-100 text-amber-700",   icon: <Clock className="w-3.5 h-3.5" /> },
  approved: { label: "Aprovado",  cls: "bg-emerald-100 text-emerald-700", icon: <CheckCircle className="w-3.5 h-3.5" /> },
  rejected: { label: "Rejeitado", cls: "bg-red-100 text-red-700",       icon: <XCircle className="w-3.5 h-3.5" /> },
};

export default function ClienteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [accessResult, setAccessResult] = useState<{ resetLink: string } | null>(null);
  const [accessError, setAccessError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([getCustomer(id), getContracts({ customerId: id })]).then(([c, ct]) => {
      setCustomer(c);
      setContracts(ct);
      setLoading(false);
    });
  }, [id]);

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
      setAccessResult({ resetLink: res.data.resetLink });
    } catch (e: any) {
      setAccessError(e?.message ?? "Erro ao gerar acesso. Tente novamente.");
    } finally {
      setGenerating(false);
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
      <div className="p-8 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!customer) {
    return <div className="p-8 text-gray-500">Cliente não encontrado.</div>;
  }

  const badge = approvalBadge[customer.approvalStatus ?? "pending"];

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/clientes" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${badge.cls}`}>
          {badge.icon} {badge.label}
        </span>
      </div>

      {/* Dados pessoais */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">Dados Pessoais</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><p className="text-xs text-gray-500">CPF</p><p className="font-mono text-gray-800">{formatarCPF(customer.cpf)}</p></div>
          <div><p className="text-xs text-gray-500">Telefone</p><p className="text-gray-800">{formatarTelefone(customer.phone)}</p></div>
          <div><p className="text-xs text-gray-500">E-mail</p><p className="text-gray-800">{customer.email || "—"}</p></div>
          <div><p className="text-xs text-gray-500">Nascimento</p><p className="text-gray-800">{customer.birthDate ? formatDate(customer.birthDate) : "—"}</p></div>
          <div className="col-span-2">
            <p className="text-xs text-gray-500">Endereço</p>
            <p className="text-gray-800">
              {customer.address.street}, {customer.address.number} — {customer.address.district},{" "}
              {customer.address.city}/{customer.address.state} · CEP {customer.address.zip}
            </p>
          </div>
        </div>
      </div>

      {/* Acesso à área do cliente */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-1 flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-blue-600" /> Acesso à Área do Cliente
        </h2>

        {customer.approvalStatus !== "approved" ? (
          <p className="text-sm text-gray-500 mt-3">
            O cliente precisa estar <strong>aprovado</strong> antes de gerar o acesso.{" "}
            <Link href="/clientes/aprovacao" className="text-blue-600 hover:underline">Ir para aprovação</Link>
          </p>
        ) : customer.authUid ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
            <CheckCircle className="w-4 h-4" />
            Acesso já criado para este cliente — ele pode entrar pelo app/portal com o e-mail cadastrado.
          </div>
        ) : (
          <div className="mt-3">
            <p className="text-xs text-gray-500 mb-3">
              Cria um login para o cliente acompanhar contrato, parcelas e pagamentos. Um e-mail de
              definição de senha será enviado para <strong>{customer.email || "—"}</strong>.
            </p>
            <button
              onClick={handleGenerateAccess}
              disabled={generating || !customer.email}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Mail className="w-4 h-4" />
              {generating ? "Gerando..." : "Gerar Acesso e Enviar E-mail"}
            </button>

            {accessError && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mt-3">{accessError}</p>
            )}

            {accessResult && (
              <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-800 font-medium mb-2">
                  ✅ Acesso criado! Link de definição de senha (envie manualmente caso o e-mail não chegue):
                </p>
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-white px-2 py-1.5 rounded border border-blue-200 flex-1 truncate">
                    {accessResult.resetLink}
                  </code>
                  <button onClick={copyLink} className="p-1.5 text-blue-600 hover:bg-blue-100 rounded">
                    {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <a href={accessResult.resetLink} target="_blank" rel="noreferrer" className="p-1.5 text-blue-600 hover:bg-blue-100 rounded">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Contratos */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Contratos</h2>
        </div>
        {contracts.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Nenhum contrato registrado ainda.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Valor Financiado</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Parcelas</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Status</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {contracts.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{formatCurrency(c.financedAmount)}</td>
                  <td className="px-4 py-3 text-gray-600">{c.installmentsCount}x {formatCurrency(c.installmentValue)}</td>
                  <td className="px-4 py-3 text-gray-600 capitalize">{c.status}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/contratos/${c.id}`} className="text-blue-600 hover:text-blue-700 text-xs font-medium">Ver</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
