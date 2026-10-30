/// <reference lib="webworker" />
import {
  ExpirationPlugin,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
  type PrecacheEntry,
} from 'serwist';

declare const self: ServiceWorkerGlobalScope & { __SW_MANIFEST: (PrecacheEntry | string)[] };

/**
 * Service worker de Macritos.
 *
 * Precachea el shell (JS/CSS de Next) y la página /offline. NUNCA guarda páginas, respuestas RSC ni
 * llamadas a /api: son datos de un usuario autenticado y quedarían en el dispositivo después de
 * cerrar sesión. La cola offline para registrar comidas es de la fase 4-M y vive en IndexedDB.
 */
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  runtimeCaching: [
    // Las navegaciones siempre van a la red; si falla, entra el fallback a /offline.
    { matcher: ({ request }) => request.mode === 'navigate', handler: new NetworkOnly() },
    {
      matcher: ({ sameOrigin, url }) => sameOrigin && url.pathname.startsWith('/icons/'),
      handler: new StaleWhileRevalidate({
        cacheName: 'icons',
        plugins: [new ExpirationPlugin({ maxEntries: 16, maxAgeSeconds: 30 * 24 * 60 * 60 })],
      }),
    },
  ],
  fallbacks: {
    entries: [{ url: '/offline', matcher: ({ request }) => request.destination === 'document' }],
  },
});

serwist.addEventListeners();
