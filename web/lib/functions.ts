import { httpsCallable, getFunctions } from "firebase/functions";
import app from "@/lib/firebase";

// Funções são publicadas na região padrão (us-central1) — não foi configurada
// uma região específica em functions/src/index.ts.
const functions = getFunctions(app, "us-central1");

export const criarAcessoClienteFn = httpsCallable<
  { customerId: string; email: string; name: string },
  { success: boolean; uid: string; resetLink: string }
>(functions, "criarAcessoCliente");

export const criarVendedorFn = httpsCallable<
  { name: string; email: string; phone?: string; password: string },
  { success: boolean; uid: string }
>(functions, "criarVendedor");
