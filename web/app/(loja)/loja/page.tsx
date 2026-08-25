import type { Metadata } from "next";
import { getVehiclesServer } from "@/lib/lojaServer";
import { LojaCatalogo } from "@/components/loja/LojaCatalogo";

export const metadata: Metadata = {
  title: "Carros à venda | Financer Auto",
  description:
    "Veículos revisados, com opções de pagamento e financiamento. Confira o estoque e fale conosco.",
  alternates: { canonical: "/loja" },
  openGraph: {
    title: "Carros à venda | Financer Auto",
    description: "Veículos revisados, com opções de pagamento e financiamento. Confira o estoque.",
    type: "website",
  },
};

// Revalida a vitrine a cada 5 min (ISR) — rápida e indexável pelo Google
export const revalidate = 300;

export default async function LojaPage() {
  const veiculos = await getVehiclesServer();
  return <LojaCatalogo initial={veiculos} />;
}
