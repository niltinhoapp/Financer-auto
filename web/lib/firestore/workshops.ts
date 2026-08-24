import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Workshop } from "@financer-auto/shared";

export async function getWorkshops(): Promise<Workshop[]> {
  const q = query(collection(db, "workshops"), orderBy("name", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Workshop));
}

export async function getWorkshop(id: string): Promise<Workshop | null> {
  const snap = await getDoc(doc(db, "workshops", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Workshop;
}

export async function createWorkshop(
  data: Omit<Workshop, "id" | "createdAt">
): Promise<string> {
  const ref = await addDoc(collection(db, "workshops"), {
    ...data,
    createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateWorkshop(id: string, data: Partial<Workshop>): Promise<void> {
  await updateDoc(doc(db, "workshops", id), { ...data });
}

export async function deleteWorkshop(id: string): Promise<void> {
  await deleteDoc(doc(db, "workshops", id));
}
