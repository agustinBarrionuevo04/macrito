import { describe, expect, it } from 'vitest';
import { createFakeSupabase } from './fake-supabase';

const ME = 'user-me';
const OTHER = 'user-other';

function setup(failWhen?: Parameters<typeof createFakeSupabase>[0]['failWhen']) {
  return createFakeSupabase({
    userId: ME,
    failWhen,
    tables: {
      entries: {
        ownerColumn: 'user_id',
        rows: [
          { id: 'a', user_id: ME, day: '2026-03-15', kcal: 100 },
          { id: 'b', user_id: ME, day: '2026-03-16', kcal: 200 },
          { id: 'c', user_id: OTHER, day: '2026-03-15', kcal: 999 },
        ],
      },
      foods: { rows: [{ id: 'f1', name: 'Leche' }] },
    },
  });
}

describe('fake supabase', () => {
  it('la RLS oculta las filas ajenas y no deja leerlas por id', async () => {
    const { client } = setup();
    const all = await client.from('entries').select('*');
    expect((all.data as { id: string }[]).map((r) => r.id)).toEqual(['a', 'b']);
    const other = await client.from('entries').select('*').eq('id', 'c').maybeSingle();
    expect(other.data).toBeNull();
  });

  it('filtra, ordena y limita', async () => {
    const { client } = setup();
    const result = await client
      .from('entries')
      .select('*')
      .gte('day', '2026-03-15')
      .order('kcal', { ascending: false })
      .limit(1);
    expect((result.data as { id: string }[]).map((r) => r.id)).toEqual(['b']);
    const inFilter = await client.from('entries').select('*').in('id', ['a', 'c']);
    expect((inFilter.data as { id: string }[]).map((r) => r.id)).toEqual(['a']);
  });

  it('single falla si no hay exactamente una fila; maybeSingle devuelve null', async () => {
    const { client } = setup();
    expect((await client.from('entries').select('*').eq('id', 'nada').single()).error?.code).toBe(
      'PGRST116',
    );
    expect(
      (await client.from('entries').select('*').eq('id', 'nada').maybeSingle()).data,
    ).toBeNull();
    expect((await client.from('entries').select('*').single()).error?.code).toBe('PGRST116');
  });

  it('insert completa id y created_at, y devuelve la fila con select', async () => {
    const { client, rows } = setup();
    const result = await client
      .from('entries')
      .insert({ user_id: ME, day: '2026-03-17', kcal: 5 })
      .select();
    const created = (result.data as { id: string; created_at: string }[])[0];
    expect(created?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(created?.created_at).toBeTruthy();
    expect(rows('entries')).toHaveLength(4);
  });

  it('no deja insertar a nombre de otro usuario', async () => {
    const { client, rows } = setup();
    const result = await client
      .from('entries')
      .insert({ user_id: OTHER, day: '2026-03-17', kcal: 5 });
    expect(result.error?.code).toBe('42501');
    expect(rows('entries')).toHaveLength(3);
  });

  it('update y delete solo alcanzan filas propias', async () => {
    const { client, rows } = setup();
    const mine = await client.from('entries').update({ kcal: 1 }).eq('id', 'a').select();
    expect((mine.data as unknown[]).length).toBe(1);
    const theirs = await client.from('entries').update({ kcal: 1 }).eq('id', 'c').select();
    expect((theirs.data as unknown[]).length).toBe(0);
    expect(rows('entries').find((r) => r.id === 'c')?.kcal).toBe(999);

    const deleted = await client.from('entries').delete().eq('id', 'c').select();
    expect((deleted.data as unknown[]).length).toBe(0);
    await client.from('entries').delete().eq('id', 'a');
    expect(rows('entries').map((r) => r.id)).toEqual(['b', 'c']);
  });

  it('update no deja reasignar la fila a otro usuario', async () => {
    const { client } = setup();
    const result = await client.from('entries').update({ user_id: OTHER }).eq('id', 'a');
    expect(result.error?.code).toBe('42501');
  });

  it('upsert actualiza por la clave de conflicto o inserta', async () => {
    const { client, rows } = setup();
    await client
      .from('entries')
      .upsert({ user_id: ME, day: '2026-03-15', kcal: 150 }, { onConflict: 'user_id,day' });
    expect(rows('entries').filter((r) => r.user_id === ME && r.day === '2026-03-15')).toHaveLength(
      1,
    );
    expect(rows('entries').find((r) => r.id === 'a')?.kcal).toBe(150);
    await client
      .from('entries')
      .upsert({ user_id: ME, day: '2026-04-01', kcal: 1 }, { onConflict: 'user_id,day' });
    expect(rows('entries')).toHaveLength(4);
  });

  it('las tablas sin dueño son compartidas', async () => {
    const { client } = setup();
    expect((await client.from('foods').select('*').eq('id', 'f1').maybeSingle()).data).toEqual({
      id: 'f1',
      name: 'Leche',
    });
  });

  it('registra las llamadas y puede simular fallos', async () => {
    const { client, calls } = setup((call) => (call.op === 'delete' ? 'boom' : null));
    await client.from('entries').select('*').eq('id', 'a');
    const failed = await client.from('entries').delete().eq('id', 'a');
    expect(failed.error?.message).toBe('boom');
    expect(calls.map((c) => c.op)).toEqual(['select', 'delete']);
    expect(calls[0]?.filters).toEqual([{ column: 'id', op: 'eq', value: 'a' }]);
  });

  it('sin sesión no hay usuario; una tabla desconocida da error', async () => {
    const anonymous = createFakeSupabase({ userId: null, tables: {} });
    expect((await anonymous.client.auth.getUser()).data.user).toBeNull();
    expect((await anonymous.client.from('x').select('*')).error?.message).toContain('desconocida');
  });
});
