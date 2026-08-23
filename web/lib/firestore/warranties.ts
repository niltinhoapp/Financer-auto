import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Warranty } from "@financer-auto/shared";

export async function getWarrantiesByCustomer(customerId: string): Promise<Warranty[]> {
  const q = query(collection(db, "warranties"), where("customerId", "==", customerId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Warranty));
}

export async function getWarrantyByContract(contractId: string): Promise<Warranty | null> {
  const q = query(collection(db, "warranties"), where("contractId", "==", contractId));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as Warranty;
}

export async function getWarranty(id: string): Promise<Warranty | null> {
  const snap = await getDoc(doc(db, "warranties", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Warranty;
}

export async function createWarranty(
  data: Omit<Warranty, "id" | "createdAt" | "updatedAt">
): Promise<string> {
  const ref = await addDoc(collection(db, "warranties"), {
    ...data,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateWarranty(id: string, data: Partial<Warranty>): Promise<void> {
  await updateDoc(doc(db, "warranties", id), {
    ...data,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteWarranty(id: string): Promise<void> {
  await deleteDoc(doc(db, "warranties", id));
}
