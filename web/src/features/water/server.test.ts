import { describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type Row } from '@/test-utils/fake-supabase';

vi.mock('server-only', () => ({}));
const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => h.client }));

import { getWaterDay, getWaterGoalSetting } from './server';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

function setup(
  water: Row[],
  profiles: Row[],
  failWhen?: Parameters<typeof createFakeSupabase>[0]['failWhen'],
) {
  const fake = createFakeSupabase({
    userId: ME,
    failWhen,
    tables: {
      water_logs: { ownerColumn: 'user_id', rows: water },
      profiles: { ownerColumn: 'user_id', rows: profiles },
    },
  });
  h.client = { from: fake.client.from.bind(fake.client), auth: fake.client.auth };
}
const log = (ml: unknown, logged_on = '2026-03-15', user_id = ME): Row => ({
  user_id,
  logged_on,
  ml,
});

describe('getWaterDay', () => {
  it('suma las tomas del día y usa la meta sugerida sin meta propia (80 kg → 2.800 ml)', async () => {
    setup(
      [log(250), log('500'), log(300, '2026-03-14'), log(999, '2026-03-15', OTHER)],
      [{ user_id: ME, water_goal_ml: null }],
    );
    expect(await getWaterDay(ME, '2026-03-15', 80)).toEqual({
      totalMl: 750,
      logs: 2,
      goalMl: 2800,
      custom: false,
    });
  });
  it('usa la meta propia si existe', async () => {
    setup([], [{ user_id: ME, water_goal_ml: 3500 }]);
    expect(await getWaterDay(ME, '2026-03-15', 80)).toEqual({
      totalMl: 0,
      logs: 0,
      goalMl: 3500,
      custom: true,
    });
  });
  it('ignora valores ilegibles y devuelve null si falla una consulta', async () => {
    setup([log('mucho'), log(200)], [{ user_id: ME, water_goal_ml: null }]);
    expect((await getWaterDay(ME, '2026-03-15', 80))?.totalMl).toBe(200);
    setup([], [], (call) => (call.table === 'profiles' ? 'boom' : null));
    expect(await getWaterDay(ME, '2026-03-15', 80)).toBeNull();
  });
});

describe('getWaterGoalSetting', () => {
  it('devuelve la meta propia o null', async () => {
    setup([], [{ user_id: ME, water_goal_ml: 3000 }]);
    expect(await getWaterGoalSetting(ME)).toBe(3000);
    setup([], [{ user_id: ME, water_goal_ml: null }]);
    expect(await getWaterGoalSetting(ME)).toBeNull();
  });
});
