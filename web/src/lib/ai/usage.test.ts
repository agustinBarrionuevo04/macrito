import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createUsageTracker } from './usage';

const admin = (result: { data?: unknown; error?: { message: string } | null }) => {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null, ...result });
  return { rpc, tracker: createUsageTracker({ rpc } as unknown as SupabaseClient) };
};

describe('createUsageTracker', () => {
  it('reserve llama a la función atómica con los parámetros y devuelve su respuesta', async () => {
    const { rpc, tracker } = admin({ data: true });
    expect(await tracker.reserve('u1', '2026-03-15', 'photo', 20)).toBe(true);
    expect(rpc).toHaveBeenCalledWith('reserve_ai_usage', {
      p_user: 'u1',
      p_day: '2026-03-15',
      p_kind: 'photo',
      p_limit: 20,
    });
  });

  it('reserve devuelve false cuando se alcanzó el límite', async () => {
    expect(await admin({ data: false }).tracker.reserve('u', 'd', 'text', 1)).toBe(false);
  });

  it('reserve lanza si la base falla (no se deja pasar sin contar)', async () => {
    await expect(
      admin({ error: { message: 'boom' } }).tracker.reserve('u', 'd', 'text', 1),
    ).rejects.toThrow('boom');
  });

  it('release y recordTokens no lanzan aunque la base falle', async () => {
    const { tracker, rpc } = admin({ error: { message: 'boom' } });
    await expect(tracker.release('u', 'd', 'photo')).resolves.toBeUndefined();
    await expect(
      tracker.recordTokens('u', 'd', 'photo', { inputTokens: 10, outputTokens: 2 }),
    ).resolves.toBeUndefined();
    expect(rpc).toHaveBeenLastCalledWith('record_ai_tokens', {
      p_user: 'u',
      p_day: 'd',
      p_kind: 'photo',
      p_input: 10,
      p_output: 2,
    });
  });
});
