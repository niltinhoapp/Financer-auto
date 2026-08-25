import type { Metadata } from "next";
import { getVehicleServer } from "@/lib/lojaServer";
import { VeiculoDetalhe } from "@/components/loja/VeiculoDetalhe";
import { formatCurrency as formatBRL } from "@/lib/utils";

export const revalidate = 300;

interface Props {
  params: Promise<{ id: string }>;
}

// Metadata dinâmica por veículo — é o que o Google e o WhatsApp leem
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const v = await getVehicleServer(id);
  if (!v) {
    return { title: "Veículo não encontrado | Financer Auto" };
  }
  const titulo = `${v.brand} ${v.model} ${v.year} — ${formatBRL(v.price)} | Financer Auto`;
  const desc = `${v.brand} ${v.model} ${v.year}, ${v.mileage.toLocaleString("pt-BR")} km, ${v.color}. ` +
    `Opções de pagamento e financiamento disponíveis.`;
  const img = v.photos?.[0];
  return {
    title: titulo,
    description: desc,
    alternates: { canonical: `/loja/${id}` },
    openGraph: {
      title: titulo,
      description: desc,
      type: "website",
      ...(img ? { images: [{ url: img }] } : {}),
    },
    twitter: {
      card: img ? "summary_large_image" : "summary",
      title: titulo,
      description: desc,
      ...(img ? { images: [img] } : {}),
    },
  };
}

export default async function VeiculoPage({ params }: Props) {
  const { id } = await params;
  const v = await getVehicleServer(id);

  // Dados estruturados (Schema.org) — ajudam o Google a entender que é um veículo à venda
  const jsonLd = v && {
    "@context": "https://schema.org",
    "@type": "Car",
    name: `${v.brand} ${v.model} ${v.year}`,
    brand: { "@type": "Brand", name: v.brand },
    model: v.model,
    vehicleModelDate: String(v.year),
    color: v.color,
    mileageFromOdometer: { "@type": "QuantitativeValue", value: v.mileage, unitCode: "KMT" },
    ...(v.photos?.length ? { image: v.photos } : {}),
    offers: {
      "@type": "Offer",
      priceCurrency: "BRL",
      price: v.price,
      availability: "https://schema.org/InStock",
    },
  };

  return (
    <>
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      )}
      <VeiculoDetalhe />
    </>
  );
}
