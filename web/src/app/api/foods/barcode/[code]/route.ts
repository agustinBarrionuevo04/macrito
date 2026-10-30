import { NextResponse, type NextRequest } from 'next/server';
import { normalizeBarcode } from '@/lib/foods/barcode';
import { authorize, barcodeLimiter, errorResponse } from '@/lib/foods/route-helpers';
import { getFoodService } from '@/lib/foods/server';
import { FoodSourceError } from '@/lib/foods/types';

/** GET /api/foods/barcode/:code → `Food | null` (null si el producto no existe o está incompleto). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const auth = await authorize(barcodeLimiter);
  if ('response' in auth) return auth.response;

  const barcode = normalizeBarcode((await params).code);
  if (!barcode) return errorResponse('invalid_barcode', 400);

  try {
    return NextResponse.json(await (await getFoodService()).barcode(barcode));
  } catch (error) {
    if (error instanceof FoodSourceError) return errorResponse('sources_unavailable', 503);
    console.error('foods/barcode falló', error);
    return errorResponse('internal', 500);
  }
}
