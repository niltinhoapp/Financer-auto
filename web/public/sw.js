/* Service worker mínimo do Financer Auto.
   Habilita a instalação como app (PWA) e um cache leve do "app shell".
   Dados (Firestore/Storage) NÃO são cacheados — sempre vêm da rede,
   para nunca mostrar parcela/saldo desatualizado. */

const CACHE = "financer-shell-v1";
const SHELL = ["/", "/login", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Nunca cachear chamadas a serviços externos (Firebase, Google, APIs)
  if (url.origin !== self.location.origin) return;

  // Navegação: rede primeiro, cai para cache se offline
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match(req).then((r) => r || caches.match("/")))
    );
    return;
  }

  // Estáticos do próprio site: cache primeiro, atualiza em segundo plano
  event.respondWith(
    caches.match(req).then((cached) => {
      const fromNet = fetch(req)
        .then((resp) => {
          if (resp.ok) caches.open(CACHE).then((c) => c.put(req, resp.clone()));
          return resp;
        })
        .catch(() => cached);
      return cached || fromNet;
    })
  );
});
