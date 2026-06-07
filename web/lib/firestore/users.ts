import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { User, UserRole } from "@financer-auto/shared";

const COL = "users";

export async function getUser(uid: string): Promise<User | null> {
  const snap = await getDoc(doc(db, COL, uid));
  if (!snap.exists()) return null;
  return { uid: snap.id, ...snap.data() } as User;
}

export async function getUsersByRole(role: UserRole): Promise<User[]> {
  const q = query(
    collection(db, COL),
    where("role", "==", role),
    orderBy("name", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() } as User));
}

export async function createUser(
  uid: string,
  data: Omit<User, "uid" | "createdAt" | "updatedAt">
): Promise<void> {
  await setDoc(doc(db, COL, uid), {
    ...data,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

export async function updateUser(uid: string, data: Partial<User>): Promise<void> {
  await updateDoc(doc(db, COL, uid), {
    ...data,
    updatedAt: new Date().toISOString(),
  });
}
