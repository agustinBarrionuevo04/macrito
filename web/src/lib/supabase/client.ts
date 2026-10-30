import { createBrowserClient } from '@supabase/ssr';
import { getPublicEnv } from './env';

/** Cliente para componentes de cliente. Usa la anon key y respeta RLS. */
export function createClient() {
  const { url, anonKey } = getPublicEnv();
  return createBrowserClient(url, anonKey);
}
