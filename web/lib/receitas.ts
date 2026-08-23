import type { Contract } from "@financer-auto/shared";

export interface ReceitaItem {
  amount: number;
  /** YYYY-MM-DD */
  paidAt: string;
  origem: "parcela" | "entrada";
}

/**
 * Converte as entradas em dinheiro dos contratos em itens de receita.
 * A entrada registrada no contrato (downPayment) inclui o valor do veículo
 * dado na troca (tradeIn) — que não é dinheiro em caixa — então subtraímos.
 */
export function entradasComoReceitas(contracts: Contract[]): ReceitaItem[] {
  const result: ReceitaItem[] = [];
  for (const c of contracts) {
    const tradeInValor = c.tradeIn?.valor ?? 0;
    const entradaDinheiro = (c.downPayment ?? 0) - tradeInValor;
    if (entradaDinheiro > 0 && c.createdAt) {
      result.push({
        amount: entradaDinheiro,
        paidAt: c.createdAt.slice(0, 10),
        origem: "entrada",
      });
    }
  }
  return result;
}

/** Junta pagamentos de parcelas + entradas de contratos em uma lista única de receitas. */
export function todasReceitas(
  payments: { amount?: number; paidAt?: string }[],
  contracts: Contract[]
): ReceitaItem[] {
  const fromPayments: ReceitaItem[] = payments
    .filter((p) => (p.amount ?? 0) > 0 && p.paidAt)
    .map((p) => ({ amount: p.amount!, paidAt: p.paidAt!.slice(0, 10), origem: "parcela" as const }));
  return [...fromPayments, ...entradasComoReceitas(contracts)];
}
