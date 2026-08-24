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
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Vehicle, VehicleStatus } from "@financer-auto/shared";

const COL = "vehicles";

export async function getVehicles(status?: VehicleStatus): Promise<Vehicle[]> {
  const col = collection(db, COL);
  const q = status
    ? query(col, where("status", "==", status), orderBy("createdAt", "desc"))
    : query(col, orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Vehicle));
}

export async function getVehicle(id: string): Promise<Vehicle | null> {
  const snap = await getDoc(doc(db, COL, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Vehicle;
}

export async function createVehicle(
  data: Omit<Vehicle, "id" | "createdAt" | "updatedAt">
): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function updateVehicle(
  id: string,
  data: Partial<Vehicle>
): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    ...data,
    updatedAt: new Date().toISOString(),
  });
}

export async function updateVehicleStatus(
  id: string,
  status: VehicleStatus
): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    status,
    updatedAt: new Date().toISOString(),
  });
}
