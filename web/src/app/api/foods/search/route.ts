import { NextResponse, type NextRequest } from 'next/server';
import { searchQuerySchema } from '@/lib/foods/schemas';
import { authorize, errorResponse, searchLimiter } from '@/lib/foods/route-helpers';
import { getFoodService } from '@/lib/foods/server';
import { FoodSourceError } from '@/lib/foods/types';

/** GET /api/foods/search?q=… → `Food[]`. Header `X-Foods-Degraded: 1` si una fuente externa falló. */
export async function GET(request: NextRequest) {
  const auth = await authorize(searchLimiter);
  if ('response' in auth) return auth.response;

  const query = searchQuerySchema.safeParse(request.nextUrl.searchParams.get('q'));
  if (!query.success) return errorResponse('invalid_query', 400);

  try {
    const { foods, degraded } = await (await getFoodService()).search(query.data);
    return NextResponse.json(foods, {
      headers: degraded ? { 'X-Foods-Degraded': '1' } : undefined,
    });
  } catch (error) {
    if (error instanceof FoodSourceError) return errorResponse('sources_unavailable', 503);
    console.error('foods/search falló', error);
    return errorResponse('internal', 500);
  }
}
