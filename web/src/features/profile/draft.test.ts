import { describe, expect, it } from 'vitest';
import { MACRO_PRESETS } from '@/lib/nutrition';
import {
  draftToInput,
  draftToProfile,
  emptyDraft,
  firstInvalidStep,
  previewTargets,
  validateStep,
  withGoal,
  type ProfileDraft,
} from './draft';

const TODAY = '2026-03-15';
const TZ = 'America/Argentina/Cordoba';

/** Hombre de 25 años, 80 kg, 180 cm, sedentario (TEE 2662.4 según IOM p. 204). */
const complete: ProfileDraft = {
  displayName: '',
  sex: 'male',
  birthDate: '2001-03-15',
  heightCm: 180,
  weightKg: 80,
  activityLevel: 'sedentary',
  goal: 'lose',
  weeklyGoalKg: -0.5,
  targetWeightKg: null,
  macroPreset: 'high_protein',
};

describe('validateStep', () => {
  it('los pasos sin datos nunca bloquean', () => {
    for (const step of ['welcome', 'macros', 'summary'] as const) {
      expect(validateStep(step, emptyDraft(), TODAY)).toBeNull();
    }
  });

  it('cada paso exige lo suyo', () => {
    const draft = emptyDraft();
    expect(validateStep('sex', draft, TODAY)).toBe('Elegí una opción.');
    expect(validateStep('birth', draft, TODAY)).toBe('Ingresá tu fecha de nacimiento.');
    expect(validateStep('body', draft, TODAY)).toContain('altura');
    expect(validateStep('activity', draft, TODAY)).toBe('Elegí tu nivel de actividad.');
    expect(validateStep('goal', draft, TODAY)).toBe('Elegí tu objetivo.');
  });

  it('valida la edad aunque falten todos los demás datos (no depende del esquema entero)', () => {
    expect(validateStep('birth', { ...emptyDraft(), birthDate: '2020-01-01' }, TODAY)).toBe(
      'Macritos es para mayores de 13 años.',
    );
    expect(validateStep('birth', { ...emptyDraft(), birthDate: '2001-03-15' }, TODAY)).toBeNull();
  });

  it('altura antes que peso, y ambos en rango', () => {
    expect(validateStep('body', { ...emptyDraft(), heightCm: 180 }, TODAY)).toContain('peso');
    expect(
      validateStep('body', { ...emptyDraft(), heightCm: 180, weightKg: 80 }, TODAY),
    ).toBeNull();
  });

  it('el paso del objetivo valida ritmo y peso objetivo', () => {
    expect(validateStep('goal', complete, TODAY)).toBeNull();
    expect(validateStep('goal', { ...complete, weeklyGoalKg: null }, TODAY)).toBe(
      'Elegí un ritmo.',
    );
    expect(validateStep('goal', { ...complete, targetWeightKg: 90 }, TODAY)).toContain(
      'menor que el actual',
    );
    expect(
      validateStep(
        'goal',
        { ...complete, goal: 'maintain', weeklyGoalKg: null, targetWeightKg: 75 },
        TODAY,
      ),
    ).toBeNull();
  });
});

describe('withGoal', () => {
  it('pone el ritmo por defecto del nuevo objetivo', () => {
    expect(withGoal(complete, 'gain').weeklyGoalKg).toBe(0.25);
    expect(withGoal(complete, 'lose').weeklyGoalKg).toBe(-0.5);
  });

  it('mantener quita el ritmo', () => {
    expect(withGoal(complete, 'maintain')).toMatchObject({ goal: 'maintain', weeklyGoalKg: null });
  });

  it('no modifica el borrador original', () => {
    const copy = { ...complete };
    withGoal(complete, 'gain');
    expect(complete).toEqual(copy);
  });
});

describe('draftToProfile', () => {
  it('arma el perfil con el ajuste manual en 0', () => {
    expect(draftToProfile(complete, TZ)).toEqual({
      sex: 'male',
      birthDate: '2001-03-15',
      heightCm: 180,
      weightKg: 80,
      activityLevel: 'sedentary',
      goal: 'lose',
      kcalAdjustment: 0,
      timezone: TZ,
      weeklyGoalKg: -0.5,
    });
  });

  it('aplica el reparto del preset elegido y el peso objetivo', () => {
    const profile = draftToProfile({ ...complete, macroPreset: 'classic', targetWeightKg: 70 }, TZ);
    expect(profile).toMatchObject({ macroSplit: MACRO_PRESETS.classic, targetWeightKg: 70 });
  });

  it('"alto en proteína" no fija reparto', () => {
    expect(draftToProfile(complete, TZ)).not.toHaveProperty('macroSplit');
  });

  it('devuelve null mientras falte algún dato', () => {
    expect(draftToProfile(emptyDraft(), TZ)).toBeNull();
    for (const field of [
      'sex',
      'birthDate',
      'heightCm',
      'weightKg',
      'activityLevel',
      'goal',
    ] as const) {
      const incomplete = { ...complete, [field]: field === 'birthDate' ? '' : null };
      expect(draftToProfile(incomplete, TZ), field).toBeNull();
    }
  });
});

describe('previewTargets', () => {
  it('calcula la meta en vivo con el desglose (valores de IOM p. 204)', () => {
    const t = previewTargets(complete, TZ, TODAY);
    expect(t?.tee).toBeCloseTo(2662.4, 1);
    expect(t?.goalAdjustment).toBeCloseTo(-550, 6); // -0.5 kg/semana × 1100
    expect(t?.kcal).toBeCloseTo(2112.4, 1);
    expect(t?.protein_g).toBeCloseTo(160, 6); // 2.0 g/kg al bajar, por defecto
  });

  it('el preset cambia el reparto sin cambiar las kcal', () => {
    const balanced = previewTargets({ ...complete, macroPreset: 'balanced' }, TZ, TODAY);
    expect(balanced?.kcal).toBeCloseTo(2112.4, 1);
    expect(balanced?.protein_g).toBeCloseTo((2112.4 * 0.2) / 4, 1);
  });

  it('avisa si el piso corrige la meta', () => {
    const small: ProfileDraft = {
      ...complete,
      sex: 'female',
      birthDate: '1986-03-15',
      heightCm: 150,
      weightKg: 45,
      weeklyGoalKg: -1,
    };
    const t = previewTargets(small, TZ, TODAY);
    expect(t?.kcal).toBe(1200);
    expect(t?.warnings.map((w) => w.code)).toContain('below_kcal_floor');
  });

  it('devuelve null si no se puede calcular (datos incompletos o fuera de rango)', () => {
    expect(previewTargets(emptyDraft(), TZ, TODAY)).toBeNull();
    expect(previewTargets({ ...complete, birthDate: '2020-01-01' }, TZ, TODAY)).toBeNull();
    expect(previewTargets({ ...complete, heightCm: 5 }, TZ, TODAY)).toBeNull();
  });
});

describe('draftToInput', () => {
  it('manda el peso solo en el onboarding y recorta el nombre', () => {
    const withWeight = draftToInput(
      { ...complete, displayName: '  Ana ' },
      { includeWeight: true },
    );
    expect(withWeight).toMatchObject({
      displayName: 'Ana',
      weightKg: 80,
      macroPreset: 'high_protein',
    });
    expect(draftToInput(complete, { includeWeight: false })).not.toHaveProperty('weightKg');
  });

  it('los opcionales vacíos pasan como undefined', () => {
    const input = draftToInput(
      { ...complete, goal: 'maintain', weeklyGoalKg: null },
      { includeWeight: true },
    );
    expect(input.displayName).toBeUndefined();
    expect(input.targetWeightKg).toBeUndefined();
    expect(input.weeklyGoalKg).toBeUndefined();
  });
});

describe('firstInvalidStep', () => {
  it('devuelve el primer paso con error, en el orden del wizard', () => {
    expect(firstInvalidStep(emptyDraft(), TODAY)).toEqual({
      step: 'sex',
      message: 'Elegí una opción.',
    });
    expect(firstInvalidStep({ ...complete, birthDate: '2020-01-01' }, TODAY)?.step).toBe('birth');
    expect(firstInvalidStep({ ...complete, activityLevel: null }, TODAY)?.step).toBe('activity');
  });

  it('un borrador completo no tiene errores', () => {
    expect(firstInvalidStep(complete, TODAY)).toBeNull();
  });

  it('se puede limitar a algunos pasos (el editor no pide el peso)', () => {
    const noWeight = { ...complete, weightKg: null };
    expect(firstInvalidStep(noWeight, TODAY)?.step).toBe('body');
    expect(firstInvalidStep(noWeight, TODAY, ['sex', 'birth', 'activity'])).toBeNull();
  });
});

describe("macroPreset 'keep'", () => {
  it('no manda preset al servidor y no fija reparto en la vista previa', () => {
    const keep: ProfileDraft = { ...complete, macroPreset: 'keep' };
    expect(draftToInput(keep, { includeWeight: false }).macroPreset).toBeUndefined();
    expect(draftToProfile(keep, TZ)).not.toHaveProperty('macroSplit');
  });
});
