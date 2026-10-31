/** Contenido de una notificación push. Lo comparten el servidor (arma el mensaje) y el service worker (lo muestra). */
export type PushPayload = {
  title: string;
  body: string;
  /** Ruta de la app a la que lleva al tocarla (siempre relativa). */
  url: string;
  /** Una notificación nueva con la misma etiqueta reemplaza a la anterior (no se acumulan). */
  tag: string;
};

const DEFAULT_URL = '/';
const MAX_TEXT = 200;

/** Solo rutas internas: `//otro.com`, `https://…` y `javascript:` no pasan (evita abrir sitios ajenos al tocar). */
export function safeAppPath(value: unknown): string {
  if (typeof value !== 'string' || value.length > 300) return DEFAULT_URL;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return DEFAULT_URL;
  return value;
}

const text = (value: unknown, fallback: string) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, MAX_TEXT) : fallback;

/**
 * Lee lo que llegó en el evento `push`. Nunca lanza: un mensaje roto o vacío igual muestra una
 * notificación (el navegador exige mostrar una al recibir un push).
 */
export function parsePushPayload(
  raw: string | null | undefined,
  appName = 'Macritos',
): PushPayload {
  let data: unknown = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  const record = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
  return {
    title: text(record.title, appName),
    body: text(record.body, ''),
    url: safeAppPath(record.url),
    tag: text(record.tag, 'macritos'),
  };
}

/** La clave pública VAPID viaja en base64url; `pushManager.subscribe` la pide como bytes. */
export function urlBase64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export type PushSupport =
  | 'ready'
  /** Falta la clave VAPID en el servidor: el aviso no se puede activar. */
  | 'not-configured'
  /** iPhone/iPad en el navegador: Web Push solo anda con la app instalada en la pantalla de inicio. */
  | 'ios-install'
  | 'unsupported'
  | 'denied';

export function pushSupport(input: {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  permission: NotificationPermission | null;
  isIos: boolean;
  standalone: boolean;
  configured: boolean;
}): PushSupport {
  if (!input.configured) return 'not-configured';
  if (input.isIos && !input.standalone) return 'ios-install';
  if (!input.hasServiceWorker || !input.hasPushManager || !input.hasNotification)
    return 'unsupported';
  if (input.permission === 'denied') return 'denied';
  return 'ready';
}
