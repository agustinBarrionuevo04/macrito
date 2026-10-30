import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getPublicEnv, getServiceRoleKey } from './env';

/**
 * Cliente con service role: saltea RLS. Solo servidor y solo para tareas que lo requieren
 * (escribir el catálogo compartido, contar uso de IA). Nunca con datos de entrada sin validar.
 */
export function createAdminClient() {
  const { url } = getPublicEnv();
  return createSupabaseClient(url, getServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
