import 'server-only';
import webpush from 'web-push';
import type { PushPayload } from '@/lib/pwa/push';
import type { PushSender, StoredSubscription } from './run';

export type VapidConfig = { publicKey: string; privateKey: string; subject: string };

/** Claves VAPID del entorno; `null` si falta alguna o el contacto no es `mailto:` ni `https://`. */
export function vapidFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): VapidConfig | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  if (!/^(mailto:|https:\/\/)/.test(subject)) return null;
  return { publicKey, privateKey, subject };
}

const TTL_SECONDS = 60 * 60;
const TIMEOUT_MS = 10_000;

/** Envía por el servicio push del navegador (FCM, Mozilla, Apple), con cifrado y firma VAPID. */
export function createWebPushSender(vapid: VapidConfig): PushSender {
  return {
    async send(subscription: StoredSubscription, payload: PushPayload) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify(payload),
          {
            vapidDetails: {
              subject: vapid.subject,
              publicKey: vapid.publicKey,
              privateKey: vapid.privateKey,
            },
            TTL: TTL_SECONDS,
            timeout: TIMEOUT_MS,
          },
        );
        return 'sent';
      } catch (error) {
        const status = (error as { statusCode?: unknown }).statusCode;
        // 404/410: la suscripción ya no existe. Cualquier otra cosa puede ser pasajera.
        return status === 404 || status === 410 ? 'gone' : 'failed';
      }
    },
  };
}
