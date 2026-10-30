import { describe, expect, it } from 'vitest';
import { es } from './es';

describe('es', () => {
  it('define el nombre de la app', () => {
    expect(es.app.name).toBe('Macritos');
  });
});
