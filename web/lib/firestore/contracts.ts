import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  collectionGroup,
  writeBatch,
  arrayUnion,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Contract, Installment, Payment } from "@financer-auto/shared";
import { gerarCronogramaManual } from "@/lib/financiamento";

export async function getContracts(filters?: {
  sellerId?: string;
  customerId?: string;
  status?: string;
}): Promise<Contract[]> {
  let q = query(collection(db, "contracts"), orderBy("createdAt", "desc"));
  if (filters?.sellerId) {
    q = query(q, where("sellerId", "==", filters.sellerId));
  }
  if (filters?.customerId) {
    q = query(q, where("customerId", "==", filters.customerId));
  }
  if (filters?.status) {
    q = query(q, where("status", "==", filters.status));
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Contract));
}

export async function getContract(id: string): Promise<Contract | null> {
  const snap = await getDoc(doc(db, "contracts", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Contract;
}

export async function createContract(
  data: Omit<Contract, "id" | "status" | "createdAt" | "updatedAt">
): Promise<string> {
  const ref = await addDoc(collection(db, "contracts"), {
    ...data,
    status: "active",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateContract(
  id: string,
  data: Partial<Contract>
): Promise<void> {
  await updateDoc(doc(db, "contracts", id), {
    ...data,
    updatedAt: new Date().toISOString(),
  });
}

export async function getInstallments(contractId: string): Promise<Installment[]> {
  const q = query(
    collection(db, "contracts", contractId, "installments"),
    orderBy("number", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Installment));
}

export async function getAllOverdueInstallments(): Promise<
  (Installment & { contractId: string })[]
> {
  const today = new Date().toISOString().split("T")[0];
  const q = query(
    collectionGroup(db, "installments"),
    where("status", "in", ["pending", "overdue"]),
    where("dueDate", "<=", today)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    contractId: d.ref.parent.parent!.id,
    ...d.data(),
  } as Installment & { contractId: string }));
}

export async function getPayments(contractId: string): Promise<Payment[]> {
  const q = query(
    collection(db, "payments"),
    where("contractId", "==", contractId),
    orderBy("paidAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Payment));
}

export async function updateInstallment(
  contractId: string,
  installmentId: string,
  data: Partial<Installment>
): Promise<void> {
  await updateDoc(
    doc(db, "contracts", contractId, "installments", installmentId),
    { ...data, updatedAt: new Date().toISOString() }
  );
}

/**
 * Renegocia um conjunto de parcelas (geralmente em atraso): marca as parcelas
 * originais como "renegotiated" e cria um novo cronograma manual (entrada +
 * N parcelas de valor fixo, sem cálculo de juros) a partir do total acordado.
 */
export async function renegotiateInstallments(
  contractId: string,
  params: {
    installments: Installment[]; // parcelas originais selecionadas
    originalTotalValue: number;  // soma dos valores atualizados (com multa/juros) acordada
    downPayment: number;         // entrada paga agora na renegociação (pode ser 0)
    newInstallmentValue: number;
    newInstallmentsCount: number;
    primeiroVencimento: string;
    notes?: string;
    renegotiatedBy: string;
    customerId: string;
  }
): Promise<void> {
  const batch = writeBatch(db);
  const now = new Date().toISOString();

  // 1. Marca as parcelas originais como renegociadas
  for (const inst of params.installments) {
    batch.update(doc(db, "contracts", contractId, "installments", inst.id), {
      status: "renegotiated",
      updatedAt: now,
    });
  }

  // 2. Gera o novo cronograma a partir do próximo número disponível
  const existing = await getInstallments(contractId);
  const maxNumber = existing.reduce((m, i) => Math.max(m, i.number), 0);

  const novasParcelas = gerarCronogramaManual(
    params.newInstallmentValue,
    params.newInstallmentsCount,
    params.primeiroVencimento
  );

  for (const p of novasParcelas) {
    const ref = doc(collection(db, "contracts", contractId, "installments"));
    batch.set(ref, {
      contractId,
      number: maxNumber + p.numero,
      dueDate: p.vencimento,
      value: p.valor,
      status: "pending",
      updatedAt: now,
    });
  }

  // 3. Registra a entrada da renegociação como pagamento, se houver
  if (params.downPayment > 0) {
    const payRef = doc(collection(db, "payments"));
    batch.set(payRef, {
      contractId,
      installmentId: "renegociacao",
      customerId: params.customerId,
      amount: params.downPayment,
      method: "cash",
      paidAt: now.split("T")[0],
      registeredBy: params.renegotiatedBy,
      notes: "Entrada de renegociação de contrato",
    });
  }

  // 4. Atualiza o contrato com o histórico de renegociação
  batch.update(doc(db, "contracts", contractId), {
    status: "renegotiated",
    updatedAt: now,
    renegotiations: arrayUnion({
      date: now,
      originalInstallmentNumbers: params.installments.map((i) => i.number),
      originalTotalValue: params.originalTotalValue,
      downPayment: params.downPayment,
      newInstallmentsCount: params.newInstallmentsCount,
      newInstallmentValue: params.newInstallmentValue,
      ...(params.notes ? { notes: params.notes } : {}),
      renegotiatedBy: params.renegotiatedBy,
    }),
  });

  await batch.commit();
}
