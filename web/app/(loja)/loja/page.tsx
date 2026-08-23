import type { Metadata } from "next";
import { getVehiclesServer } from "@/lib/lojaServer";
import { LojaCatalogo } from "@/components/loja/LojaCatalogo";

export const metadata: Metadata = {
  title: "Carros à venda com financiamento próprio | Financer Auto",
  description:
    "Veículos revisados com parcelamento direto com a loja — sem banco, sem burocracia e sem consulta ao SPC/Serasa. Confira o estoque e fale conosco.",
  alternates: { canonical: "/loja" },
  openGraph: {
    title: "Carros à venda com financiamento próprio | Financer Auto",
    description: "Veículos revisados, parcelamento direto com a loja. Confira o estoque.",
    type: "website",
  },
};

// Revalida a vitrine a cada 5 min (ISR) — rápida e indexável pelo Google
export const revalidate = 300;

export default async function LojaPage() {
  const veiculos = await getVehiclesServer();
  return <LojaCatalogo initial={veiculos} />;
}
