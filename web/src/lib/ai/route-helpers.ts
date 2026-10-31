import { NextResponse } from 'next/server';
import { todayInTimeZone } from '@/lib/nutrition';
import { createClient } from '@/lib/supabase/server';
import { AiError } from './types';
import { QuotaExceededError } from './service';

/** Códigos de error de la API de IA; el cliente los traduce a textos. */
export type AiApiError =
  | 'unauthorized'
  | 'invalid_request'
  | 'too_large'
  | 'unsupported_type'
  | 'quota_exceeded'
  | 'ai_not_configured'
  | 'ai_unavailable'
  | 'ai_timeout'
  | 'ai_bad_response'
  | 'image_rejected'
  /** El asistente de plan no pudo armar ninguna opción con alimentos de la base. */
  | 'no_options'
  | 'internal';

export function errorResponse(error: AiApiError, status: number, extra: object = {}) {
  return NextResponse.json({ error, ...extra }, { status });
}

const DEFAULT_TIMEZONE = 'America/Argentina/Cordoba';

/** Usuario de la sesión y su "hoy" (zona horaria del perfil), o la respuesta 401. */
export async function authorize(): Promise<
  { userId: string; day: string } | { response: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { response: errorResponse('unauthorized', 401) };

  const { data } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('user_id', user.id)
    .maybeSingle();
  const timezone =
    data && typeof (data as { timezone?: unknown }).timezone === 'string'
      ? (data as { timezone: string }).timezone
      : DEFAULT_TIMEZONE;
  let day: string;
  try {
    day = todayInTimeZone(timezone);
  } catch {
    day = todayInTimeZone(DEFAULT_TIMEZONE);
  }
  return { userId: user.id, day };
}

/** Traduce un error del servicio a la respuesta HTTP. El detalle técnico se registra, no se devuelve. */
export function responseForError(error: unknown, route: string): NextResponse {
  if (error instanceof QuotaExceededError) {
    return errorResponse('quota_exceeded', 429, { limit: error.limit });
  }
  if (error instanceof AiError) {
    // El mensaje trae el código HTTP del proveedor y la forma de la respuesta, nunca la clave ni lo que comió la persona.
    console.error(`${route}: ${error.code}: ${error.message}`);
    switch (error.code) {
      case 'not_configured':
        return errorResponse('ai_not_configured', 503);
      case 'timeout':
        return errorResponse('ai_timeout', 504);
      case 'bad_response':
        return errorResponse('ai_bad_response', 502);
      case 'image_rejected':
        return errorResponse('image_rejected', 422);
      case 'unauthorized':
        // La clave del proveedor es inválida: es un problema de configuración, no del usuario.
        return errorResponse('ai_unavailable', 503);
      default:
        return errorResponse('ai_unavailable', 503);
    }
  }
  console.error(`${route} falló`, error);
  return errorResponse('internal', 500);
}
