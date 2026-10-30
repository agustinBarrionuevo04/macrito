import { describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type Row } from '@/test-utils/fake-supabase';

vi.mock('server-only', () => ({}));
const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => h.client }));

import { getStartingFoods } from './server';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

const food = (id: string, name: string): Row => ({
  id,
  source: 'off',
  source_id: id,
  barcode: null,
  name,
  brand: null,
  kcal_100g: 100,
  protein_100g: 1,
  carbs_100g: 1,
  fat_100g: 1,
  fiber_100g: null,
  sugar_100g: null,
  sodium_mg_100g: null,
  portions: [],
  created_by: null,
});

const entry = (food_id: string | null, created_at: string, user_id = ME): Row => ({
  user_id,
  food_id,
  created_at,
});

function setup(entries: Row[], favorites: Row[]) {
  const fake = createFakeSupabase({
    userId: ME,
    tables: {
      foods: { rows: ['a', 'b', 'c', 'd'].map((id) => food(id, `Alimento ${id}`)) },
      intake_entries: { ownerColumn: 'user_id', rows: entries },
      favorite_foods: { ownerColumn: 'user_id', rows: favorites },
    },
  });
  h.client = { from: fake.client.from.bind(fake.client), auth: fake.client.auth };
}

describe('getStartingFoods', () => {
  it('devuelve favoritos (por nombre) y recientes (más nuevo primero, sin repetir ni favoritos)', async () => {
    setup(
      [
        entry('a', '2026-03-10T10:00:00Z'),
        entry('b', '2026-03-12T10:00:00Z'),
        entry('a', '2026-03-14T10:00:00Z'),
        entry('c', '2026-03-13T10:00:00Z'),
        entry(null, '2026-03-15T10:00:00Z'), // calorías rápidas: sin alimento
        entry('d', '2026-03-16T10:00:00Z', OTHER), // de otro usuario
      ],
      [{ user_id: ME, food_id: 'c' }],
    );
    const result = await getStartingFoods(ME);
    expect(result.favoriteIds).toEqual(['c']);
    expect(result.favorites.map((f) => f.name)).toEqual(['Alimento c']);
    expect(result.recents.map((f) => f.name)).toEqual(['Alimento a', 'Alimento b']);
  });

  it('sin historial ni favoritos devuelve todo vacío', async () => {
    setup([], []);
    expect(await getStartingFoods(ME)).toEqual({ favoriteIds: [], favorites: [], recents: [] });
  });
});
