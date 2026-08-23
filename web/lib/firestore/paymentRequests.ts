import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { PaymentRequest, PaymentRequestStatus } from "@financer-auto/shared";

export async function createPaymentRequest(
  data: Omit<PaymentRequest, "id" | "createdAt" | "updatedAt">
): Promise<string> {
  const ref = await addDoc(collection(db, "paymentRequests"), {
    ...data,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function getPendingPaymentRequests(): Promise<PaymentRequest[]> {
  const q = query(
    collection(db, "paymentRequests"),
    where("status", "==", "pending"),
    orderBy("createdAt", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PaymentRequest));
}

export async function getAllPaymentRequests(): Promise<PaymentRequest[]> {
  const q = query(collection(db, "paymentRequests"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PaymentRequest));
}

export async function getPaymentRequestsByCustomer(customerId: string): Promise<PaymentRequest[]> {
  const q = query(
    collection(db, "paymentRequests"),
    where("customerId", "==", customerId),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PaymentRequest));
}

export async function updatePaymentRequestStatus(
  id: string,
  status: PaymentRequestStatus,
  extra?: { confirmedBy?: string; rejectionReason?: string }
): Promise<void> {
  await updateDoc(doc(db, "paymentRequests", id), {
    status,
    ...(status === "confirmed" ? { confirmedAt: new Date().toISOString(), ...extra } : extra ?? {}),
    updatedAt: new Date().toISOString(),
  });
}
