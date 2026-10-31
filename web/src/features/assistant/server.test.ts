import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type Row } from '@/test-utils/fake-supabase';

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => h.client }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));

import { HABITUAL_LIMIT, getHabitualFoods } from './server';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

const entry = (food_id: string | null, name: string, logged_on: string, user_id = ME): Row => ({
  id: `${name}-${logged_on}-${user_id}`,
  user_id,
  logged_on,
  food_id,
  name,
});

function setup(rows: Row[], failing = false) {
  const fake = createFakeSupabase({
    userId: ME,
    tables: { intake_entries: { ownerColumn: 'user_id', rows } },
    ...(failing ? { failWhen: () => 'boom' } : {}),
  });
  h.client = { from: fake.client.from.bind(fake.client), auth: fake.client.auth };
}

beforeEach(() => setup([]));

describe('getHabitualFoods', () => {
  it('ordena por frecuencia y luego por nombre, y cuenta por alimento', async () => {
    setup([
      entry('f1', 'Arroz', '2026-03-10'),
      entry('f2', 'Pollo', '2026-03-11'),
      entry('f2', 'Pollo', '2026-03-12'),
      entry('f3', 'Banana', '2026-03-12'),
      entry('f2', 'Pollo', '2026-03-13'),
    ]);
    expect(await getHabitualFoods(ME, '2026-03-15')).toEqual(['Pollo', 'Arroz', 'Banana']);
  });

  it('ignora lo más viejo que 30 días, lo futuro, las calorías rápidas (sin alimento) y lo de otras personas', async () => {
    setup([
      entry('f1', 'Viejo', '2026-02-01'),
      entry('f2', 'Futuro', '2026-03-20'),
      entry(null, 'Calorías rápidas', '2026-03-14'),
      entry('f3', 'Ajeno', '2026-03-14', OTHER),
      entry('f4', 'Límite', '2026-02-13'),
    ]);
    expect(await getHabitualFoods(ME, '2026-03-15')).toEqual(['Límite']);
  });

  it(`devuelve como mucho ${HABITUAL_LIMIT} alimentos`, async () => {
    setup(Array.from({ length: 40 }, (_, i) => entry(`f${i}`, `Alimento ${i}`, '2026-03-14')));
    expect(await getHabitualFoods(ME, '2026-03-15')).toHaveLength(HABITUAL_LIMIT);
  });

  it('si falla la consulta el asistente sigue sin historial', async () => {
    setup([entry('f1', 'Arroz', '2026-03-14')], true);
    expect(await getHabitualFoods(ME, '2026-03-15')).toEqual([]);
  });
});
