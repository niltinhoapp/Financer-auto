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
import type { Revision } from "@financer-auto/shared";

export async function getRevisionsByContract(contractId: string): Promise<Revision[]> {
  const q = query(
    collection(db, "revisions"),
    where("contractId", "==", contractId),
    orderBy("date", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Revision));
}

export async function getRevision(id: string): Promise<Revision | null> {
  const snap = await getDoc(doc(db, "revisions", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Revision;
}

export async function createRevision(
  data: Omit<Revision, "id" | "createdAt">
): Promise<string> {
  const ref = await addDoc(collection(db, "revisions"), {
    ...data,
    createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateRevision(id: string, data: Partial<Revision>): Promise<void> {
  await updateDoc(doc(db, "revisions", id), { ...data });
}

export async function deleteRevision(id: string): Promise<void> {
  await deleteDoc(doc(db, "revisions", id));
}
