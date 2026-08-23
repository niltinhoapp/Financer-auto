"use client";

import { useEffect, useMemo, useState } from "react";
import { collectionGroup, getDocs, query, collection } from "firebase/firestore";
import * as Sentry from "@sentry/nextjs";
import { db } from "@/lib/firebase";
import { formatCurrency, formatDate, daysBetween, todayISO } from "@/lib/utils";
import { calcularValorAtualizado } from "@/lib/financiamento";
import { useToast } from "@/components/ui/Toast";
import { AlertTriangle, Download, MessageCircle, Search, TrendingDown } from "lucide-react";

interface DevedorParcela {
  contractId: string;
  number: number;
  dueDate: string;
  value: number;
  diasAtraso: number;
  valorAtualizado: number;
}
interface Devedor {
  customerId: string;
  nome: string;
  phone?: string;
  parcelas: DevedorParcela[];
  totalOriginal: number;
  totalAtualizado: number;
  maxAtraso: number;
}

function buildCobranca(nome: string, dev: Devedor): string {
  const primeiro = nome.split(" ")[0];
  return (
    `Olá, ${primeiro}! Tudo bem? 😊\n\n` +
    `Você tem ${dev.parcelas.length} parcela(s) em aberto, somando ${formatCurrency(dev.totalAtualizado)} ` +
    `(já com multa e juros).\n\n` +
    `Para regularizar ou combinar o pagamento, é só responder por aqui. Obrigado!`
  );
}

function waLink(phone: string | undefined, msg: string): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  if (d.length < 10) return null;
  return `https://wa.me/${d.startsWith("55") ? d : "55" + d}?text=${encodeURIComponent(msg)}`;
}

export default function InadimplenciaPage() {
  const { toast } = useToast();
  const [devedores, setDevedores] = useState<Devedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [ordenar, setOrdenar] = useState<"valor" | "atraso">("valor");
  const today = todayISO();

  useEffect(() => {
    async function load() {
      try {
        const [instSnap, contractsSnap, customersSnap] = await Promise.all([
          getDocs(collectionGroup(db, "installments")),
          getDocs(collection(db, "contracts")),
          getDocs(collection(db, "customers")),
        ]);
        const contractById: Record<
          string,
          { customerId: string; penaltyRate?: number; dailyInterestRate?: number }
        > = {};
        contractsSnap.docs.forEach((d) => (contractById[d.id] = d.data() as (typeof contractById)[string]));
        const custById: Record<string, { name?: string; phone?: string }> = {};
        customersSnap.docs.forEach((d) => (custById[d.id] = d.data()));

        const porCliente: Record<string, Devedor> = {};
        for (const docu of instSnap.docs) {
          const inst = docu.data() as { status?: string; dueDate: string; value: number; number: number };
          if (inst.status === "paid" || inst.status === "renegotiated") continue;
          if (inst.dueDate >= today) continue; // só atrasadas
          const contractId = docu.ref.parent.parent!.id;
          const contract = contractById[contractId];
          if (!contract) continue;
          const cid = contract.customerId;
          const cust = custById[cid];
          const dias = daysBetween(inst.dueDate, today);
          const atualizado = calcularValorAtualizado(inst.value, dias, contract.penaltyRate ?? 2, contract.dailyInterestRate ?? 0.1);

          if (!porCliente[cid]) {
            porCliente[cid] = {
              customerId: cid, nome: cust?.name ?? "Cliente", phone: cust?.phone,
              parcelas: [], totalOriginal: 0, totalAtualizado: 0, maxAtraso: 0,
            };
          }
          const dev = porCliente[cid];
          dev.parcelas.push({ contractId, number: inst.number, dueDate: inst.dueDate, value: inst.value, diasAtraso: dias, valorAtualizado: atualizado });
          dev.totalOriginal += inst.value;
          dev.totalAtualizado += atualizado;
          dev.maxAtraso = Math.max(dev.maxAtraso, dias);
        }
        setDevedores(Object.values(porCliente));
      } catch (e) {
        console.error("Erro ao carregar inadimplência:", e);
        Sentry.captureException(e);
        toast("Não foi possível carregar os dados de inadimplência. Tente novamente.", "error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [today, toast]);

  const lista = useMemo(() => {
    const q = search.trim().toLowerCase();
    return devedores
      .filter((d) => !q || d.nome.toLowerCase().includes(q))
      .sort((a, b) => ordenar === "valor" ? b.totalAtualizado - a.totalAtualizado : b.maxAtraso - a.maxAtraso);
  }, [devedores, search, ordenar]);

  const totalGeral = devedores.reduce((a, d) => a + d.totalAtualizado, 0);
  const totalParcelas = devedores.reduce((a, d) => a + d.parcelas.length, 0);

  function exportarCSV() {
    const linhas = [["Cliente", "Telefone", "Parcelas em atraso", "Maior atraso (dias)", "Valor original", "Valor atualizado"]];
    lista.forEach((d) => linhas.push([
      d.nome, d.phone ?? "", String(d.parcelas.length), String(d.maxAtraso),
      d.totalOriginal.toFixed(2).replace(".", ","), d.totalAtualizado.toFixed(2).replace(".", ","),
    ]));
    const csv = linhas.map((l) => l.map((c) => `"${c}"`).join(";")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `inadimplencia_${today}.csv`;
    a.click();
  }

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Inadimplência</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>Quem está devendo, há quanto tempo e quanto</p>
        </div>
        {lista.length > 0 && (
          <button onClick={exportarCSV} className="btn-secondary flex items-center gap-2">
            <Download className="w-4 h-4" /> Exportar
          </button>
        )}
      </div>

      {/* Totais */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="card p-4">
          <p className="text-xs flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
            <TrendingDown className="w-3.5 h-3.5" /> Total em atraso
          </p>
          <p className="text-lg md:text-2xl font-bold mt-1" style={{ color: "#ef4444" }}>{formatCurrency(totalGeral)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
            <AlertTriangle className="w-3.5 h-3.5" /> Clientes / parcelas
          </p>
          <p className="text-lg md:text-2xl font-bold mt-1" style={{ color: "var(--text-primary)" }}>
            {devedores.length} <span className="text-sm font-normal" style={{ color: "var(--text-muted)" }}>/ {totalParcelas} parc.</span>
          </p>
        </div>
      </div>

      {/* Busca + ordenação */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-muted)" }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
                 placeholder="Buscar cliente..."
                 className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm"
                 style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
        </div>
        <select value={ordenar} onChange={(e) => setOrdenar(e.target.value as "valor" | "atraso")}
                className="px-3 py-2.5 rounded-xl text-sm"
                style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
          <option value="valor">Maior valor</option>
          <option value="atraso">Maior atraso</option>
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-4" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
        </div>
      ) : lista.length === 0 ? (
        <div className="card py-16 text-center">
          <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-20" style={{ color: "var(--text-muted)" }} />
          <p className="font-semibold" style={{ color: "var(--text-primary)" }}>Nenhuma parcela em atraso 🎉</p>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Sua carteira está em dia.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {lista.map((d) => {
            const link = waLink(d.phone, buildCobranca(d.nome, d));
            return (
              <div key={d.customerId} className="card p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="font-semibold" style={{ color: "var(--text-primary)" }}>{d.nome}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="badge badge-danger">{d.parcelas.length} parcela(s)</span>
                      <span className="badge" style={{ background: "var(--warning-light)", color: "var(--warning)" }}>
                        até {d.maxAtraso} dias
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold" style={{ color: "#ef4444" }}>{formatCurrency(d.totalAtualizado)}</p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>orig. {formatCurrency(d.totalOriginal)}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  {link && (
                    <a href={link} target="_blank" rel="noopener noreferrer"
                       className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white"
                       style={{ background: "#25D366" }}>
                      <MessageCircle className="w-3.5 h-3.5" /> Cobrar no WhatsApp
                    </a>
                  )}
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Parcelas: {d.parcelas.map((p) => `#${p.number} (${formatDate(p.dueDate)})`).join(", ")}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
