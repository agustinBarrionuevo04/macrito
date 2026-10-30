import { describe, expect, it } from 'vitest';
import { createProfileInputSchema, weightInputSchema } from './schema';

const TODAY = '2026-03-15';
const schema = createProfileInputSchema(TODAY);

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

const messages = (input: unknown) => {
  const result = schema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
};

describe('createProfileInputSchema', () => {
  it('acepta un perfil completo', () => {
    expect(schema.safeParse(valid).success).toBe(true);
  });

  it('el nombre, el peso objetivo y el preset son opcionales; "" y null cuentan como ausentes', () => {
    const result = schema.parse({
      ...valid,
      displayName: '  ',
      targetWeightKg: null,
      weeklyGoalKg: -0.25,
      macroPreset: undefined,
    });
    expect(result.displayName).toBeUndefined();
    expect(result.targetWeightKg).toBeUndefined();
  });

  it('recorta el nombre y limita su largo', () => {
    expect(schema.parse({ ...valid, displayName: '  Ana  ' }).displayName).toBe('Ana');
    expect(messages({ ...valid, displayName: 'x'.repeat(61) })).toEqual([
      'displayName: El nombre puede tener hasta 60 caracteres.',
    ]);
  });

  it('mantener no lleva ritmo; con null o sin campo es válido', () => {
    expect(
      schema.safeParse({
        ...valid,
        goal: 'maintain',
        weeklyGoalKg: null,
        targetWeightKg: undefined,
      }).success,
    ).toBe(true);
    expect(
      messages({ ...valid, goal: 'maintain', weeklyGoalKg: -0.5, targetWeightKg: undefined }),
    ).toEqual(['weeklyGoalKg: Elegí un ritmo.']);
  });

  it('el ritmo tiene que ser uno de los ofrecidos para el objetivo', () => {
    expect(messages({ ...valid, weeklyGoalKg: -0.4 })).toContain('weeklyGoalKg: Elegí un ritmo.');
    expect(messages({ ...valid, goal: 'gain', weeklyGoalKg: -0.5, targetWeightKg: 70 })).toContain(
      'weeklyGoalKg: Elegí un ritmo.',
    );
    expect(messages({ ...valid, weeklyGoalKg: undefined })).toContain(
      'weeklyGoalKg: Elegí un ritmo.',
    );
  });

  it('valida la edad con la fecha que se le pasa, no con el reloj', () => {
    expect(messages({ ...valid, birthDate: '2013-03-16' })).toEqual([
      'birthDate: Macritos es para mayores de 13 años.',
    ]);
    expect(
      createProfileInputSchema('2026-03-16').safeParse({ ...valid, birthDate: '2013-03-16' })
        .success,
    ).toBe(true);
    expect(messages({ ...valid, birthDate: '2026-02-30' })).toEqual([
      'birthDate: La fecha no es válida.',
    ]);
  });

  it('valida rangos de altura y peso', () => {
    expect(messages({ ...valid, heightCm: 90 })).toEqual([
      'heightCm: Ingresá una altura entre 100 y 250 cm.',
    ]);
    expect(messages({ ...valid, weightKg: 500 })).toEqual([
      'weightKg: Ingresá un peso entre 25 y 400 kg.',
    ]);
  });

  it('el peso objetivo tiene que estar del lado correcto del peso actual', () => {
    expect(messages({ ...valid, targetWeightKg: 70 })).toEqual([
      'targetWeightKg: Para bajar de peso, el peso objetivo tiene que ser menor que el actual.',
    ]);
  });

  it('sin weightKg (edición del perfil) no exige ni compara el peso', () => {
    const { weightKg: _omit, ...withoutWeight } = valid;
    expect(schema.safeParse(withoutWeight).success).toBe(true);
  });

  it('rechaza valores inexistentes y tipos incorrectos con mensajes en español', () => {
    expect(messages({ ...valid, sex: 'x' })).toContain('sex: Elegí una opción.');
    expect(messages({ ...valid, activityLevel: 'x' })).toContain(
      'activityLevel: Elegí tu nivel de actividad.',
    );
    expect(messages({ ...valid, goal: 'x' })).toContain('goal: Elegí tu objetivo.');
    expect(schema.safeParse({ ...valid, heightCm: '165' }).success).toBe(false);
    expect(schema.safeParse({ ...valid, heightCm: Number.NaN }).success).toBe(false);
    expect(schema.safeParse({ ...valid, macroPreset: 'keto' }).success).toBe(false);
    expect(schema.safeParse(null).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
  });

  it('ignora campos de más (no deja pasar columnas arbitrarias)', () => {
    const parsed = schema.parse({
      ...valid,
      user_id: 'otro',
      kcalAdjustment: 9999,
      onboarding_completed_at: 'x',
    });
    expect(parsed).not.toHaveProperty('user_id');
    expect(parsed).not.toHaveProperty('kcalAdjustment');
    expect(parsed).not.toHaveProperty('onboarding_completed_at');
  });
});

describe('weightInputSchema', () => {
  it('acepta pesos en rango', () => {
    expect(weightInputSchema.safeParse({ weightKg: 62.5 }).success).toBe(true);
    expect(weightInputSchema.safeParse({ weightKg: 25 }).success).toBe(true);
  });

  it('rechaza fuera de rango, texto y NaN', () => {
    expect(weightInputSchema.safeParse({ weightKg: 24 }).success).toBe(false);
    expect(weightInputSchema.safeParse({ weightKg: 401 }).success).toBe(false);
    expect(weightInputSchema.safeParse({ weightKg: '70' }).success).toBe(false);
    expect(weightInputSchema.safeParse({ weightKg: Number.NaN }).success).toBe(false);
    expect(weightInputSchema.safeParse({}).success).toBe(false);
  });
});
