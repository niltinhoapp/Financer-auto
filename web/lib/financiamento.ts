export interface FinanciamentoParams {
  valorFinanciado: number;
  taxaMensal: number;
  numeroParcelas: number;
  primeiroVencimento: string;
  multaPerc: number;
  jurosDiarioPerc: number;
}

export interface Parcela {
  numero: number;
  vencimento: string;
  valor: number;
}

export function calcularParcelaMensal(
  principal: number,
  taxaMensal: number,
  n: number
): number {
  if (taxaMensal === 0) return principal / n;
  const r = taxaMensal / 100;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

export function gerarCronograma(params: FinanciamentoParams): Parcela[] {
  const { valorFinanciado, taxaMensal, numeroParcelas, primeiroVencimento } = params;
  const valorParcela = calcularParcelaMensal(valorFinanciado, taxaMensal, numeroParcelas);
  const parcelas: Parcela[] = [];

  const base = new Date(primeiroVencimento + "T00:00:00");

  for (let i = 0; i < numeroParcelas; i++) {
    const venc = new Date(base);
    venc.setMonth(venc.getMonth() + i);
    parcelas.push({
      numero: i + 1,
      vencimento: venc.toISOString().split("T")[0],
      valor: Math.round(valorParcela * 100) / 100,
    });
  }

  return parcelas;
}

/**
 * Gera o cronograma de um acordo "manual": entrada + N parcelas de valor
 * fixo definido pelo vendedor (sem cálculo de juros). Útil para negócios
 * combinados diretamente com o cliente, ex: "3 mil de entrada + 30x de 400".
 */
export function gerarCronogramaManual(
  valorParcela: number,
  numeroParcelas: number,
  primeiroVencimento: string
): Parcela[] {
  const parcelas: Parcela[] = [];
  const base = new Date(primeiroVencimento + "T00:00:00");

  for (let i = 0; i < numeroParcelas; i++) {
    const venc = new Date(base);
    venc.setMonth(venc.getMonth() + i);
    parcelas.push({
      numero: i + 1,
      vencimento: venc.toISOString().split("T")[0],
      valor: Math.round(valorParcela * 100) / 100,
    });
  }

  return parcelas;
}

export function calcularValorAtualizado(
  valorOriginal: number,
  diasAtraso: number,
  multaPerc: number,
  jurosDiarioPerc: number
): number {
  if (diasAtraso <= 0) return valorOriginal;
  const multa = valorOriginal * (multaPerc / 100);
  const juros = valorOriginal * (jurosDiarioPerc / 100) * diasAtraso;
  return Math.round((valorOriginal + multa + juros) * 100) / 100;
}

export function calcularResumoFinanciamento(
  valorVenda: number,
  entrada: number,
  taxaMensal: number,
  numeroParcelas: number
) {
  const valorFinanciado = valorVenda - entrada;
  const valorParcela = calcularParcelaMensal(valorFinanciado, taxaMensal, numeroParcelas);
  const totalPago = entrada + valorParcela * numeroParcelas;
  const totalJuros = totalPago - valorVenda;

  return {
    valorFinanciado: Math.round(valorFinanciado * 100) / 100,
    valorParcela: Math.round(valorParcela * 100) / 100,
    totalPago: Math.round(totalPago * 100) / 100,
    totalJuros: Math.round(totalJuros * 100) / 100,
  };
}
