import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './rate-limit';

describe('createRateLimiter', () => {
  it('permite hasta el límite y bloquea el siguiente, con el tiempo de espera', () => {
    let now = 1_000;
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: () => now });

    expect(limiter.check('a')).toEqual({ allowed: true });
    now += 10_000;
    expect(limiter.check('a')).toEqual({ allowed: true });
    now += 10_000;
    expect(limiter.check('a')).toEqual({ allowed: true });
    now += 10_000;
    // El pedido más viejo (t = 1000) sale de la ventana en t = 61000; ahora es t = 31000.
    expect(limiter.check('a')).toEqual({ allowed: false, retryAfterSeconds: 30 });
  });

  it('libera cupo cuando los pedidos salen de la ventana', () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 1_000, now: () => now });
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(false);
    now = 1_000;
    expect(limiter.check('a').allowed).toBe(true);
  });

  it('cuenta cada clave por separado', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => 0 });
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('b').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(false);
  });

  it('espera al menos 1 segundo aunque falte menos', () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 1_000, now: () => now });
    limiter.check('a');
    now = 999;
    expect(limiter.check('a')).toEqual({ allowed: false, retryAfterSeconds: 1 });
  });

  it('descarta claves viejas para no crecer sin límite', () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 1_000, now: () => now });
    for (let i = 0; i < 1_001; i += 1) limiter.check(`u${i}`);
    now = 5_000;
    // Una clave nueva dispara la limpieza; las 1001 anteriores ya vencieron.
    expect(limiter.check('nueva').allowed).toBe(true);
    expect(limiter.check('u0').allowed).toBe(true);
  });
});
