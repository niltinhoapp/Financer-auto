// Carrega a configuração do Sentry no navegador (Next 16).
import "./sentry.client.config";

import * as Sentry from "@sentry/nextjs";
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
