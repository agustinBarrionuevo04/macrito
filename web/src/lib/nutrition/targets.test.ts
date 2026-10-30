import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UserProfile } from '@/types';
import { NutritionInputError } from './errors';
import { calcTargets, computeTargets } from './targets';

const TODAY = '2026-03-15';

/** Hombre de 25 años, 80 kg, 180 cm, sedentario: TEE = 2662.40 (IOM p. 204, derivado fuera del repo). */
const man: UserProfile = {
  sex: 'male',
  birthDate: '2001-03-15',
  heightCm: 180,
  weightKg: 80,
  activityLevel: 'sedentary',
  goal: 'lose',
  kcalAdjustment: 0,
  timezone: 'America/Argentina/Cordoba',
};

/** Mujer de 40 años, 45 kg, 150 cm, sedentaria: TEE = 387 − 292.4 + 490.5 + 991.05 = 1576.15. */
const smallWoman: UserProfile = {
  sex: 'female',
  birthDate: '1986-03-15',
  heightCm: 150,
  weightKg: 45,
  activityLevel: 'sedentary',
  goal: 'lose',
  kcalAdjustment: 0,
  timezone: 'America/Argentina/Cordoba',
};

describe('calcTargets — kcal', () => {
  it('bajar sin objetivo semanal: TEE − 500', () => {
    const t = calcTargets(man, { today: TODAY });
    expect(t.age).toBe(25);
    expect(t.tee).toBeCloseTo(2662.4, 1);
    expect(t.goalAdjustment).toBe(-500);
    expect(t.rawKcal).toBeCloseTo(2162.4, 1);
    expect(t.kcal).toBeCloseTo(2162.4, 1);
    expect(t.warnings).toEqual([]);
  });

  it('mantener y subir sin objetivo semanal: 0 y +500', () => {
    expect(calcTargets({ ...man, goal: 'maintain' }, { today: TODAY }).kcal).toBeCloseTo(2662.4, 1);
    expect(calcTargets({ ...man, goal: 'gain' }, { today: TODAY }).kcal).toBeCloseTo(3162.4, 1);
  });

  it('con objetivo semanal: kg/semana × 1100', () => {
    const lose = calcTargets({ ...man, weeklyGoalKg: -0.5 }, { today: TODAY });
    expect(lose.goalAdjustment).toBeCloseTo(-550, 6);
    expect(lose.kcal).toBeCloseTo(2112.4, 1);

    const gain = calcTargets({ ...man, goal: 'gain', weeklyGoalKg: 0.25 }, { today: TODAY });
    expect(gain.goalAdjustment).toBeCloseTo(275, 6);
    expect(gain.kcal).toBeCloseTo(2937.4, 1);
  });

  it('suma el ajuste manual, positivo o negativo', () => {
    expect(calcTargets({ ...man, kcalAdjustment: 100 }, { today: TODAY }).kcal).toBeCloseTo(
      2262.4,
      1,
    );
    expect(calcTargets({ ...man, kcalAdjustment: -200 }, { today: TODAY }).kcal).toBeCloseTo(
      1962.4,
      1,
    );
  });

  it('expone el PAL y el coeficiente PA usados', () => {
    const t = calcTargets({ ...man, activityLevel: 'very_active' }, { today: TODAY });
    expect(t.pal).toBe(2.2);
    expect(t.pa).toBe(1.54);
    expect(t.tee).toBeCloseTo(3764.76, 1);
  });
});

describe('calcTargets — objetivo semanal inconsistente', () => {
  it('bajar con un objetivo que sube: lo ignora y avisa', () => {
    const t = calcTargets({ ...man, weeklyGoalKg: 0.5 }, { today: TODAY });
    expect(t.goalAdjustment).toBe(-500);
    expect(t.warnings).toContainEqual({
      code: 'weekly_goal_ignored',
      reason: 'direction_mismatch',
    });
  });

  it('subir con un objetivo que baja: lo ignora y avisa', () => {
    const t = calcTargets({ ...man, goal: 'gain', weeklyGoalKg: -0.5 }, { today: TODAY });
    expect(t.goalAdjustment).toBe(500);
    expect(t.warnings).toContainEqual({
      code: 'weekly_goal_ignored',
      reason: 'direction_mismatch',
    });
  });

  it('mantener con objetivo distinto de 0: lo ignora; con 0 no avisa', () => {
    const ignored = calcTargets({ ...man, goal: 'maintain', weeklyGoalKg: 0.25 }, { today: TODAY });
    expect(ignored.goalAdjustment).toBe(0);
    expect(ignored.warnings).toContainEqual({
      code: 'weekly_goal_ignored',
      reason: 'direction_mismatch',
    });

    const zero = calcTargets({ ...man, goal: 'maintain', weeklyGoalKg: 0 }, { today: TODAY });
    expect(zero.goalAdjustment).toBe(0);
    expect(zero.warnings).toEqual([]);
  });

  it('bajar con objetivo semanal 0 es inconsistente', () => {
    const t = calcTargets({ ...man, weeklyGoalKg: 0 }, { today: TODAY });
    expect(t.goalAdjustment).toBe(-500);
    expect(t.warnings).toContainEqual({
      code: 'weekly_goal_ignored',
      reason: 'direction_mismatch',
    });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'valor no finito (%s): lo ignora y avisa',
    (weeklyGoalKg) => {
      const t = calcTargets({ ...man, weeklyGoalKg }, { today: TODAY });
      expect(t.goalAdjustment).toBe(-500);
      expect(t.warnings).toContainEqual({ code: 'weekly_goal_ignored', reason: 'not_finite' });
    },
  );
});

describe('calcTargets — pisos de seguridad', () => {
  it('sube la meta al piso de mujer (1200) y avisa', () => {
    const t = calcTargets(smallWoman, { today: TODAY });
    expect(t.tee).toBeCloseTo(1576.15, 2);
    expect(t.rawKcal).toBeCloseTo(1076.15, 2);
    expect(t.kcal).toBe(1200);
    const warning = t.warnings.find((w) => w.code === 'below_kcal_floor');
    expect(warning).toMatchObject({ code: 'below_kcal_floor', floorKcal: 1200 });
    expect(warning && 'rawKcal' in warning ? warning.rawKcal : 0).toBeCloseTo(1076.15, 2);
  });

  it('un objetivo semanal agresivo también cae al piso', () => {
    const t = calcTargets({ ...man, weeklyGoalKg: -2 }, { today: TODAY }); // −2200 kcal/día
    expect(t.rawKcal).toBeCloseTo(462.4, 1);
    expect(t.kcal).toBe(1500);
    expect(t.warnings.map((w) => w.code)).toContain('below_kcal_floor');
  });

  it('el ajuste manual no puede perforar el piso', () => {
    const t = calcTargets({ ...man, goal: 'maintain', kcalAdjustment: -2000 }, { today: TODAY });
    expect(t.kcal).toBe(1500);
  });

  it('el piso es configurable por sexo', () => {
    const t = calcTargets(smallWoman, { today: TODAY, minKcal: { female: 1000 } });
    expect(t.floorKcal).toBe(1000);
    expect(t.kcal).toBeCloseTo(1076.15, 2);
    expect(t.warnings.map((w) => w.code)).not.toContain('below_kcal_floor');

    const strict = calcTargets(man, { today: TODAY, minKcal: { male: 2500 } });
    expect(strict.kcal).toBe(2500);
    expect(strict.warnings.map((w) => w.code)).toContain('below_kcal_floor');
  });

  it('exactamente en el piso no avisa (comparación estricta)', () => {
    const raw = calcTargets(smallWoman, { today: TODAY }).rawKcal;
    const t = calcTargets(smallWoman, { today: TODAY, minKcal: { female: raw } });
    expect(t.warnings.map((w) => w.code)).not.toContain('below_kcal_floor');
  });

  it('los macros se calculan sobre la meta ya elevada al piso', () => {
    const t = calcTargets(smallWoman, { today: TODAY });
    expect(t.protein_g * 4 + t.carbs_g * 4 + t.fat_g * 9).toBeCloseTo(1200, 6);
  });
});

describe('calcTargets — edad', () => {
  it('avisa que usa ecuaciones de adultos por debajo de 19 años', () => {
    const teen = calcTargets({ ...man, birthDate: '2007-03-16' }, { today: TODAY }); // 18 años y 364 días
    expect(teen.age).toBe(18);
    expect(teen.warnings).toContainEqual({ code: 'adult_equations_under_19', age: 18 });

    const adult = calcTargets({ ...man, birthDate: '2007-03-15' }, { today: TODAY });
    expect(adult.age).toBe(19);
    expect(adult.warnings.map((w) => w.code)).not.toContain('adult_equations_under_19');
  });

  it('acepta justo 13 años y rechaza 12', () => {
    expect(calcTargets({ ...man, birthDate: '2013-03-15' }, { today: TODAY }).age).toBe(13);
    expect(() => calcTargets({ ...man, birthDate: '2013-03-16' }, { today: TODAY })).toThrow(
      NutritionInputError,
    );
  });

  it('rechaza más de 130 años y fechas de nacimiento futuras', () => {
    expect(() => calcTargets({ ...man, birthDate: '1895-03-15' }, { today: TODAY })).toThrow(
      NutritionInputError,
    );
    expect(() => calcTargets({ ...man, birthDate: '2030-01-01' }, { today: TODAY })).toThrow(
      NutritionInputError,
    );
  });
});

describe('calcTargets — "hoy" respeta la zona horaria del perfil', () => {
  afterEach(() => vi.useRealTimers());

  it('a las 23:30 del 14 en Córdoba (ya 15 en UTC) todavía no cumplió años', () => {
    vi.useFakeTimers({ now: new Date('2026-03-15T02:30:00Z') });
    const born = { ...man, birthDate: '2000-03-15' };
    expect(calcTargets(born).age).toBe(25);
    expect(calcTargets({ ...born, timezone: 'UTC' }).age).toBe(26);
  });
});

describe('calcTargets — entradas inválidas', () => {
  it.each([0, -5, Number.NaN, 1, 641])('rechaza weightKg = %s', (weightKg) => {
    expect(() => calcTargets({ ...man, weightKg }, { today: TODAY })).toThrow(NutritionInputError);
  });

  it.each([0, Number.NaN, 29, 301])('rechaza heightCm = %s', (heightCm) => {
    expect(() => calcTargets({ ...man, heightCm }, { today: TODAY })).toThrow(NutritionInputError);
  });

  it('rechaza un ajuste manual no finito', () => {
    expect(() => calcTargets({ ...man, kcalAdjustment: Number.NaN }, { today: TODAY })).toThrow(
      NutritionInputError,
    );
  });

  it('propaga un split de macros inválido', () => {
    expect(() =>
      calcTargets({ ...man, macroSplit: { carbs: 0.9, fat: 0.9, protein: 0.9 } }, { today: TODAY }),
    ).toThrow(NutritionInputError);
  });
});

describe('calcTargets — macros', () => {
  it('por defecto: proteína por objetivo (bajar = 2.0 g/kg)', () => {
    const t = calcTargets(man, { today: TODAY });
    expect(t.macroMode).toBe('default');
    expect(t.protein_g).toBeCloseTo(160, 6);
    expect(t.fat_g).toBeCloseTo(60.0667, 3);
    expect(t.carbs_g).toBeCloseTo(245.45, 2);
  });

  it('usa los g/kg del perfil', () => {
    const t = calcTargets({ ...man, proteinGPerKg: 1.5 }, { today: TODAY });
    expect(t.macroMode).toBe('g_per_kg');
    expect(t.protein_g).toBeCloseTo(120, 6);
  });

  it('usa el reparto porcentual del perfil', () => {
    const t = calcTargets(
      { ...man, goal: 'maintain', macroSplit: { carbs: 0.5, fat: 0.3, protein: 0.2 } },
      { today: TODAY },
    );
    expect(t.macroMode).toBe('split');
    expect(t.protein_g).toBeCloseTo((2662.4 * 0.2) / 4, 1);
    expect(t.carbs_g).toBeCloseTo((2662.4 * 0.5) / 4, 1);
    expect(t.fat_g).toBeCloseTo((2662.4 * 0.3) / 9, 1);
  });

  it('avisa si la proteína pedida no entra en las kcal', () => {
    // 160 kg × 2.5 g/kg = 1600 kcal de proteína; el ajuste manual lleva la meta al piso de 1500.
    const t = calcTargets(
      { ...man, weightKg: 160, goal: 'maintain', kcalAdjustment: -5000, proteinGPerKg: 2.5 },
      { today: TODAY },
    );
    expect(t.kcal).toBe(1500);
    expect(t.protein_g).toBeCloseTo(375, 6);
    expect(t.fat_g).toBe(0);
    expect(t.carbs_g).toBe(0);
    expect(t.warnings.map((w) => w.code)).toContain('protein_capped');
  });
});

describe('computeTargets (contrato 1.3)', () => {
  it('devuelve DailyTargets redondeados a enteros', () => {
    expect(computeTargets(man, { today: TODAY })).toEqual({
      kcal: 2162,
      protein_g: 160,
      carbs_g: 245,
      fat_g: 60,
    });
  });

  it('dos usuarios con perfiles distintos reciben metas distintas', () => {
    const a = computeTargets(man, { today: TODAY });
    const b = computeTargets(smallWoman, { today: TODAY });
    expect(a).not.toEqual(b);
    expect(b.kcal).toBe(1200);
  });

  it('es determinista: misma entrada, misma salida', () => {
    expect(computeTargets(man, { today: TODAY })).toEqual(computeTargets(man, { today: TODAY }));
  });
});
