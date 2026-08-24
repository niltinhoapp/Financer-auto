import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://4d6e55583f5262666eb11699c00b5358@o4511560545402880.ingest.us.sentry.io/4511560615723008",
  tracesSampleRate: 0.1,
  enabled: process.env.NODE_ENV === "production",
});
