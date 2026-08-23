"use client";

import { useEffect, useState } from "react";
import * as Sentry from "@sentry/nextjs";
import {
  getWorkshops,
  createWorkshop,
  updateWorkshop,
  deleteWorkshop,
} from "@/lib/firestore/workshops";
import type { Workshop } from "@financer-auto/shared";
import { Wrench, Plus, Pencil, Trash2, X, Save, Phone, MapPin } from "lucide-react";

import { useToast } from "@/components/ui/Toast";
const emptyForm = { name: "", phone: "", address: "", specialties: "", active: true };

export default function OficinasPage() {
  const { toast } = useToast();
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setWorkshops(await getWorkshops());
    } catch (e) {
      console.error("Erro ao carregar oficinas:", e);
      Sentry.captureException(e);
      toast("Não foi possível carregar as oficinas. Tente novamente.", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    Promise.resolve().then(() => load());
  }, []);

  function startCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setError("");
    setShowForm(true);
  }

  function startEdit(w: Workshop) {
    setForm({
      name: w.name,
      phone: w.phone,
      address: w.address,
      specialties: (w.specialties ?? []).join(", "),
      active: w.active,
    });
    setEditingId(w.id);
    setError("");
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) {
      setError("Informe o nome da oficina.");
      return;
    }
    setSaving(true);
    try {
      const data = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        specialties: form.specialties
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        active: form.active,
      };
      if (editingId) {
        await updateWorkshop(editingId, data);
      } else {
        await createWorkshop(data);
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      await load();
    } catch (err: unknown) {
      console.error("Erro ao salvar oficina:", err);
      Sentry.captureException(err);
      setError((err as Error)?.message ?? "Erro ao salvar oficina.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(w: Workshop) {
    if (!window.confirm(`Excluir a oficina "${w.name}"?`)) return;
    setDeletingId(w.id);
    try {
      await deleteWorkshop(w.id);
      await load();
    } catch (err: unknown) {
      console.error("Erro ao excluir oficina:", err);
      Sentry.captureException(err);
      toast((err as Error)?.message ?? "Erro ao excluir oficina.", "error");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Oficinas Autorizadas</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Cadastre as oficinas parceiras para garantia e revisões dos veículos vendidos.
          </p>
        </div>
        <button
          onClick={startCreate}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nova Oficina
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">{editingId ? "Editar Oficina" : "Nova Oficina"}</h2>
            <button type="button" onClick={() => setShowForm(false)} aria-label="Fechar formulário" className="text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Endereço</label>
            <input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Especialidades (separadas por vírgula)</label>
            <input
              value={form.specialties}
              onChange={(e) => setForm({ ...form, specialties: e.target.value })}
              placeholder="Mecânica geral, Funilaria, Elétrica"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Oficina ativa
          </label>

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </form>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : workshops.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Wrench className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhuma oficina cadastrada ainda</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Nome</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Contato</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Especialidades</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {workshops.map((w) => (
                <tr key={w.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{w.name}</td>
                  <td className="px-4 py-3 text-gray-600">
                    <div className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-gray-400" /> {w.phone || "—"}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 text-xs text-gray-400">
                      <MapPin className="w-3.5 h-3.5" /> {w.address || "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {(w.specialties ?? []).length ? w.specialties.join(", ") : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                        w.active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {w.active ? "Ativa" : "Inativa"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => startEdit(w)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
                        title="Editar"
                        aria-label={`Editar oficina ${w.name}`}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(w)}
                        disabled={deletingId === w.id}
                        className="p-1.5 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                        title="Excluir"
                        aria-label={`Excluir oficina ${w.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
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
