export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export type RateLimiter = { check(key: string): RateLimitResult };

const MAX_TRACKED_KEYS = 1000;

/**
 * Ventana deslizante en memoria, por clave (id de usuario). Es por instancia del servidor: en
 * serverless cada instancia lleva su propia cuenta, así que frena abusos y bucles del cliente pero
 * no es un límite global exacto.
 */
export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
  now?: () => number;
}): RateLimiter {
  const { limit, windowMs, now = Date.now } = options;
  const hits = new Map<string, number[]>();

  return {
    check(key) {
      const current = now();
      const recent = (hits.get(key) ?? []).filter((t) => current - t < windowMs);

      if (recent.length >= limit) {
        hits.set(key, recent);
        const oldest = recent[0] ?? current;
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - current) / 1000)),
        };
      }

      recent.push(current);
      hits.set(key, recent);

      if (hits.size > MAX_TRACKED_KEYS) {
        for (const [k, times] of hits) {
          if (times.every((t) => current - t >= windowMs)) hits.delete(k);
        }
      }
      return { allowed: true };
    },
  };
}
