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
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Contract, Installment, Payment } from "@financer-auto/shared";

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
