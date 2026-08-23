import { addDoc, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";

/**
 * Registra uma ação no log de auditoria (coleção `audit`, somente leitura por admin).
 * Falha de auditoria nunca quebra a ação principal — é "best effort".
 *
 * @param acao  identificador curto: "pagamento_confirmado", "contrato_excluido", etc.
 * @param descricao  texto legível do que aconteceu
 * @param ator  { uid, name, role } de quem executou
 * @param alvo  opcional: { tipo, id } da entidade afetada
 */
export async function registrarAuditoria(
  acao: string,
  descricao: string,
  ator: { uid?: string; name?: string; role?: string } | null,
  alvo?: { tipo: string; id: string }
): Promise<void> {
  try {
    await addDoc(collection(db, "audit"), {
      acao,
      descricao,
      atorUid: ator?.uid ?? null,
      atorNome: ator?.name ?? "—",
      atorPapel: ator?.role ?? null,
      alvoTipo: alvo?.tipo ?? null,
      alvoId: alvo?.id ?? null,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Falha ao registrar auditoria:", e);
  }
}
