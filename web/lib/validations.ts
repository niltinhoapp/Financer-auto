// ============================================================
// Validações Camada 1 — CPF, CEP, telefone, idade
// ============================================================

/** Valida CPF pelo algoritmo dos dígitos verificadores */
export function validarCPF(cpf: string): boolean {
  const nums = cpf.replace(/\D/g, "");
  if (nums.length !== 11) return false;
  // Rejeita sequências iguais (111.111.111-11, etc.)
  if (/^(\d)\1{10}$/.test(nums)) return false;

  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += parseInt(nums[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 || rest === 11 ? 0 : rest;
  };
  return calc(9) === parseInt(nums[9]) && calc(10) === parseInt(nums[10]);
}

/** Formata CPF: 00000000000 → 000.000.000-00 */
export function formatarCPF(cpf: string): string {
  const n = cpf.replace(/\D/g, "").slice(0, 11);
  return n
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

/** Formata telefone: 11999999999 → (11) 99999-9999 */
export function formatarTelefone(tel: string): string {
  const n = tel.replace(/\D/g, "").slice(0, 11);
  if (n.length <= 10)
    return n.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
  return n.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
}

/** Formata CEP: 00000000 → 00000-000 */
export function formatarCEP(cep: string): string {
  const n = cep.replace(/\D/g, "").slice(0, 8);
  return n.replace(/(\d{5})(\d{0,3})/, "$1-$2");
}

/** Verifica se é maior de idade (mínimo 18 anos) */
export function isMaiorDeIdade(birthDate: string): boolean {
  if (!birthDate) return false;
  const birth = new Date(birthDate);
  const hoje = new Date();
  const idade = hoje.getFullYear() - birth.getFullYear();
  const mesAntes = hoje.getMonth() < birth.getMonth();
  const diaAntes =
    hoje.getMonth() === birth.getMonth() && hoje.getDate() < birth.getDate();
  return idade - (mesAntes || diaAntes ? 1 : 0) >= 18;
}

/** Busca endereço pelo CEP via ViaCEP (gratuito) */
export interface EnderecoViaCEP {
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
  erro?: boolean;
}

export async function buscarCEP(cep: string): Promise<EnderecoViaCEP | null> {
  const nums = cep.replace(/\D/g, "");
  if (nums.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${nums}/json/`);
    const data: EnderecoViaCEP = await res.json();
    if (data.erro) return null;
    return data;
  } catch {
    return null;
  }
}
