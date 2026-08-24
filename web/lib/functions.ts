import { httpsCallable, getFunctions } from "firebase/functions";
import app from "@/lib/firebase";

// Funções são publicadas na região padrão (us-central1) — não foi configurada
// uma região específica em functions/src/index.ts.
const functions = getFunctions(app, "us-central1");

export const criarAcessoClienteFn = httpsCallable<
  { customerId: string; email: string; name: string },
  { success: boolean; uid: string; resetLink: string; tempPassword?: string }
>(functions, "criarAcessoCliente");

export const criarVendedorFn = httpsCallable<
  { name: string; email: string; phone?: string; password: string },
  { success: boolean; uid: string }
>(functions, "criarVendedor");

export const criarFinanceiroFn = httpsCallable<
  { name: string; email: string; phone?: string; password: string },
  { success: boolean; uid: string }
>(functions, "criarFinanceiro");

export const excluirVendedorFn = httpsCallable<
  { uid: string },
  { success: boolean; mode: "deleted" | "deactivated" }
>(functions, "excluirVendedor");

export const assinarContratoFn = httpsCallable<
  { contractId: string; signerName: string; signerCpf: string },
  { success: boolean; signature: { signedAt: string; signerName: string; signerCpf: string } }
>(functions, "assinarContrato");

export const uploadComprovanteFn = httpsCallable<
  { base64: string; fileName: string; customerId: string },
  { url: string; path: string }
>(functions, "uploadComprovante");

export const uploadFotoVeiculoFn = httpsCallable<
  { base64: string; fileName: string; vehicleId: string },
  { url: string; path: string }
>(functions, "uploadFotoVeiculo");

export const uploadDocumentoFn = httpsCallable<
  { base64: string; fileName: string; customerId: string; docTipo: string },
  { url: string; path: string }
>(functions, "uploadDocumento");

// ── Exclusão e limpeza de dados (somente admin) ──────────────────────
export const excluirVeiculoFn = httpsCallable<
  { vehicleId: string },
  { success: boolean }
>(functions, "excluirVeiculo");

export const excluirClienteFn = httpsCallable<
  { customerId: string },
  { success: boolean }
>(functions, "excluirCliente");

export const excluirContratoFn = httpsCallable<
  { contractId: string },
  { success: boolean }
>(functions, "excluirContrato");

export const notificarClienteFn = httpsCallable<
  { customerId: string; tipo: string; mensagem: string },
  { success: boolean; status: "sent" | "manual" | "error"; phone: string }
>(functions, "notificarCliente");

export const gerarUrlAssinadaFn = httpsCallable<
  { path: string },
  { url: string }
>(functions, "gerarUrlAssinada");

export const privatizarArquivosFn = httpsCallable<
  Record<string, never>,
  { success: boolean; arquivos: number }
>(functions, "privatizarArquivos");

export const limparDadosFn = httpsCallable<
  { alvo: "leads" | "veiculos" | "clientes" | "contratos" | "despesas" },
  { success: boolean; removidos: number }
>(functions, "limparDados");
