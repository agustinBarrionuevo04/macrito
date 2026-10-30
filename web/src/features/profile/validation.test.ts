import { describe, expect, it } from 'vitest';
import {
  activityIssue,
  birthDateIssue,
  goalIssue,
  heightIssue,
  paceIssue,
  sexIssue,
  targetWeightIssue,
  weightIssue,
} from './validation';

const TODAY = '2026-03-15';

describe('sexIssue / activityIssue / goalIssue', () => {
  it('exigen una opción válida', () => {
    expect(sexIssue('male')).toBeNull();
    expect(sexIssue('female')).toBeNull();
    expect(sexIssue(null)).toBe('Elegí una opción.');
    expect(sexIssue('otro' as never)).not.toBeNull();
    expect(activityIssue('very_active')).toBeNull();
    expect(activityIssue(null)).not.toBeNull();
    expect(goalIssue('gain')).toBeNull();
    expect(goalIssue(undefined)).not.toBeNull();
  });
});

describe('birthDateIssue', () => {
  it('acepta de 13 a 130 años y rechaza el resto', () => {
    expect(birthDateIssue('1996-03-15', TODAY)).toBeNull();
    expect(birthDateIssue('2013-03-15', TODAY)).toBeNull(); // justo 13
    expect(birthDateIssue('2013-03-16', TODAY)).toBe('Macritos es para mayores de 13 años.');
    expect(birthDateIssue('1896-03-15', TODAY)).toBeNull(); // justo 130
    expect(birthDateIssue('1895-03-15', TODAY)).toBe('La fecha no es válida.'); // 131: no es un error de "menor de 13"
  });

  it('distingue vacío, inexistente y futura', () => {
    expect(birthDateIssue('', TODAY)).toBe('Ingresá tu fecha de nacimiento.');
    expect(birthDateIssue(null, TODAY)).toBe('Ingresá tu fecha de nacimiento.');
    expect(birthDateIssue('2026-02-30', TODAY)).toBe('La fecha no es válida.');
    expect(birthDateIssue('15/03/1996', TODAY)).toBe('La fecha no es válida.');
    expect(birthDateIssue('2030-01-01', TODAY)).toBe('La fecha no es válida.');
  });
});

describe('heightIssue / weightIssue', () => {
  it('aceptan los límites y rechazan fuera de rango, NaN y null', () => {
    expect(heightIssue(100)).toBeNull();
    expect(heightIssue(250)).toBeNull();
    expect(heightIssue(99)).toBe('Ingresá una altura entre 100 y 250 cm.');
    expect(heightIssue(251)).not.toBeNull();
    expect(heightIssue(Number.NaN)).not.toBeNull();
    expect(heightIssue(null)).not.toBeNull();
    expect(weightIssue(25)).toBeNull();
    expect(weightIssue(400)).toBeNull();
    expect(weightIssue(24.9)).toBe('Ingresá un peso entre 25 y 400 kg.');
    expect(weightIssue(401)).not.toBeNull();
    expect(weightIssue(undefined)).not.toBeNull();
  });
});

describe('paceIssue', () => {
  it('bajar y subir exigen uno de los ritmos ofrecidos', () => {
    expect(paceIssue('lose', -0.5)).toBeNull();
    expect(paceIssue('lose', -1)).toBeNull();
    expect(paceIssue('gain', 0.25)).toBeNull();
    expect(paceIssue('gain', 0.5)).toBeNull();
    expect(paceIssue('lose', null)).not.toBeNull();
    expect(paceIssue('lose', -0.4)).not.toBeNull();
    expect(paceIssue('lose', 0.5)).not.toBeNull(); // sube pero el objetivo es bajar
    expect(paceIssue('gain', -0.5)).not.toBeNull();
    expect(paceIssue('gain', 1)).not.toBeNull(); // no es un ritmo ofrecido para subir
  });

  it('mantener no lleva ritmo', () => {
    expect(paceIssue('maintain', null)).toBeNull();
    expect(paceIssue('maintain', undefined)).toBeNull();
    expect(paceIssue('maintain', 0.25)).not.toBeNull();
    expect(paceIssue('maintain', 0)).not.toBeNull();
  });

  it('sin objetivo todavía no opina (lo marca goalIssue)', () => {
    expect(paceIssue(null, null)).toBeNull();
  });
});

describe('targetWeightIssue', () => {
  it('es opcional', () => {
    expect(targetWeightIssue('lose', 80, null)).toBeNull();
    expect(targetWeightIssue('lose', 80, undefined)).toBeNull();
  });

  it('bajar: menor que el actual; subir: mayor; mantener: cualquiera válido', () => {
    expect(targetWeightIssue('lose', 80, 70)).toBeNull();
    expect(targetWeightIssue('lose', 80, 80)).toBe(
      'Para bajar de peso, el peso objetivo tiene que ser menor que el actual.',
    );
    expect(targetWeightIssue('lose', 80, 85)).not.toBeNull();
    expect(targetWeightIssue('gain', 60, 65)).toBeNull();
    expect(targetWeightIssue('gain', 60, 60)).toBe(
      'Para subir de peso, el peso objetivo tiene que ser mayor que el actual.',
    );
    expect(targetWeightIssue('maintain', 70, 68)).toBeNull();
    expect(targetWeightIssue('maintain', 70, 72)).toBeNull();
  });

  it('valida el rango aunque no se conozca el peso actual', () => {
    expect(targetWeightIssue('lose', null, 10)).toBe(
      'Ingresá un peso entre 25 y 400 kg, o dejalo vacío.',
    );
    expect(targetWeightIssue('lose', null, 70)).toBeNull();
    expect(targetWeightIssue('lose', 80, Number.NaN)).not.toBeNull();
  });
});
