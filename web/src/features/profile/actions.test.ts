import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Call = {
  table: string;
  op: 'select' | 'upsert' | 'update';
  columns?: string;
  payload?: Record<string, unknown>;
  options?: unknown;
  filters: [string, unknown][];
};

type Config = {
  user: { id: string } | null;
  profile: { timezone: string; onboarding_completed_at: string | null } | null;
  latestWeight: number | null;
  failWeightUpsert: boolean;
  failProfileUpdate: boolean;
  profileUpdateMatches: number;
};

const h = vi.hoisted(() => {
  const calls: Call[] = [];
  const config: Config = {
    user: { id: 'user-1' },
    profile: { timezone: 'America/Argentina/Cordoba', onboarding_completed_at: null },
    latestWeight: 62.5,
    failWeightUpsert: false,
    failProfileUpdate: false,
    profileUpdateMatches: 1,
  };
  class Redirect extends Error {
    constructor(readonly to: string) {
      super(`REDIRECT:${to}`);
    }
  }
  const revalidatePath = vi.fn();
  return { calls, config, Redirect, revalidatePath };
});

function resolve(call: Call) {
  const { config } = h;
  if (call.table === 'profiles' && call.op === 'select')
    return { data: config.profile, error: null };
  if (call.table === 'weight_logs' && call.op === 'upsert') {
    return { data: null, error: config.failWeightUpsert ? { message: 'boom' } : null };
  }
  if (call.table === 'weight_logs' && call.op === 'select') {
    return {
      data: config.latestWeight === null ? null : { weight_kg: config.latestWeight },
      error: null,
    };
  }
  if (call.table === 'profiles' && call.op === 'update') {
    if (config.failProfileUpdate) return { data: null, error: { message: 'boom' } };
    return {
      data: Array.from({ length: config.profileUpdateMatches }, () => ({ user_id: 'user-1' })),
      error: null,
    };
  }
  return { data: null, error: null };
}

function from(table: string) {
  const call: Call = { table, op: 'select', filters: [] };
  h.calls.push(call);
  const builder = {
    select(columns?: string) {
      if (call.op === 'select') call.columns = columns;
      return builder;
    },
    upsert(payload: Record<string, unknown>, options?: unknown) {
      call.op = 'upsert';
      call.payload = payload;
      call.options = options;
      return builder;
    },
    update(payload: Record<string, unknown>) {
      call.op = 'update';
      call.payload = payload;
      return builder;
    },
    eq(column: string, value: unknown) {
      call.filters.push([column, value]);
      return builder;
    },
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => resolve(call),
    then: (onFulfilled: (value: unknown) => unknown) =>
      Promise.resolve(resolve(call)).then(onFulfilled),
  };
  return builder;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: h.config.user } }) },
    from,
  }),
}));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new h.Redirect(to);
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: h.revalidatePath }));

const { completeOnboarding, logWeight, updateProfile } = await import('./actions');

const valid = {
  displayName: 'Ana',
  sex: 'female',
  birthDate: '1996-03-15',
  heightCm: 165,
  weightKg: 62.5,
  targetWeightKg: 58,
  activityLevel: 'low_active',
  goal: 'lose',
  weeklyGoalKg: -0.5,
  macroPreset: 'balanced',
};

const writes = () => h.calls.filter((c) => c.op !== 'select');
const find = (table: string, op: Call['op']) =>
  h.calls.find((c) => c.table === table && c.op === op);

beforeEach(() => {
  h.calls.length = 0;
  h.revalidatePath.mockClear();
  Object.assign(h.config, {
    user: { id: 'user-1' },
    profile: { timezone: 'America/Argentina/Cordoba', onboarding_completed_at: null },
    latestWeight: 62.5,
    failWeightUpsert: false,
    failProfileUpdate: false,
    profileUpdateMatches: 1,
  });
  vi.useFakeTimers({ now: new Date('2026-03-15T15:00:00Z') });
});

afterEach(() => vi.useRealTimers());

describe('completeOnboarding', () => {
  it('sin sesión devuelve un error y no escribe nada', async () => {
    h.config.user = null;
    expect(await completeOnboarding(valid)).toEqual({
      ok: false,
      error: 'Tu sesión venció. Volvé a ingresar.',
    });
    expect(writes()).toHaveLength(0);
  });

  it('guarda el peso del día, el perfil, marca el onboarding y redirige a /', async () => {
    await expect(completeOnboarding(valid)).rejects.toThrow('REDIRECT:/');

    const weight = find('weight_logs', 'upsert');
    expect(weight?.payload).toEqual({
      user_id: 'user-1',
      logged_on: '2026-03-15',
      weight_kg: 62.5,
    });
    expect(weight?.options).toEqual({ onConflict: 'user_id,logged_on' });

    const profile = find('profiles', 'update');
    expect(profile?.filters).toEqual([['user_id', 'user-1']]);
    expect(profile?.payload).toMatchObject({
      display_name: 'Ana',
      sex: 'female',
      birth_date: '1996-03-15',
      height_cm: 165,
      weight_kg: 62.5,
      target_weight_kg: 58,
      activity_level: 'low_active',
      goal: 'lose',
      weekly_goal_kg: -0.5,
      macro_split: { carbs: 0.5, fat: 0.3, protein: 0.2 },
      protein_g_per_kg: null,
    });
    expect(profile?.payload?.onboarding_completed_at).toBe('2026-03-15T15:00:00.000Z');
  });

  it('escribe el peso antes que el perfil: si falla el perfil, reintentar es seguro', async () => {
    await expect(completeOnboarding(valid)).rejects.toThrow();
    const order = writes().map((c) => c.table);
    expect(order).toEqual(['weight_logs', 'profiles']);
  });

  it('el día se calcula en la zona horaria del usuario, no en UTC', async () => {
    vi.setSystemTime(new Date('2026-03-15T02:30:00Z')); // 23:30 del 14 en Córdoba
    await expect(completeOnboarding(valid)).rejects.toThrow('REDIRECT:/');
    expect(find('weight_logs', 'upsert')?.payload?.logged_on).toBe('2026-03-14');
  });

  it('valida la edad con ese mismo día local', async () => {
    // Cumple 13 el 15/03; a las 23:30 del 14 en Córdoba todavía tiene 12.
    vi.setSystemTime(new Date('2026-03-15T02:30:00Z'));
    const result = await completeOnboarding({ ...valid, birthDate: '2013-03-15' });
    expect(result).toEqual({ ok: false, error: 'Macritos es para mayores de 13 años.' });
  });

  it('rechaza datos inválidos con el mensaje en español y sin escribir', async () => {
    expect(await completeOnboarding({ ...valid, heightCm: 5 })).toEqual({
      ok: false,
      error: 'Ingresá una altura entre 100 y 250 cm.',
    });
    expect(await completeOnboarding({ ...valid, goal: 'lose', weeklyGoalKg: 0.5 })).toEqual({
      ok: false,
      error: 'Elegí un ritmo.',
    });
    expect(await completeOnboarding('basura')).toMatchObject({ ok: false });
    expect(writes()).toHaveLength(0);
  });

  it('el peso es obligatorio en el onboarding', async () => {
    const { weightKg: _w, ...withoutWeight } = valid;
    expect(await completeOnboarding({ ...withoutWeight, targetWeightKg: undefined })).toEqual({
      ok: false,
      error: 'Ingresá un peso entre 25 y 400 kg.',
    });
    expect(writes()).toHaveLength(0);
  });

  it('si falla el guardado del peso no toca el perfil', async () => {
    h.config.failWeightUpsert = true;
    expect(await completeOnboarding(valid)).toEqual({
      ok: false,
      error: 'No pudimos guardar los datos. Probá de nuevo.',
    });
    expect(find('profiles', 'update')).toBeUndefined();
  });

  it('si falla la actualización del perfil, o no encuentra la fila, devuelve error', async () => {
    h.config.failProfileUpdate = true;
    expect(await completeOnboarding(valid)).toMatchObject({ ok: false });
    h.config.failProfileUpdate = false;
    h.config.profileUpdateMatches = 0;
    expect(await completeOnboarding(valid)).toMatchObject({ ok: false });
  });

  it('si ya estaba completado, no pisa nada y solo redirige', async () => {
    h.config.profile = {
      timezone: 'America/Argentina/Cordoba',
      onboarding_completed_at: '2026-01-01T00:00:00Z',
    };
    await expect(completeOnboarding(valid)).rejects.toThrow('REDIRECT:/');
    expect(writes()).toHaveLength(0);
  });

  it('no deja escribir columnas ajenas aunque el cliente las mande', async () => {
    await expect(
      completeOnboarding({
        ...valid,
        user_id: 'otro-usuario',
        kcal_adjustment: 5000,
        kcalAdjustment: 5000,
        onboarding_completed_at: '1999-01-01',
        timezone: 'UTC',
      }),
    ).rejects.toThrow('REDIRECT:/');
    const payload = find('profiles', 'update')?.payload ?? {};
    for (const column of ['user_id', 'kcal_adjustment', 'timezone'])
      expect(payload).not.toHaveProperty(column);
    expect(payload.onboarding_completed_at).not.toBe('1999-01-01');
    expect(find('profiles', 'update')?.filters).toEqual([['user_id', 'user-1']]);
  });
});

describe('updateProfile', () => {
  const { weightKg: _w, ...edit } = valid;

  it('actualiza sin tocar el peso ni el onboarding, y revalida /profile', async () => {
    expect(await updateProfile({ ...edit, weightKg: 99 })).toEqual({ ok: true });
    const payload = find('profiles', 'update')?.payload ?? {};
    expect(payload).toMatchObject({ goal: 'lose', height_cm: 165 });
    expect(payload).not.toHaveProperty('weight_kg');
    expect(payload).not.toHaveProperty('onboarding_completed_at');
    expect(h.revalidatePath).toHaveBeenCalledWith('/profile');
  });

  it('sin preset conserva el reparto de macros que ya tenía', async () => {
    await updateProfile({ ...edit, macroPreset: undefined });
    const payload = find('profiles', 'update')?.payload ?? {};
    expect(payload).not.toHaveProperty('macro_split');
    expect(payload).not.toHaveProperty('protein_g_per_kg');
  });

  it('sin sesión, con datos inválidos o sin fila devuelve error y no escribe de más', async () => {
    h.config.user = null;
    expect(await updateProfile(edit)).toMatchObject({ ok: false });
    h.config.user = { id: 'user-1' };
    h.calls.length = 0;
    expect(await updateProfile({ ...edit, heightCm: 1 })).toMatchObject({ ok: false });
    expect(writes()).toHaveLength(0);
    h.config.profileUpdateMatches = 0;
    expect(await updateProfile(edit)).toMatchObject({ ok: false });
    expect(h.revalidatePath).not.toHaveBeenCalled();
  });
});

describe('logWeight', () => {
  it('guarda el peso de hoy y refleja en el perfil el registro más reciente', async () => {
    h.config.latestWeight = 61.8;
    expect(await logWeight({ weightKg: 61.8 })).toEqual({ ok: true });

    expect(find('weight_logs', 'upsert')?.payload).toEqual({
      user_id: 'user-1',
      logged_on: '2026-03-15',
      weight_kg: 61.8,
    });
    const update = find('profiles', 'update');
    expect(update?.payload).toEqual({ weight_kg: 61.8 });
    expect(update?.filters).toEqual([['user_id', 'user-1']]);
    expect(h.revalidatePath).toHaveBeenCalledWith('/profile');
    expect(h.revalidatePath).toHaveBeenCalledWith('/');
  });

  it('el día es el local del usuario', async () => {
    vi.setSystemTime(new Date('2026-03-15T02:30:00Z'));
    await logWeight({ weightKg: 70 });
    expect(find('weight_logs', 'upsert')?.payload?.logged_on).toBe('2026-03-14');
  });

  it('rechaza pesos fuera de rango y tipos incorrectos sin escribir', async () => {
    for (const bad of [
      { weightKg: 10 },
      { weightKg: 500 },
      { weightKg: '70' },
      { weightKg: Number.NaN },
      {},
      null,
    ]) {
      expect(await logWeight(bad), JSON.stringify(bad)).toMatchObject({ ok: false });
    }
    expect(writes()).toHaveLength(0);
  });

  it('sin sesión devuelve error; si falla algún paso, también', async () => {
    h.config.user = null;
    expect(await logWeight({ weightKg: 70 })).toMatchObject({ ok: false });
    h.config.user = { id: 'user-1' };
    h.config.failWeightUpsert = true;
    expect(await logWeight({ weightKg: 70 })).toMatchObject({ ok: false });
    h.config.failWeightUpsert = false;
    h.config.latestWeight = null;
    expect(await logWeight({ weightKg: 70 })).toMatchObject({ ok: false });
    h.config.latestWeight = 70;
    h.config.profileUpdateMatches = 0;
    expect(await logWeight({ weightKg: 70 })).toMatchObject({ ok: false });
  });
});
