import { beforeEach, describe, expect, it, vi } from 'vitest';

// El envío falso es una función común (no un `vi.fn`): vitest marca como error las promesas rechazadas que registra un espía.
const h = vi.hoisted(() => ({
  calls: [] as unknown[][],
  impl: (async () => undefined) as (...args: unknown[]) => Promise<unknown>,
  sendNotification: (...args: unknown[]) => {
    h.calls.push(args);
    return h.impl(...args);
  },
}));
vi.mock('server-only', () => ({}));
vi.mock('web-push', () => ({ default: { sendNotification: h.sendNotification } }));

import { createWebPushSender, vapidFromEnv } from './sender';

const vapid = { publicKey: 'pub', privateKey: 'priv', subject: 'mailto:yo@example.com' };
const sub = { endpoint: 'https://push.example/x', p256dh: 'k', auth: 'a' };
const payload = { title: 't', body: 'b', url: '/add?meal=lunch', tag: 'meal-lunch' };

beforeEach(() => {
  h.calls.length = 0;
  h.impl = async () => undefined;
});

describe('vapidFromEnv', () => {
  const env = {
    VAPID_PUBLIC_KEY: 'pub',
    VAPID_PRIVATE_KEY: 'priv',
    VAPID_SUBJECT: 'mailto:yo@example.com',
  };
  it('lee las tres variables', () => {
    expect(vapidFromEnv(env)).toEqual(vapid);
    expect(vapidFromEnv({ ...env, VAPID_SUBJECT: 'https://macritos.example' })).not.toBeNull();
  });
  it('si falta alguna, está vacía o el contacto no es mailto/https, es null', () => {
    for (const key of Object.keys(env)) {
      expect(vapidFromEnv({ ...env, [key]: undefined }), key).toBeNull();
      expect(vapidFromEnv({ ...env, [key]: '  ' }), key).toBeNull();
    }
    expect(vapidFromEnv({ ...env, VAPID_SUBJECT: 'yo@example.com' })).toBeNull();
    expect(vapidFromEnv({ ...env, VAPID_SUBJECT: 'http://inseguro' })).toBeNull();
  });
});

describe('createWebPushSender', () => {
  it('manda el mensaje cifrado con las claves de la suscripción y la firma VAPID', async () => {
    h.impl = async () => ({ statusCode: 201 });
    expect(await createWebPushSender(vapid).send(sub, payload)).toBe('sent');
    const [target, body, options] = h.calls[0] as [
      Record<string, unknown>,
      string,
      { vapidDetails: unknown; TTL: number; timeout: number },
    ];
    expect(target).toEqual({ endpoint: sub.endpoint, keys: { p256dh: 'k', auth: 'a' } });
    expect(JSON.parse(body)).toEqual(payload);
    expect(options.vapidDetails).toEqual({
      subject: vapid.subject,
      publicKey: 'pub',
      privateKey: 'priv',
    });
    expect(options.TTL).toBeGreaterThan(0);
    expect(options.timeout).toBeGreaterThan(0);
  });
  it('404 y 410 significan que la suscripción murió; lo demás es un fallo pasajero', async () => {
    for (const [statusCode, expected] of [
      [404, 'gone'],
      [410, 'gone'],
      [429, 'failed'],
      [500, 'failed'],
      [undefined, 'failed'],
    ] as const) {
      h.impl = () => Promise.reject({ statusCode });
      expect(await createWebPushSender(vapid).send(sub, payload), String(statusCode)).toBe(
        expected,
      );
    }
  });
});
