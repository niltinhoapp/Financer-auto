"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import * as Sentry from "@sentry/nextjs";
import { db } from "@/lib/firebase";
import { Settings, Save, Trash2, AlertTriangle } from "lucide-react";
import { maskPhone } from "@/lib/utils";
import { limparDadosFn, privatizarArquivosFn } from "@/lib/functions";
import { useToast } from "@/components/ui/Toast";

type AlvoLimpeza = "leads" | "veiculos" | "clientes" | "contratos" | "despesas";

const LIMPEZAS: { alvo: AlvoLimpeza; label: string; desc: string }[] = [
  { alvo: "leads",     label: "Leads",     desc: "Todos os interesses recebidos pela loja virtual." },
  { alvo: "veiculos",  label: "Veículos",  desc: "Veículos e fotos — apenas os SEM contrato vinculado." },
  { alvo: "clientes",  label: "Clientes",  desc: "Cadastros, documentos e contas de acesso — apenas os SEM contrato." },
  { alvo: "contratos", label: "Contratos", desc: "TODOS os contratos com parcelas, pagamentos e solicitações." },
  { alvo: "despesas",  label: "Despesas",  desc: "Todos os lançamentos do fluxo de caixa." },
];

const PIX_TYPES = [
  { value: "cpf", label: "CPF" },
  { value: "cnpj", label: "CNPJ" },
  { value: "email", label: "E-mail" },
  { value: "phone", label: "Telefone" },
  { value: "random", label: "Chave aleatória" },
];

export default function ConfiguracoesPage() {
  const [form, setForm] = useState({
    companyName: "",
    cnpj: "",
    address: "",
    phone: "",
    pixKeyType: "cpf",
    pixKey: "",
    pixName: "", // nome do recebedor
    whatsapp: "", // WhatsApp da loja virtual (botão flutuante)
  });
  // API de envio automático (Evolution API) — config/whatsapp
  const [waApi, setWaApi] = useState({ apiUrl: "", apiKey: "", instance: "" });
  const [privatizando, setPrivatizando] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Zona de perigo
  const { toast } = useToast();
  const [limpandoAlvo, setLimpandoAlvo] = useState<AlvoLimpeza | null>(null);
  const [confirmTexto, setConfirmTexto] = useState("");
  const [executando, setExecutando] = useState(false);

  async function executarLimpeza() {
    if (!limpandoAlvo || confirmTexto !== "EXCLUIR") return;
    setExecutando(true);
    try {
      const res = await limparDadosFn({ alvo: limpandoAlvo });
      toast(`Limpeza concluída: ${res.data.removidos} registro(s) removido(s).`, "success");
      setLimpandoAlvo(null);
      setConfirmTexto("");
    } catch (e) {
      console.error("Erro ao executar limpeza de dados:", e);
      Sentry.captureException(e);
      toast(e instanceof Error ? e.message : "Erro ao executar limpeza.", "error");
    } finally {
      setExecutando(false);
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const [snap, lojaSnap, waSnap] = await Promise.all([
          getDoc(doc(db, "config", "empresa")),
          getDoc(doc(db, "config", "loja")),
          getDoc(doc(db, "config", "whatsapp")).catch(() => null),
        ]);
        if (snap.exists()) {
          const d = snap.data();
          setForm((f) => ({ ...f, ...d }));
        }
        if (lojaSnap.exists()) {
          setForm((f) => ({ ...f, whatsapp: lojaSnap.data().whatsapp ?? "" }));
        }
        if (waSnap?.exists()) {
          const d = waSnap.data();
          setWaApi({ apiUrl: d.apiUrl ?? "", apiKey: d.apiKey ?? "", instance: d.instance ?? "" });
        }
      } catch (e) {
        console.error("Erro ao carregar configurações:", e);
        Sentry.captureException(e);
        toast("Não foi possível carregar as configurações. Tente novamente.", "error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [toast]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const { whatsapp, ...empresa } = form;
      await Promise.all([
        setDoc(doc(db, "config", "empresa"), {
          ...empresa,
          updatedAt: new Date().toISOString(),
        }),
        setDoc(doc(db, "config", "loja"), {
          whatsapp,
          updatedAt: new Date().toISOString(),
        }),
        setDoc(doc(db, "config", "whatsapp"), {
          ...waApi,
          updatedAt: new Date().toISOString(),
        }),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Settings className="w-5 h-5 text-blue-600" /> Configurações
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">Dados da empresa exibidos nos contratos e instruções de pagamento para o cliente.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Empresa */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <h2 className="font-semibold text-gray-900 text-sm">Dados da Empresa</h2>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nome / Razão Social</label>
              <input
                value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">CNPJ / CPF</label>
              <input
                value={form.cnpj}
                onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Endereço</label>
            <input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Telefone</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: maskPhone(e.target.value) })}
                placeholder="(00) 00000-0000"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">WhatsApp da loja virtual</label>
              <input
                value={form.whatsapp}
                onChange={(e) => setForm({ ...form, whatsapp: maskPhone(e.target.value) })}
                placeholder="(00) 00000-0000"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Exibido como botão flutuante na loja pública.</p>
            </div>
          </div>
        </div>

        {/* PIX */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <h2 className="font-semibold text-gray-900 text-sm">Chave PIX para Recebimento</h2>
          <p className="text-xs text-gray-500 -mt-2">Esta chave é exibida ao cliente quando ele solicita o pagamento de parcelas.</p>

          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tipo de chave</label>
              <select
                value={form.pixKeyType}
                onChange={(e) => setForm({ ...form, pixKeyType: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {PIX_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">Chave PIX</label>
              <input
                value={form.pixKey}
                onChange={(e) => setForm({ ...form, pixKey: e.target.value })}
                placeholder="Digite a chave PIX"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nome do favorecido (como aparece no PIX)</label>
            <input
              value={form.pixName}
              onChange={(e) => setForm({ ...form, pixName: e.target.value })}
              placeholder="Nome que aparece na confirmação do PIX"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Envio automático de avisos (Evolution API) */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-semibold text-gray-900 text-sm">Envio automático de avisos (WhatsApp)</h2>
              <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: "#10b98118", color: "#10b981" }}>Opcional</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Todo dia às 9h o sistema gera lembretes (3 dias antes e no dia do vencimento) e cobranças
              (a partir do dia seguinte ao vencimento). <strong>Você não precisa preencher nada abaixo:</strong> deixando
              em branco, os avisos aparecem prontos na aba <strong>Recebimentos → Avisos</strong> para enviar com 1 clique
              pelo WhatsApp — é o modo recomendado, seguro e sem custo.
            </p>
            <div className="mt-2 flex items-start gap-2 rounded-lg p-3 text-xs"
                 style={{ background: "#f59e0b14", border: "1px solid #f59e0b40", color: "#92600a" }}>
              <span className="text-sm leading-none">⚠️</span>
              <p>
                Preencha os campos abaixo <strong>só se você tiver uma Evolution API</strong> (serviço externo que conecta
                um WhatsApp para envio automático). Atenção: é uma conexão <strong>não oficial</strong> do WhatsApp e o envio
                em massa pode levar ao <strong>bloqueio do número</strong>. Se for usar, prefira um número dedicado da loja.
              </p>
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-700 mb-1">URL da API <span className="font-normal text-gray-400">(opcional)</span></label>
              <input value={waApi.apiUrl} onChange={(e) => setWaApi((p) => ({ ...p, apiUrl: e.target.value }))}
                     placeholder="deixe em branco para envio manual"
                     className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Instância <span className="font-normal text-gray-400">(opcional)</span></label>
              <input value={waApi.instance} onChange={(e) => setWaApi((p) => ({ ...p, instance: e.target.value }))}
                     placeholder="ex: financer"
                     className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">API Key <span className="font-normal text-gray-400">(opcional)</span></label>
            <input type="password" value={waApi.apiKey} onChange={(e) => setWaApi((p) => ({ ...p, apiKey: e.target.value }))}
                   placeholder="deixe em branco para envio manual"
                   className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <Save className="w-4 h-4" />
          {saving ? "Salvando..." : saved ? "✓ Salvo!" : "Salvar configurações"}
        </button>
      </form>

      {/* Privacidade de arquivos (LGPD) */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-3">
        <div>
          <h2 className="font-semibold text-gray-900 text-sm">Privacidade de arquivos (LGPD)</h2>
          <p className="text-xs text-gray-500 mt-1">
            Documentos e comprovantes novos já são salvos como privados. Clique abaixo <strong>uma vez</strong> para
            remover o acesso público dos arquivos enviados antes desta atualização.
          </p>
        </div>
        <button
          onClick={async () => {
            setPrivatizando(true);
            try {
              const res = await privatizarArquivosFn({});
              toast(`${res.data.arquivos} arquivo(s) privatizado(s).`, "success");
            } catch (e) {
              console.error("Erro ao privatizar arquivos:", e);
              Sentry.captureException(e);
              toast(e instanceof Error ? e.message : "Erro ao privatizar arquivos.", "error");
            } finally {
              setPrivatizando(false);
            }
          }}
          disabled={privatizando}
          className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {privatizando ? "Privatizando..." : "Privatizar arquivos antigos"}
        </button>
      </div>

      {/* ── Zona de Perigo — limpeza de dados ───────────────────────── */}
      <div className="bg-white rounded-2xl p-6 space-y-4" style={{ border: "1px solid #ef4444" }}>
        <div>
          <h2 className="font-semibold text-sm flex items-center gap-2" style={{ color: "#ef4444" }}>
            <AlertTriangle className="w-4 h-4" /> Zona de Perigo — Limpeza de Dados
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Remove dados em massa do banco, incluindo imagens e arquivos salvos. <strong>Não pode ser desfeito.</strong> Útil para limpar dados de teste antes de usar de verdade.
          </p>
        </div>

        <div className="space-y-2">
          {LIMPEZAS.map(({ alvo, label, desc }) => (
            <div key={alvo} className="flex items-center gap-3 p-3 rounded-xl border border-gray-200">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{label}</p>
                <p className="text-xs text-gray-500">{desc}</p>
              </div>
              <button
                onClick={() => { setLimpandoAlvo(alvo); setConfirmTexto(""); }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold flex-shrink-0"
                style={{ background: "#fef2f2", color: "#ef4444", border: "1px solid #fca5a5" }}>
                <Trash2 className="w-3.5 h-3.5" /> Limpar
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Modal de confirmação da limpeza */}
      {limpandoAlvo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.6)" }}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#fef2f2" }}>
                <AlertTriangle className="w-5 h-5" style={{ color: "#ef4444" }} />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">
                  Limpar {LIMPEZAS.find((l) => l.alvo === limpandoAlvo)?.label}?
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  {LIMPEZAS.find((l) => l.alvo === limpandoAlvo)?.desc} Esta ação é permanente e não pode ser desfeita.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Para confirmar, digite <strong>EXCLUIR</strong> abaixo:
              </label>
              <input value={confirmTexto} onChange={(e) => setConfirmTexto(e.target.value.toUpperCase())}
                     placeholder="EXCLUIR" autoFocus
                     className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500" />
            </div>

            <div className="flex gap-2">
              <button onClick={() => { setLimpandoAlvo(null); setConfirmTexto(""); }}
                      className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={executarLimpeza} disabled={confirmTexto !== "EXCLUIR" || executando}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
                      style={{ background: "#ef4444" }}>
                {executando ? "Excluindo..." : "Excluir permanentemente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
