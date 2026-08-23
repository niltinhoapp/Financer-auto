"use client";

import { useEffect, useState } from "react";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { approveCustomer } from "@/lib/firestore/customers";
import { useAuth } from "@/hooks/useAuth";
import { registrarAuditoria } from "@/lib/audit";
import { formatarCPF, formatarTelefone } from "@/lib/validations";
import { CheckCircle, XCircle, Clock, User } from "lucide-react";
import type { Customer } from "@financer-auto/shared";

export default function AprovacaoClientesPage() {
  const { user } = useAuth();
  const [clientes, setClientes] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pending" | "approved" | "rejected">("pending");
  const [processing, setProcessing] = useState<string | null>(null);
  const [noteMap, setNoteMap] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    const q = query(
      collection(db, "customers"),
      where("approvalStatus", "==", tab),
      orderBy("createdAt", "desc")
    );
    const snap = await getDocs(q);
    setClientes(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Customer)));
    setLoading(false);
  }

  useEffect(() => { load(); }, [tab]);

  async function handleApproval(id: string, approved: boolean) {
    if (!user) return;
    setProcessing(id);
    await approveCustomer(id, user.uid, approved, noteMap[id] ?? "");
    const c = clientes.find((x) => x.id === id);
    registrarAuditoria(
      approved ? "cliente_aprovado" : "cliente_rejeitado",
      `${approved ? "Aprovou" : "Rejeitou"} o cliente ${c?.name ?? id}` + (noteMap[id] ? ` — ${noteMap[id]}` : ""),
      user, { tipo: "cliente", id },
    );
    setProcessing(null);
    load();
  }

  const tabCounts = {
    pending: "Pendentes",
    approved: "Aprovados",
    rejected: "Rejeitados",
  };

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Aprovação de Clientes</h1>
        <p className="text-gray-500 text-sm mt-1">
          Valide os dados antes de liberar contratos
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {(Object.entries(tabCounts) as [typeof tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : clientes.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <User className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhum cliente {tabCounts[tab].toLowerCase()} no momento</p>
        </div>
      ) : (
        <div className="space-y-4">
          {clientes.map((c) => (
            <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between gap-4">
                {/* Dados do cliente */}
                <div className="flex-1 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                  <div>
                    <p className="text-xs text-gray-500">Nome</p>
                    <p className="font-semibold text-gray-900">{c.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">CPF</p>
                    <p className="font-mono text-gray-800">{formatarCPF(c.cpf)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Telefone</p>
                    <p className="text-gray-700">{formatarTelefone(c.phone)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Nascimento</p>
                    <p className="text-gray-700">
                      {c.birthDate
                        ? new Date(c.birthDate + "T12:00:00").toLocaleDateString("pt-BR")
                        : "—"}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-gray-500">Endereço</p>
                    <p className="text-gray-700">
                      {c.address.street}, {c.address.number}
                      {c.address.complement ? ` (${c.address.complement})` : ""} —{" "}
                      {c.address.district}, {c.address.city}/{c.address.state} · CEP {c.address.zip}
                    </p>
                  </div>
                  {c.approvalNote && (
                    <div className="col-span-2">
                      <p className="text-xs text-gray-500">Observação</p>
                      <p className="text-gray-600 italic">"{c.approvalNote}"</p>
                    </div>
                  )}
                </div>

                {/* Badge status */}
                <div className="flex-shrink-0">
                  {c.approvalStatus === "pending" && (
                    <span className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
                      <Clock className="w-3.5 h-3.5" /> Pendente
                    </span>
                  )}
                  {c.approvalStatus === "approved" && (
                    <span className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
                      <CheckCircle className="w-3.5 h-3.5" /> Aprovado
                    </span>
                  )}
                  {c.approvalStatus === "rejected" && (
                    <span className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-red-100 text-red-700">
                      <XCircle className="w-3.5 h-3.5" /> Rejeitado
                    </span>
                  )}
                </div>
              </div>

              {/* Ações de aprovação — apenas para pendentes */}
              {tab === "pending" && (
                <div className="mt-4 pt-4 border-t border-gray-100 flex items-end gap-3">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Observação (opcional)
                    </label>
                    <input
                      type="text"
                      value={noteMap[c.id] ?? ""}
                      onChange={(e) =>
                        setNoteMap((prev) => ({ ...prev, [c.id]: e.target.value }))
                      }
                      placeholder="Ex: Documento ilegível, solicitar reenvio..."
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <button
                    onClick={() => handleApproval(c.id, false)}
                    disabled={processing === c.id}
                    className="flex items-center gap-1.5 px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
                  >
                    <XCircle className="w-4 h-4" />
                    Rejeitar
                  </button>
                  <button
                    onClick={() => handleApproval(c.id, true)}
                    disabled={processing === c.id}
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                  >
                    <CheckCircle className="w-4 h-4" />
                    {processing === c.id ? "Salvando..." : "Aprovar"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
