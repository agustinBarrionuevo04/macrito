import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabaseOptions, type Row } from '@/test-utils/fake-supabase';

const h = vi.hoisted(() => ({
  client: null as unknown,
  revalidatePath: vi.fn(),
  send: vi.fn(),
  vapid: true,
}));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: h.revalidatePath }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'user-agent': 'Chrome Android' }),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => h.client }));
vi.mock('./sender', () => ({
  vapidFromEnv: () =>
    h.vapid ? { publicKey: 'p', privateKey: 'q', subject: 'mailto:a@b.c' } : null,
  createWebPushSender: () => ({ send: h.send }),
}));

import {
  removeSubscription,
  saveReminder,
  saveSubscription,
  sendTestNotification,
} from './actions';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

function setup(options: Partial<FakeSupabaseOptions> = {}, subs: Row[] = [], settings: Row[] = []) {
  const fake = createFakeSupabase({
    userId: ME,
    tables: {
      push_subscriptions: { ownerColumn: 'user_id', rows: subs },
      reminder_settings: { ownerColumn: 'user_id', rows: settings },
    },
    ...options,
  });
  h.client = { from: fake.client.from.bind(fake.client), auth: fake.client.auth };
  return fake;
}

const goodSub = {
  endpoint: 'https://fcm.googleapis.com/push/abc',
  keys: { p256dh: 'BKey', auth: 'aKey' },
};

beforeEach(() => {
  h.revalidatePath.mockClear();
  h.send.mockReset();
  h.vapid = true;
  setup();
});

describe('saveSubscription', () => {
  it('guarda la suscripción del usuario de la sesión con su navegador', async () => {
    const fake = setup();
    expect(await saveSubscription(goodSub)).toEqual({ ok: true });
    expect(fake.rows('push_subscriptions')).toEqual([
      expect.objectContaining({
        user_id: ME,
        endpoint: goodSub.endpoint,
        p256dh: 'BKey',
        auth: 'aKey',
        user_agent: 'Chrome Android',
      }),
    ]);
  });
  it('volver a guardar el mismo dispositivo no lo duplica', async () => {
    const fake = setup();
    await saveSubscription(goodSub);
    await saveSubscription({ ...goodSub, keys: { p256dh: 'Nueva', auth: 'aKey' } });
    expect(fake.rows('push_subscriptions')).toHaveLength(1);
    expect(fake.rows('push_subscriptions')[0]).toMatchObject({ p256dh: 'Nueva' });
  });
  it('rechaza endpoints que no son https y claves faltantes', async () => {
    const fake = setup();
    for (const bad of [
      null,
      {},
      { ...goodSub, endpoint: 'http://inseguro.example/x' },
      { ...goodSub, endpoint: 'no-es-url' },
      { ...goodSub, keys: { p256dh: '', auth: 'a' } },
      { endpoint: goodSub.endpoint },
      { ...goodSub, endpoint: `https://x.example/${'a'.repeat(3000)}` },
    ]) {
      expect(await saveSubscription(bad), JSON.stringify(bad)).toMatchObject({ ok: false });
    }
    expect(fake.rows('push_subscriptions')).toHaveLength(0);
  });
  it('sin sesión no escribe', async () => {
    const fake = setup({ userId: null });
    expect(await saveSubscription(goodSub)).toMatchObject({ ok: false });
    expect(fake.rows('push_subscriptions')).toHaveLength(0);
  });
  it('un error de la base no filtra detalles', async () => {
    setup({ failWhen: () => 'duplicate key value violates unique constraint "secreto"' });
    const result = await saveSubscription(goodSub);
    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).not.toMatch(/secreto|duplicate/);
  });
});

describe('removeSubscription', () => {
  it('borra solo la del dispositivo y del usuario', async () => {
    const fake = setup({}, [
      { user_id: ME, endpoint: goodSub.endpoint },
      { user_id: ME, endpoint: 'https://otro.example/x' },
      { user_id: OTHER, endpoint: goodSub.endpoint },
    ]);
    expect(await removeSubscription(goodSub.endpoint)).toEqual({ ok: true });
    expect(fake.rows('push_subscriptions')).toHaveLength(2);
    expect(
      fake
        .rows('push_subscriptions')
        .some((r) => r.user_id === ME && r.endpoint === goodSub.endpoint),
    ).toBe(false);
  });
  it('rechaza un endpoint inválido', async () => {
    expect(await removeSubscription('x')).toMatchObject({ ok: false });
  });
});

describe('saveReminder', () => {
  it('crea y después actualiza el recordatorio de una comida', async () => {
    const fake = setup();
    expect(await saveReminder('lunch', { enabled: true, remindAt: '13:00' })).toEqual({ ok: true });
    expect(await saveReminder('lunch', { enabled: false, remindAt: '13:30:00' })).toEqual({
      ok: true,
    });
    expect(fake.rows('reminder_settings')).toEqual([
      expect.objectContaining({
        user_id: ME,
        meal_type: 'lunch',
        enabled: false,
        remind_at: '13:30',
      }),
    ]);
  });
  it('rechaza comidas y horas inválidas', async () => {
    const fake = setup();
    for (const [meal, input] of [
      ['brunch', { enabled: true, remindAt: '13:00' }],
      ['lunch', { enabled: true, remindAt: '25:00' }],
      ['lunch', { enabled: true, remindAt: '1:00' }],
      ['lunch', { enabled: 'si', remindAt: '13:00' }],
      ['lunch', null],
    ] as const) {
      expect(await saveReminder(meal, input), JSON.stringify([meal, input])).toMatchObject({
        ok: false,
      });
    }
    expect(fake.rows('reminder_settings')).toHaveLength(0);
  });
  it('sin sesión no escribe', async () => {
    const fake = setup({ userId: null });
    expect(await saveReminder('lunch', { enabled: true, remindAt: '13:00' })).toMatchObject({
      ok: false,
    });
    expect(fake.rows('reminder_settings')).toHaveLength(0);
  });
});

describe('sendTestNotification', () => {
  const mine = { user_id: ME, endpoint: 'https://a.example/1', p256dh: 'k', auth: 'a' };
  it('manda la prueba a los dispositivos del usuario', async () => {
    h.send.mockResolvedValue('sent');
    setup({}, [
      mine,
      { ...mine, endpoint: 'https://a.example/2' },
      { ...mine, user_id: OTHER, endpoint: 'https://b.example/3' },
    ]);
    expect(await sendTestNotification()).toEqual({ ok: true, delivered: 2 });
    expect(h.send).toHaveBeenCalledTimes(2);
    expect(h.send.mock.calls[0]![1]).toMatchObject({
      title: 'Prueba de Macritos',
      url: '/profile',
      tag: 'test',
    });
  });
  it('si no hay dispositivos o los avisos no están configurados, lo dice', async () => {
    setup();
    expect(await sendTestNotification()).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Primero activá/),
    });
    h.vapid = false;
    expect(await sendTestNotification()).toMatchObject({
      ok: false,
      error: expect.stringMatching(/todavía no están disponibles/),
    });
  });
  it('si no llegó a ninguno, lo dice; y borra las suscripciones muertas', async () => {
    h.send.mockResolvedValue('gone');
    const fake = setup({}, [mine]);
    expect(await sendTestNotification()).toMatchObject({
      ok: false,
      error: expect.stringMatching(/No pudimos entregar/),
    });
    expect(fake.rows('push_subscriptions')).toHaveLength(0);
  });
});
