import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { authorize, errorResponse, responseForError } from '@/lib/ai/route-helpers';
import { getAiService } from '@/lib/ai/server';

export const MAX_TEXT_LENGTH = 500;

const bodySchema = z.object({ text: z.string().trim().min(2).max(MAX_TEXT_LENGTH) });

/** POST /api/ai/text ({ text }) → `{ items: PhotoItem[] }`. Ej.: "2 milanesas con puré y una coca". */
export async function POST(request: NextRequest) {
  const auth = await authorize();
  if ('response' in auth) return auth.response;

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return errorResponse('invalid_request', 400);

  try {
    const items = await getAiService().analyzeText(
      auth.userId,
      auth.day,
      body.data.text,
      request.signal,
    );
    return NextResponse.json({ items });
  } catch (error) {
    return responseForError(error, 'ai/text');
  }
}
