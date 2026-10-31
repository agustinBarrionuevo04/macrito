/// <reference lib="webworker" />
import { parsePushPayload, safeAppPath } from './lib/pwa/push';
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

// Recordatorios (Web Push). El navegador exige mostrar una notificación por cada push recibido.
self.addEventListener('push', (event) => {
  const payload = parsePushPayload(event.data?.text());
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: payload.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = safeAppPath((event.notification.data as { url?: unknown } | null)?.url);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        if ('navigate' in open) await (open as WindowClient).navigate(url);
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
