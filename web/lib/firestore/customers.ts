import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Customer } from "@financer-auto/shared";

const COL = "customers";

export async function getCustomers(): Promise<Customer[]> {
  const q = query(collection(db, COL), orderBy("name", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Customer));
}

export async function getCustomer(id: string): Promise<Customer | null> {
  const snap = await getDoc(doc(db, COL, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Customer;
}

export async function createCustomer(
  data: Omit<Customer, "id" | "approvalStatus" | "createdAt" | "updatedAt">
): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    approvalStatus: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function approveCustomer(
  id: string,
  adminUid: string,
  approved: boolean,
  note?: string
): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    approvalStatus: approved ? "approved" : "rejected",
    approvalNote: note ?? "",
    approvedBy: adminUid,
    approvedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

export async function updateCustomer(
  id: string,
  data: Partial<Customer>
): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    ...data,
    updatedAt: new Date().toISOString(),
  });
}
