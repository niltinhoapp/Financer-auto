"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, getDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { uploadDocumentoFn, gerarUrlAssinadaFn } from "@/lib/functions";
import {
  FileText, Upload, CheckCircle2, Clock, XCircle, AlertCircle,
  ArrowLeft, FileImage, Trash2,
} from "lucide-react";
import Link from "next/link";

import { useToast } from "@/components/ui/Toast";
interface DocDef {
  tipo: string;
  label: string;
  desc: string;
  obrigatorio: boolean;
}

const DOCS: DocDef[] = [
  { tipo: "cpf",       label: "Foto do CPF",                  desc: "Frente do documento — JPG, PNG ou PDF", obrigatorio: true },
  { tipo: "rg",        label: "Foto do RG",                   desc: "Frente e verso — JPG, PNG ou PDF",      obrigatorio: true },
  { tipo: "residencia",label: "Comprovante de Residência",    desc: "Conta de luz, água ou telefone",        obrigatorio: true },
  { tipo: "renda",     label: "Comprovante de Renda",         desc: "Holerite, extrato ou declaração",       obrigatorio: true },
  { tipo: "cnh",       label: "CNH (opcional)",               desc: "Carteira de habilitação",               obrigatorio: false },
  { tipo: "outros",    label: "Outros documentos",            desc: "Qualquer doc adicional solicitado",     obrigatorio: false },
];

type DocStatus = "missing" | "pending" | "approved" | "rejected";

interface DocState {
  path?: string;
  tipo: string;
  url?: string;
  fileName?: string;
  status: DocStatus;
  uploading?: boolean;
  file?: File | null;
}

const statusCfg: Record<DocStatus, { label: string; icon: typeof Clock; color: string }> = {
  missing:  { label: "Não enviado",  icon: AlertCircle,   color: "#94a3b8" },
  pending:  { label: "Em análise",   icon: Clock,         color: "#f59e0b" },
  approved: { label: "Aprovado",     icon: CheckCircle2,  color: "#10b981" },
  rejected: { label: "Recusado",     icon: XCircle,       color: "#ef4444" },
};

export default function DocumentosPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [customerId, setCustomerId] = useState<string>("");
  const [docs, setDocs] = useState<DocState[]>(DOCS.map((d) => ({ tipo: d.tipo, status: "missing" })));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        const userDoc = await getDoc(doc(db, "users", user!.uid));
        const cid = userDoc.data()?.customerId;
        if (!cid) return;
        setCustomerId(cid);

        const snap = await getDocs(collection(db, "customers", cid, "documents"));
        const uploaded: Record<string, DocState> = {};
        snap.forEach((d) => {
          uploaded[d.id] = { tipo: d.id, ...d.data() } as DocState;
        });

        setDocs(DOCS.map((d) => uploaded[d.tipo] ?? { tipo: d.tipo, status: "missing" }));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user]);

  async function handleUpload(tipo: string, file: File) {
    if (!customerId) return;
    setDocs((prev) => prev.map((d) => d.tipo === tipo ? { ...d, uploading: true, file } : d));
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const result = await uploadDocumentoFn({ base64, fileName: file.name, customerId, docTipo: tipo });
      setDocs((prev) =>
        prev.map((d) =>
          d.tipo === tipo
            ? { tipo, url: result.data.url, fileName: file.name, status: "pending", uploading: false }
            : d
        )
      );
    } catch (err) {
      console.error("Erro ao enviar documento:", err);
      toast("Erro ao enviar documento. Tente novamente.", "error");
      setDocs((prev) => prev.map((d) => d.tipo === tipo ? { ...d, uploading: false } : d));
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-4" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
      </div>
    );
  }

  const total = DOCS.filter((d) => d.obrigatorio).length;
  const done  = docs.filter((d) => {
    const def = DOCS.find((x) => x.tipo === d.tipo);
    return def?.obrigatorio && (d.status === "approved" || d.status === "pending");
  }).length;
  const pct = Math.round((done / total) * 100);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/minha-area" style={{ color: "var(--text-muted)" }} className="hover:opacity-80 transition-opacity">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Meus Documentos</h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Envie seus documentos para habilitar a compra
          </p>
        </div>
      </div>

      {/* Progresso */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            Documentos obrigatórios
          </p>
          <p className="text-sm font-bold" style={{ color: "var(--accent)" }}>{done}/{total}</p>
        </div>
        <div className="w-full rounded-full h-2" style={{ background: "var(--border)" }}>
          <div
            className="h-2 rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: "linear-gradient(90deg,var(--accent),#6366f1)" }}
          />
        </div>
        {pct === 100 ? (
          <p className="text-xs mt-2" style={{ color: "#10b981" }}>✓ Todos os documentos obrigatórios enviados!</p>
        ) : (
          <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
            Envie todos os documentos obrigatórios para liberar sua conta.
          </p>
        )}
      </div>

      {/* Lista de documentos */}
      <div className="space-y-3">
        {DOCS.map((def) => {
          const state = docs.find((d) => d.tipo === def.tipo) ?? { tipo: def.tipo, status: "missing" as DocStatus };
          const cfg = statusCfg[state.status];
          const Icon = cfg.icon;

          return (
            <div key={def.tipo} className="card p-5">
              <div className="flex items-start gap-4">
                {/* Icon */}
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                     style={{ background: `${cfg.color}18` }}>
                  <Icon className="w-5 h-5" style={{ color: cfg.color }} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                      {def.label}
                    </p>
                    {def.obrigatorio && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                        Obrigatório
                      </span>
                    )}
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full ml-auto"
                          style={{ background: `${cfg.color}18`, color: cfg.color }}>
                      {cfg.label}
                    </span>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{def.desc}</p>

                  {state.url && (
                    <button
                      onClick={async () => {
                        try {
                          if (state.path) {
                            const res = await gerarUrlAssinadaFn({ path: state.path });
                            window.open(res.data.url, "_blank");
                          } else {
                            window.open(state.url, "_blank");
                          }
                        } catch { window.open(state.url!, "_blank"); }
                      }}
                      className="inline-flex items-center gap-1.5 mt-2 text-xs font-medium"
                      style={{ color: "var(--accent)" }}
                    >
                      <FileImage className="w-3.5 h-3.5" />
                      {state.fileName ?? "Ver documento"}
                    </button>
                  )}

                  {state.status === "rejected" && (
                    <p className="text-xs mt-1 font-medium" style={{ color: "#ef4444" }}>
                      Documento recusado. Envie novamente com qualidade melhor.
                    </p>
                  )}
                </div>
              </div>

              {/* Upload */}
              {(state.status === "missing" || state.status === "rejected") && (
                <div className="mt-4">
                  {state.uploading ? (
                    <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "var(--bg-hover)" }}>
                      <div className="animate-spin rounded-full h-4 w-4 border-2" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
                      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Enviando...</span>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed cursor-pointer transition-all"
                           style={{ borderColor: "var(--border)" }}
                           onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
                           onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}>
                      <Upload className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
                      <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                        Clique para enviar
                      </span>
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleUpload(def.tipo, f);
                        }}
                      />
                    </label>
                  )}
                </div>
              )}

              {/* Re-enviar se já aprovado */}
              {state.status === "approved" && (
                <label className="flex items-center gap-2 mt-3 text-xs cursor-pointer" style={{ color: "var(--text-muted)" }}>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Substituir documento</span>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUpload(def.tipo, f);
                    }}
                  />
                </label>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
