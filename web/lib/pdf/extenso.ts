/** Conversão de números para extenso em português (PT-BR), para uso em
 *  notas promissórias e documentos financeiros. Suporta valores até
 *  999.999.999,99.
 */

const UNIDADES = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
const DEZ_A_DEZENOVE = [
  "dez", "onze", "doze", "treze", "catorze", "quinze",
  "dezesseis", "dezessete", "dezoito", "dezenove",
];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = [
  "", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos",
  "seiscentos", "setecentos", "oitocentos", "novecentos",
];

/** Converte um número de 0 a 999 para extenso. */
function grupoPorExtenso(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";

  const partes: string[] = [];
  const c = Math.floor(n / 100);
  const resto = n % 100;

  if (c > 0) partes.push(CENTENAS[c]);

  if (resto > 0) {
    if (resto < 10) {
      partes.push(UNIDADES[resto]);
    } else if (resto < 20) {
      partes.push(DEZ_A_DEZENOVE[resto - 10]);
    } else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      partes.push(u > 0 ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]);
    }
  }

  return partes.join(" e ");
}

/** Converte um inteiro não-negativo (até 999.999.999) para extenso. */
export function inteiroPorExtenso(n: number): string {
  if (n === 0) return "zero";
  if (n < 0) return `menos ${inteiroPorExtenso(-n)}`;

  const milhoes = Math.floor(n / 1_000_000);
  const milhares = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;

  const partes: string[] = [];

  if (milhoes > 0) {
    partes.push(milhoes === 1 ? "um milhão" : `${grupoPorExtenso(milhoes)} milhões`);
  }
  if (milhares > 0) {
    partes.push(milhares === 1 ? "mil" : `${grupoPorExtenso(milhares)} mil`);
  }
  if (resto > 0) {
    // "e" antes do último grupo quando o resto < 100 ou é múltiplo de 100
    const precisaE = (milhoes > 0 || milhares > 0) && (resto < 100 || resto % 100 === 0);
    partes.push(precisaE ? `e ${grupoPorExtenso(resto)}` : grupoPorExtenso(resto));
  }

  return partes.join(" ");
}

/** Converte um valor monetário (R$) para extenso, ex: "mil duzentos e trinta e quatro reais e cinquenta centavos". */
export function valorPorExtenso(value: number): string {
  const v = Math.round(Math.abs(value) * 100) / 100;
  const reais = Math.floor(v);
  const centavos = Math.round((v - reais) * 100);

  const partes: string[] = [];

  if (reais > 0) {
    partes.push(`${inteiroPorExtenso(reais)} ${reais === 1 ? "real" : "reais"}`);
  }
  if (centavos > 0) {
    partes.push(`${inteiroPorExtenso(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`);
  }
  if (partes.length === 0) return "zero reais";

  return partes.join(" e ");
}
