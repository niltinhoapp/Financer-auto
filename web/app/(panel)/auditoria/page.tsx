"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import * as Sentry from "@sentry/nextjs";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import {
  ShieldCheck, Search, DollarSign, FileText, UserCheck, UserX, Trash2,
  KeyRound, RefreshCw, Ban, Eraser,
} from "lucide-react";

interface Log {
  id: string;
  acao: string;
  descricao: string;
  atorNome: string;
  atorPapel?: string;
  alvoTipo?: string;
  alvoId?: string;
  timestamp: string;
}

const acaoCfg: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  pagamento_confirmado: { label: "Pagamento confirmado", color: "#10b981", Icon: DollarSign },
  pagamento_registrado: { label: "Pagamento registrado", color: "#10b981", Icon: DollarSign },
  pagamento_recusado:   { label: "Pagamento recusado",   color: "#ef4444", Icon: DollarSign },
  contrato_renegociado: { label: "Renegociação",         color: "#f59e0b", Icon: RefreshCw },
  contrato_excluido:    { label: "Contrato excluído",    color: "#ef4444", Icon: Trash2 },
  veiculo_excluido:     { label: "Veículo excluído",     color: "#ef4444", Icon: Trash2 },
  cliente_excluido:     { label: "Cliente excluído",     color: "#ef4444", Icon: Trash2 },
  cliente_aprovado:     { label: "Cliente aprovado",     color: "#10b981", Icon: UserCheck },
  cliente_rejeitado:    { label: "Cliente rejeitado",    color: "#ef4444", Icon: UserX },
  cliente_restrito:     { label: "Restrição aplicada",   color: "#ef4444", Icon: Ban },
  acesso_criado:        { label: "Acesso criado",        color: "#3b82f6", Icon: KeyRound },
  limpeza_dados:        { label: "Limpeza de dados",     color: "#ef4444", Icon: Eraser },
};

function fmtDataHora(iso: string): string {
  try { return new Date(iso).toLocaleString("pt-BR"); } catch { return iso; }
}

export default function AuditoriaPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState("");

  useEffect(() => {
    if (!authLoading && user && user.role !== "admin") router.replace("/dashboard");
  }, [user, authLoading, router]);

  useEffect(() => {
    async function load() {
      try {
        const snap = await getDocs(query(collection(db, "audit"), orderBy("timestamp", "desc"), limit(500)));
        setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Log[]);
      } catch (e) {
        console.error("Erro ao carregar auditoria:", e);
        Sentry.captureException(e);
        toast("Não foi possível carregar o registro de auditoria. Tente novamente.", "error");
      }
      finally { setLoading(false); }
    }
    load();
  }, [toast]);

  const lista = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs
      .filter((l) => !filtro || l.acao === filtro)
      .filter((l) => !q || `${l.descricao} ${l.atorNome}`.toLowerCase().includes(q));
  }, [logs, search, filtro]);

  const acoesPresentes = useMemo(
    () => Array.from(new Set(logs.map((l) => l.acao))),
    [logs]
  );

  return (
    <div className="p-4 md:p-8">
      <div className="mb-5">
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
          <ShieldCheck className="w-5 h-5" style={{ color: "var(--accent)" }} /> Auditoria
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
          Registro de quem fez o quê — pagamentos, exclusões, renegociações e mais.
        </p>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-muted)" }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
                 placeholder="Buscar por descrição ou autor..."
                 className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm"
                 style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
        </div>
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)}
                className="px-3 py-2.5 rounded-xl text-sm"
                style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
          <option value="">Todas as ações</option>
          {acoesPresentes.map((a) => (
            <option key={a} value={a}>{acaoCfg[a]?.label ?? a}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-4" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
        </div>
      ) : lista.length === 0 ? (
        <div className="card py-16 text-center">
          <ShieldCheck className="w-10 h-10 mx-auto mb-3 opacity-20" style={{ color: "var(--text-muted)" }} />
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Nenhum registro de auditoria ainda</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          {lista.map((l, i) => {
            const cfg = acaoCfg[l.acao] ?? { label: l.acao, color: "#94a3b8", Icon: FileText };
            const Icon = cfg.Icon;
            return (
              <div key={l.id} className="flex items-start gap-3 px-4 py-3"
                   style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)" }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                     style={{ background: `${cfg.color}18` }}>
                  <Icon className="w-4 h-4" style={{ color: cfg.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm" style={{ color: "var(--text-primary)" }}>{l.descricao}</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {l.atorNome}{l.atorPapel ? ` (${l.atorPapel})` : ""} · {fmtDataHora(l.timestamp)}
                  </p>
                </div>
                <span className="badge flex-shrink-0" style={{ background: `${cfg.color}18`, color: cfg.color }}>
                  {cfg.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
