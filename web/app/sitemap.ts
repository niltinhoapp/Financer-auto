import type { MetadataRoute } from "next";
import { getVehiclesServer } from "@/lib/lojaServer";

const SITE = "https://financer-auto.vercel.app";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const veiculos = await getVehiclesServer();
  const carros = veiculos.map((v) => ({
    url: `${SITE}/loja/${v.id}`,
    lastModified: new Date(),
    changeFrequency: "daily" as const,
    priority: 0.8,
  }));
  return [
    { url: `${SITE}/loja`, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    ...carros,
  ];
}
