import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://4d6e55583f5262666eb11699c00b5358@o4511560545402880.ingest.us.sentry.io/4511560615723008",
  // Amostra de performance (10% das transações — suficiente e econômico)
  tracesSampleRate: 0.1,
  // Não grava sessão por padrão; grava replay só quando há erro
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  integrations: [
    Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
  ],
  // Em desenvolvimento não envia (evita poluir o painel)
  enabled: process.env.NODE_ENV === "production",
});
