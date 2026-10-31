import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type Row } from '@/test-utils/fake-supabase';
import type { PushPayload } from '@/lib/pwa/push';
import { runReminders, type PushSender, type SendResult, type StoredSubscription } from './run';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
// 13:10 en Córdoba (UTC−3) y 01:10 del día siguiente en Tokio (UTC+9).
const NOW = new Date('2026-03-15T16:10:00Z');

const setting = (user_id: string, meal_type: string, remind_at: string, extra: Row = {}): Row => ({
  user_id,
  meal_type,
  enabled: true,
  remind_at,
  last_sent_on: null,
  ...extra,
});
const sub = (user_id: string, endpoint: string): Row => ({
  user_id,
  endpoint: `https://push.example/${endpoint}`,
  p256dh: 'k',
  auth: 'a',
});
const profile = (user_id: string, timezone: string | null = 'America/Argentina/Cordoba'): Row => ({
  user_id,
  timezone,
});

function setup(
  tables: { settings?: Row[]; subs?: Row[]; profiles?: Row[]; entries?: Row[] },
  results: Record<string, SendResult> = {},
) {
  const fake = createFakeSupabase({
    userId: null,
    tables: {
      reminder_settings: { rows: tables.settings ?? [] },
      push_subscriptions: { rows: tables.subs ?? [] },
      profiles: { rows: tables.profiles ?? [profile(A), profile(B)] },
      intake_entries: { rows: tables.entries ?? [] },
    },
  });
  const send = vi.fn(async (s: StoredSubscription, payload: PushPayload): Promise<SendResult> => {
    void payload;
    return results[s.endpoint.split('/').pop()!] ?? 'sent';
  });
  const sender: PushSender = { send };
  const run = (now: Date = NOW) =>
    runReminders({ admin: fake.client as unknown as SupabaseClient, sender, now });
  return { fake, send, run };
}

describe('runReminders', () => {
  it('manda el recordatorio de la hora a todos los dispositivos y lo marca resuelto', async () => {
    const { fake, send, run } = setup({
      settings: [setting(A, 'lunch', '13:00:00')],
      subs: [sub(A, 'tel'), sub(A, 'tablet')],
    });
    const summary = await run();
    expect(summary).toMatchObject({
      considered: 1,
      due: 1,
      sent: 2,
      failed: 0,
      removed: 0,
      alreadyLogged: 0,
    });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]![1]).toEqual({
      title: 'Hora del almuerzo',
      body: expect.stringContaining('cargaste'),
      url: '/add?meal=lunch',
      tag: 'meal-lunch',
    });
    expect(fake.rows('reminder_settings')[0]).toMatchObject({ last_sent_on: '2026-03-15' });
  });

  it('no repite el mismo día: una segunda corrida no manda nada', async () => {
    const { send, run } = setup({
      settings: [setting(A, 'lunch', '13:00')],
      subs: [sub(A, 'tel')],
    });
    await run();
    await run(new Date(NOW.getTime() + 15 * 60_000));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('respeta la hora local: antes de la hora, pasada la ventana y desactivado no se manda', async () => {
    const { send, run } = setup({
      settings: [
        setting(A, 'dinner', '21:00'),
        setting(A, 'breakfast', '09:00'),
        setting(A, 'snack', '13:05', { enabled: false }),
      ],
      subs: [sub(A, 'tel')],
    });
    const summary = await run();
    expect(summary).toMatchObject({ considered: 2, due: 0, sent: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it('usa la zona horaria de cada usuario', async () => {
    const { send, run } = setup({
      settings: [setting(A, 'lunch', '13:00'), setting(B, 'lunch', '13:00')],
      subs: [sub(A, 'a'), sub(B, 'b')],
      profiles: [profile(A), profile(B, 'Asia/Tokyo')], // en Tokio son las 01:10: no es hora de almorzar
    });
    await run();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0].endpoint).toContain('/a');
  });

  it('una zona horaria inválida usa la de Argentina en vez de romper todo', async () => {
    const { send, run } = setup({
      settings: [setting(A, 'lunch', '13:00')],
      subs: [sub(A, 'a')],
      profiles: [profile(A, 'No/Existe')],
    });
    await run();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('no avisa si esa comida ya está cargada hoy (y lo da por resuelto)', async () => {
    const { fake, send, run } = setup({
      settings: [setting(A, 'lunch', '13:00'), setting(A, 'dinner', '13:00')],
      subs: [sub(A, 'tel')],
      entries: [
        { user_id: A, logged_on: '2026-03-15', meal_type: 'lunch' },
        { user_id: A, logged_on: '2026-03-14', meal_type: 'dinner' }, // de ayer: no cuenta
        { user_id: B, logged_on: '2026-03-15', meal_type: 'dinner' }, // de otra persona: no cuenta
      ],
    });
    const summary = await run();
    expect(summary).toMatchObject({ due: 2, alreadyLogged: 1, sent: 1 });
    expect(send.mock.calls[0]![1].tag).toBe('meal-dinner');
    expect(fake.rows('reminder_settings').every((row) => row.last_sent_on === '2026-03-15')).toBe(
      true,
    );
  });

  it('sin dispositivos no manda ni marca (si activa uno a tiempo, todavía le llega)', async () => {
    const { fake, send, run } = setup({
      settings: [setting(A, 'lunch', '13:00')],
      subs: [sub(B, 'otro')],
    });
    const summary = await run();
    expect(summary).toMatchObject({ due: 1, sent: 0 });
    expect(send).not.toHaveBeenCalled();
    expect(fake.rows('reminder_settings')[0]!.last_sent_on).toBeNull();
  });

  it('borra las suscripciones inválidas (410) y, si eran todas, da el aviso por resuelto', async () => {
    const { fake, run } = setup(
      { settings: [setting(A, 'lunch', '13:00')], subs: [sub(A, 'muerta'), sub(B, 'viva')] },
      { muerta: 'gone' },
    );
    const summary = await run();
    expect(summary).toMatchObject({ sent: 0, removed: 1, failed: 0 });
    expect(fake.rows('push_subscriptions').map((s) => s.endpoint)).toEqual([
      'https://push.example/viva',
    ]);
    expect(fake.rows('reminder_settings')[0]!.last_sent_on).toBe('2026-03-15');
  });

  it('un fallo pasajero no lo marca (reintenta en la próxima corrida) y no borra la suscripción', async () => {
    const { fake, run } = setup(
      { settings: [setting(A, 'lunch', '13:00')], subs: [sub(A, 'caida')] },
      { caida: 'failed' },
    );
    const first = await run();
    expect(first).toMatchObject({ sent: 0, failed: 1, removed: 0 });
    expect(fake.rows('reminder_settings')[0]!.last_sent_on).toBeNull();
    expect(fake.rows('push_subscriptions')).toHaveLength(1);
  });

  it('si llegó a un dispositivo y falló otro, queda resuelto (no se duplica en el que sí llegó)', async () => {
    const { fake, run } = setup(
      { settings: [setting(A, 'lunch', '13:00')], subs: [sub(A, 'ok'), sub(A, 'caida')] },
      { caida: 'failed' },
    );
    expect(await run()).toMatchObject({ sent: 1, failed: 1 });
    expect(fake.rows('reminder_settings')[0]!.last_sent_on).toBe('2026-03-15');
  });

  it('sin recordatorios activos no consulta nada más', async () => {
    const { send, run } = setup({});
    expect(await run()).toEqual({
      considered: 0,
      due: 0,
      alreadyLogged: 0,
      sent: 0,
      failed: 0,
      removed: 0,
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('un error de la base se propaga (la tarea responde 500 y se reintenta)', async () => {
    const fake = createFakeSupabase({
      userId: null,
      tables: { reminder_settings: { rows: [] } },
      failWhen: () => 'boom',
    });
    await expect(
      runReminders({ admin: fake.client as unknown as SupabaseClient, sender: { send: vi.fn() } }),
    ).rejects.toThrow(/recordatorios/);
  });
});
