"use client";

import { useEffect, useState } from "react";
import { getUsersByRole } from "@/lib/firestore/users";
import { getContracts } from "@/lib/firestore/contracts";
import { criarVendedorFn, excluirVendedorFn } from "@/lib/functions";
import { formatCurrency } from "@/lib/utils";
import type { User } from "@financer-auto/shared";
import { Plus, UserCog, Trash2 } from "lucide-react";

import { useToast } from "@/components/ui/Toast";
export default function VendedoresPage() {
  const { toast } = useToast();
  const [sellers, setSellers] = useState<User[]>([]);
  const [stats, setStats] = useState<Record<string, { count: number; totalSold: number }>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [deletingUid, setDeletingUid] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");

  async function load() {
    try {
      const [s, contracts] = await Promise.all([getUsersByRole("seller"), getContracts()]);
      setSellers(s);
      const byUid: Record<string, { count: number; totalSold: number }> = {};
      contracts.forEach((c) => {
        if (!c.sellerId) return;
        if (!byUid[c.sellerId]) byUid[c.sellerId] = { count: 0, totalSold: 0 };
        byUid[c.sellerId].count += 1;
        byUid[c.sellerId].totalSold += c.salePrice || 0;
      });
      setStats(byUid);
    } catch (err) {
      console.error("Erro ao carregar vendedores:", err);
      setSellers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await criarVendedorFn({
        name: form.name,
        email: form.email,
        phone: form.phone,
        password: form.password,
      });
      setShowForm(false);
      setForm({ name: "", email: "", phone: "", password: "" });
      load();
    } catch (err: unknown) {
      const message =
        (err as { message?: string; details?: string })?.details ??
        (err as Error)?.message ??
        "Erro ao criar vendedor.";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(seller: User) {
    const confirmed = window.confirm(
      `Tem certeza que deseja excluir o vendedor "${seller.name}"?\n\n` +
      `Se ele já tiver contratos vinculados, ele será apenas desativado (para preservar o histórico). ` +
      `Caso contrário, será removido permanentemente.`
    );
    if (!confirmed) return;

    setDeletingUid(seller.uid);
    setDeleteError("");
    try {
      const res = await excluirVendedorFn({ uid: seller.uid });
      if (res.data.mode === "deactivated") {
        toast(`"${seller.name}" possui contratos vinculados e foi apenas desativado.`, "info");
      }
      load();
    } catch (err: unknown) {
      const message =
        (err as { details?: string; message?: string })?.details ??
        (err as Error)?.message ??
        "Erro ao excluir vendedor.";
      setDeleteError(message);
    } finally {
      setDeletingUid(null);
    }
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vendedores</h1>
          <p className="text-gray-500 text-sm mt-1">{sellers.length} cadastrados</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo Vendedor
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold text-gray-800 mb-4">Novo Vendedor</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
              <input
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Senha Inicial</label>
              <input
                type="password"
                required
                minLength={6}
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {error && (
              <div className="col-span-2">
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
              </div>
            )}
            <div className="col-span-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Salvando..." : "Criar Vendedor"}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : sellers.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <UserCog className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>Nenhum vendedor cadastrado</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {deleteError && (
            <p className="text-sm text-red-600 bg-red-50 px-4 py-2.5 border-b border-red-100">{deleteError}</p>
          )}
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">E-mail</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Telefone</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Vendas</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Total Vendido</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sellers.map((s) => (
                <tr key={s.uid} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                  <td className="px-4 py-3 text-gray-600">{s.email}</td>
                  <td className="px-4 py-3 text-gray-600">{s.phone}</td>
                  <td className="px-4 py-3 text-gray-600">{stats[s.uid]?.count ?? 0}</td>
                  <td className="px-4 py-3 text-gray-600">{formatCurrency(stats[s.uid]?.totalSold ?? 0)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                        s.active
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {s.active ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(s)}
                      disabled={deletingUid === s.uid}
                      title="Excluir vendedor"
                      className="inline-flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700 font-medium disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {deletingUid === s.uid ? "Excluindo..." : "Excluir"}
                    </button>
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
