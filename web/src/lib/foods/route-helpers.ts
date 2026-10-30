import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createRateLimiter, type RateLimiter } from './rate-limit';

/** Códigos de error de la API; el cliente los traduce a textos. */
export type FoodsApiError =
  | 'unauthorized'
  | 'rate_limited'
  | 'invalid_query'
  | 'invalid_barcode'
  | 'sources_unavailable'
  | 'internal';

export function errorResponse(error: FoodsApiError, status: number, headers?: HeadersInit) {
  return NextResponse.json({ error }, { status, headers });
}

/** 30 pedidos por minuto y usuario para cada endpoint. */
export const searchLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 });
export const barcodeLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

/** Exige sesión y aplica el límite. Devuelve el id del usuario o la respuesta de error. */
export async function authorize(
  limiter: RateLimiter,
): Promise<{ userId: string } | { response: NextResponse }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { response: errorResponse('unauthorized', 401) };

  const limit = limiter.check(user.id);
  if (!limit.allowed) {
    return {
      response: errorResponse('rate_limited', 429, {
        'Retry-After': String(limit.retryAfterSeconds),
      }),
    };
  }
  return { userId: user.id };
}
