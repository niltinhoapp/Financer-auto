import type { NextConfig } from "next";
import path from "path";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: ["192.168.1.13", "localhost", "127.0.0.1"],
  // Monorepo: a raiz do workspace é o diretório pai (necessário p/ build na Vercel)
  turbopack: { root: path.join(__dirname, "..") },
  outputFileTracingRoot: path.join(__dirname, ".."),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Impede que o app (login, assinatura de contrato, upload de docs) seja
          // embutido em iframe de terceiros — mitiga clickjacking.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // App não usa câmera/microfone/geolocalização — nega por padrão.
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: "saas-ml",
  project: "financer-auto",
  silent: !process.env.CI,
  // Não expõe o código-fonte original via source maps no navegador
  sourcemaps: { deleteSourcemapsAfterUpload: true },
  // Túnel para driblar bloqueadores de anúncios que barram o Sentry
  tunnelRoute: "/monitoring",
});
