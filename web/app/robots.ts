import type { MetadataRoute } from "next";

const SITE = "https://financer-auto.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/loja"],
        // Áreas privadas não devem ser indexadas
        disallow: ["/dashboard", "/clientes", "/contratos", "/recebimentos",
          "/financeiro", "/relatorios", "/inadimplencia", "/auditoria",
          "/vendedores", "/comissoes", "/oficinas", "/trocas", "/leads",
          "/configuracoes", "/minha-area", "/login"],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
