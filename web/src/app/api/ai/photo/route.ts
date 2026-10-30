import { NextResponse, type NextRequest } from 'next/server';
import { stripJpegMetadata } from '@/lib/ai/jpeg';
import { authorize, errorResponse, responseForError } from '@/lib/ai/route-helpers';
import { getAiService } from '@/lib/ai/server';

/** Tamaño máximo de la imagen. El cliente la reduce a ~1024 px antes de subirla. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/**
 * POST /api/ai/photo (multipart, campo `image`) → `{ items: PhotoItem[] }`.
 * La imagen no se guarda en ningún lado: se le quitan los metadatos (EXIF) y se manda al modelo.
 */
export async function POST(request: NextRequest) {
  const auth = await authorize();
  if ('response' in auth) return auth.response;

  // Se rechaza por el encabezado antes de leer el cuerpo (un pedido gigante no se carga en memoria).
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES + 64 * 1024) {
    return errorResponse('too_large', 413);
  }

  let image: FormDataEntryValue | null;
  try {
    image = (await request.formData()).get('image');
  } catch {
    return errorResponse('invalid_request', 400);
  }
  if (!(image instanceof File)) return errorResponse('invalid_request', 400);
  if (image.size > MAX_IMAGE_BYTES) return errorResponse('too_large', 413);

  // Se mira el contenido y no el tipo que declara el cliente.
  const clean = stripJpegMetadata(new Uint8Array(await image.arrayBuffer()));
  if (!clean) return errorResponse('unsupported_type', 415);

  try {
    const items = await getAiService().analyzePhoto(auth.userId, auth.day, clean, request.signal);
    return NextResponse.json({ items });
  } catch (error) {
    return responseForError(error, 'ai/photo');
  }
}
