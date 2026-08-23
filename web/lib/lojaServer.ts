/**
 * Acesso aos veículos da loja pública NO SERVIDOR (para SEO).
 * Usa a API REST do Firestore — os veículos têm leitura pública nas regras,
 * então não é necessário Admin SDK nem chave de serviço.
 * Os dados são cacheados com ISR (revalidate) para a página ser rápida e indexável.
 */

const PROJECT = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

export interface VehicleSEO {
  id: string;
  brand: string;
  model: string;
  year: number;
  color: string;
  plate: string;
  mileage: number;
  price: number;
  photos: string[];
  features?: string;
  status: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function decodeValue(v: any): any {
  if (v == null) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(decodeValue);
  if ("mapValue" in v) return decodeFields(v.mapValue.fields ?? {});
  if ("nullValue" in v) return null;
  return null;
}
function decodeFields(fields: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k in fields) out[k] = decodeValue(fields[k]);
  return out;
}

function toVehicle(doc: any): VehicleSEO {
  const id = doc.name.split("/").pop();
  const f = decodeFields(doc.fields ?? {});
  return {
    id,
    brand: f.brand ?? "",
    model: f.model ?? "",
    year: f.year ?? 0,
    color: f.color ?? "",
    plate: f.plate ?? "",
    mileage: f.mileage ?? 0,
    price: f.price ?? 0,
    photos: f.photos ?? [],
    features: f.features,
    status: f.status ?? "",
  };
}

/** Lista veículos disponíveis (cache de 5 min). */
export async function getVehiclesServer(): Promise<VehicleSEO[]> {
  try {
    const res = await fetch(`${BASE}/vehicles?key=${KEY}&pageSize=300`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.documents ?? [])
      .map(toVehicle)
      .filter((v: VehicleSEO) => v.status === "available");
  } catch {
    return [];
  }
}

/** Busca um veículo por id (cache de 5 min). */
export async function getVehicleServer(id: string): Promise<VehicleSEO | null> {
  try {
    const res = await fetch(`${BASE}/vehicles/${id}?key=${KEY}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const doc = await res.json();
    if (!doc.fields) return null;
    return toVehicle(doc);
  } catch {
    return null;
  }
}
