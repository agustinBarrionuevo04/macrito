import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type Row } from '@/test-utils/fake-supabase';

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => h.client }));

import { getReminderSettings } from './server';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

function setup(rows: Row[], failing = false) {
  const fake = createFakeSupabase({
    userId: ME,
    tables: { reminder_settings: { ownerColumn: 'user_id', rows } },
    ...(failing ? { failWhen: () => 'boom' } : {}),
  });
  h.client = { from: fake.client.from.bind(fake.client), auth: fake.client.auth };
}

beforeEach(() => setup([]));

describe('getReminderSettings', () => {
  it('sin nada guardado: las cuatro comidas apagadas con la hora sugerida', async () => {
    expect(await getReminderSettings(ME)).toEqual([
      { meal: 'breakfast', enabled: false, remindAt: '09:00' },
      { meal: 'lunch', enabled: false, remindAt: '13:00' },
      { meal: 'snack', enabled: false, remindAt: '17:30' },
      { meal: 'dinner', enabled: false, remindAt: '21:00' },
    ]);
  });
  it('mezcla lo guardado (HH:MM:SS de la base → HH:MM) y no mira lo de otros', async () => {
    setup([
      { user_id: ME, meal_type: 'lunch', enabled: true, remind_at: '12:45:00' },
      { user_id: ME, meal_type: 'dinner', enabled: false, remind_at: '22:00:00' },
      { user_id: OTHER, meal_type: 'breakfast', enabled: true, remind_at: '06:00:00' },
    ]);
    const rows = await getReminderSettings(ME);
    expect(rows?.find((r) => r.meal === 'lunch')).toEqual({
      meal: 'lunch',
      enabled: true,
      remindAt: '12:45',
    });
    expect(rows?.find((r) => r.meal === 'dinner')).toEqual({
      meal: 'dinner',
      enabled: false,
      remindAt: '22:00',
    });
    expect(rows?.find((r) => r.meal === 'breakfast')).toEqual({
      meal: 'breakfast',
      enabled: false,
      remindAt: '09:00',
    });
  });
  it('una hora corrupta cae a la sugerida; si falla la consulta es null', async () => {
    setup([{ user_id: ME, meal_type: 'snack', enabled: true, remind_at: 'basura' }]);
    expect((await getReminderSettings(ME))?.find((r) => r.meal === 'snack')?.remindAt).toBe(
      '17:30',
    );
    setup([], true);
    expect(await getReminderSettings(ME)).toBeNull();
  });
});
