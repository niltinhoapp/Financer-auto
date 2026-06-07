"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCustomers } from "@/lib/firestore/customers";
import { formatCPF, formatPhone } from "@/lib/utils";
import type { Customer } from "@financer-auto/shared";
import { Plus, Search, Users, CheckCircle, Clock, XCircle } from "lucide-react";

const approvalBadge: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  pending:  { label: "Pendente",  cls: "bg-amber-100 text-amber-700",   icon: <Clock className="w-3 h-3" /> },
  approved: { label: "Aprovado",  cls: "bg-emerald-100 text-emerald-700", icon: <CheckCircle className="w-3 h-3" /> },
  rejected: { label: "Rejeitado", cls: "bg-red-100 text-red-700",       icon: <XCircle className="w-3 h-3" /> },
};

export default function ClientesPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    getCustomers()
      .then(setCustomers)
      .finally(() => setLoading(false));
  }, []);

  const filtered = customers.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.cpf.includes(q) ||
      c.phone.includes(q)
    );
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-gray-500 text-sm mt-1">{customers.length} cadastrados</p>
        </div>
        <Link
          href="/clientes/novo"
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo Cliente
        </Link>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por nome, CPF ou telefone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>Nenhum cliente encontrado</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">CPF</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Telefone</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Cidade</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono">{formatCPF(c.cpf)}</td>
                  <td className="px-4 py-3 text-gray-600">{formatPhone(c.phone)}</td>
                  <td className="px-4 py-3 text-gray-600">{c.address.city} - {c.address.state}</td>
                  <td className="px-4 py-3">
                    {(() => {
                      const b = approvalBadge[c.approvalStatus ?? "pending"];
                      return (
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${b.cls}`}>
                          {b.icon} {b.label}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/clientes/${c.id}`}
                      className="text-blue-600 hover:text-blue-700 text-xs font-medium"
                    >
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
