"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getCustomer } from "@/lib/firestore/customers";
import { getContracts, getInstallments, getPayments } from "@/lib/firestore/contracts";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Customer, Contract } from "@financer-auto/shared";
import { ArrowLeft, Download, FileText, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import { gerarPDFExtrato, type ExtratoLancamento } from "@/lib/pdf/gerarExtrato";

import { useToast } from "@/components/ui/Toast";
const statusLabel: Record<string, string> = {
  pending: "Pendente",
  paid: "Pago",
  overdue: "Atrasado",
  renegotiated: "Renegociado",
};

interface Lancamento {
  data: string; // YYYY-MM-DD
  descricao: string;
  contractId: string;
  tipo: "parcela" | "pagamento";
  valor: number;
  status?: string;
}

export default function ExtratoClientePage() {
  const { toast } = useToast();
  const { id } = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [saldoAberto, setSaldoAberto] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!id) return;
      const cust = await getCustomer(id);
      setCustomer(cust);
      const conts = await getContracts({ customerId: id });
      setContracts(conts);

      const all: Lancamento[] = [];
      let aberto = 0;
      for (const c of conts) {
        const [installments, payments] = await Promise.all([
          getInstallments(c.id),
          getPayments(c.id),
        ]);
        for (const inst of installments) {
          if (inst.status !== "paid" && inst.status !== "renegotiated") aberto += inst.value;
          all.push({
            data: inst.dueDate,
            descricao: `Parcela ${inst.number}/${c.installmentsCount} — Contrato ${c.id.slice(0, 8)}`,
            contractId: c.id,
            tipo: "parcela",
            valor: inst.value,
            status: inst.status,
          });
        }
        for (const p of payments) {
          all.push({
            data: p.paidAt,
            descricao: `Pagamento recebido — Contrato ${c.id.slice(0, 8)}`,
            contractId: c.id,
            tipo: "pagamento",
            valor: p.amount,
          });
        }
        if (c.downPayment > 0) {
          all.push({
            data: c.createdAt.split("T")[0],
            descricao: `Entrada — Contrato ${c.id.slice(0, 8)}`,
            contractId: c.id,
            tipo: "pagamento",
            valor: c.downPayment,
          });
        }
      }
      all.sort((a, b) => a.data.localeCompare(b.data));
      setLancamentos(all);
      setSaldoAberto(aberto);
      setLoading(false);
    }
    load();
  }, [id]);

  const totalContratado = contracts.reduce((acc, c) => acc + c.salePrice, 0);
  const totalPago = lancamentos.filter((l) => l.tipo === "pagamento").reduce((a, l) => a + l.valor, 0);
  // Saldo devedor real = soma das parcelas em aberto (exclui pagas e renegociadas)
  const saldoDevedor = saldoAberto;

  async function handleDownload() {
    if (!customer) return;
    try {
      const data: ExtratoLancamento[] = lancamentos.map((l) => ({
        data: formatDate(l.data),
        descricao: l.descricao,
        tipo: l.tipo,
        valor: l.valor,
        status: l.status ? statusLabel[l.status] ?? l.status : undefined,
      }));
      const bytes = await gerarPDFExtrato({
        clienteNome: customer.name,
        clienteCpf: customer.cpf,
        geradoEm: new Date().toLocaleDateString("pt-BR"),
        totalContratado,
        totalPago,
        saldoDevedor,
        lancamentos: data,
      });
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `extrato_${customer.name.replace(/\s+/g, "_").toLowerCase()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Erro ao gerar extrato:", e);
      toast("Erro ao gerar PDF do extrato.", "error");
    }
  }

  if (loading) {
    return (
      <div className="p-4 md:p-8 flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-4"
             style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
      </div>
    );
  }

  if (!customer) {
    return <div className="p-8" style={{ color: "var(--text-muted)" }}>Cliente não encontrado.</div>;
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/clientes/${id}`} style={{ color: "var(--text-muted)" }} className="hover:opacity-70 transition-opacity">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl md:text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Extrato</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>{customer.name}</p>
        </div>
        <button
          onClick={handleDownload}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all hover:opacity-80"
          style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
        >
          <Download className="w-4 h-4" />
          <span className="hidden sm:inline">Baixar PDF</span>
        </button>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="card p-4">
          <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>Total Contratado</p>
          <p className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{formatCurrency(totalContratado)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>Total Pago</p>
          <p className="text-lg font-bold" style={{ color: "#10b981" }}>{formatCurrency(totalPago)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>Saldo Devedor</p>
          <p className="text-lg font-bold" style={{ color: saldoDevedor > 0 ? "#ef4444" : "#10b981" }}>{formatCurrency(saldoDevedor)}</p>
        </div>
      </div>

      {/* Lançamentos */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <h2 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>Histórico</h2>
        </div>
        {lancamentos.length === 0 ? (
          <div className="py-14 text-center">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-20" style={{ color: "var(--text-muted)" }} />
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Nenhum lançamento encontrado</p>
          </div>
        ) : (
          <div>
            {lancamentos.map((l, idx) => (
              <div key={idx} className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
                {l.tipo === "pagamento" ? (
                  <ArrowDownCircle className="w-4 h-4 flex-shrink-0" style={{ color: "#10b981" }} />
                ) : (
                  <ArrowUpCircle className="w-4 h-4 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{l.descricao}</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {formatDate(l.data)}
                    {l.status && ` · ${statusLabel[l.status] ?? l.status}`}
                  </p>
                </div>
                <p className="font-bold text-sm flex-shrink-0" style={{ color: l.tipo === "pagamento" ? "#10b981" : "var(--text-primary)" }}>
                  {l.tipo === "pagamento" ? "+ " : ""}{formatCurrency(l.valor)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
