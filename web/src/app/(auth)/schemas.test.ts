import { describe, expect, it } from 'vitest';
import {
  forgotPasswordSchema,
  registerSchema,
  resetPasswordSchema,
  safeNextPath,
  signInSchema,
} from './schemas';

describe('signInSchema', () => {
  it('normaliza el email', () => {
    const r = signInSchema.parse({ email: '  Ana@Test.COM ', password: 'x' });
    expect(r.email).toBe('ana@test.com');
  });

  it('rechaza email inválido y contraseña vacía', () => {
    expect(signInSchema.safeParse({ email: 'ana', password: 'x' }).success).toBe(false);
    expect(signInSchema.safeParse({ email: 'a@b.com', password: '' }).success).toBe(false);
  });
});

describe('registerSchema', () => {
  const base = { email: 'a@b.com', password: '12345678', confirmPassword: '12345678' };

  it('acepta datos válidos', () => {
    expect(registerSchema.safeParse(base).success).toBe(true);
  });

  it('exige 8 caracteres como mínimo', () => {
    const r = registerSchema.safeParse({
      ...base,
      password: '1234567',
      confirmPassword: '1234567',
    });
    expect(r.success).toBe(false);
  });

  it('acepta exactamente 8 y 72 caracteres, y rechaza 73', () => {
    const ok = (n: number) => 'a'.repeat(n);
    expect(
      registerSchema.safeParse({ ...base, password: ok(8), confirmPassword: ok(8) }).success,
    ).toBe(true);
    expect(
      registerSchema.safeParse({ ...base, password: ok(72), confirmPassword: ok(72) }).success,
    ).toBe(true);
    expect(
      registerSchema.safeParse({ ...base, password: ok(73), confirmPassword: ok(73) }).success,
    ).toBe(false);
  });

  it('exige que las contraseñas coincidan', () => {
    const r = registerSchema.safeParse({ ...base, confirmPassword: 'otra-clave' });
    expect(r.success).toBe(false);
  });
});

describe('forgotPasswordSchema y resetPasswordSchema', () => {
  it('valida el email', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'x' }).success).toBe(false);
    expect(forgotPasswordSchema.safeParse({ email: 'x@y.com' }).success).toBe(true);
  });

  it('valida contraseña nueva y confirmación', () => {
    expect(
      resetPasswordSchema.safeParse({ password: '12345678', confirmPassword: '12345678' }).success,
    ).toBe(true);
    expect(
      resetPasswordSchema.safeParse({ password: '12345678', confirmPassword: '123456789' }).success,
    ).toBe(false);
  });
});

describe('safeNextPath', () => {
  it('deja pasar rutas internas', () => {
    expect(safeNextPath('/reset-password')).toBe('/reset-password');
    expect(safeNextPath('/profile?x=1')).toBe('/profile?x=1');
  });

  it.each([null, undefined, '', 'https://evil.com', '//evil.com', '/\\evil.com', 'evil'])(
    'rechaza %s',
    (value) => {
      expect(safeNextPath(value)).toBe('/');
    },
  );
});
