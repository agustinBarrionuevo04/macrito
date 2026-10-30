import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { createProviderFromEnv, limitsFrom } from './config';
import { createAiService } from './service';
import { createUsageTracker } from './usage';

/** Servicio de IA de la request actual, con la configuración del entorno. Lanza `not_configured` si falta la clave. */
export function getAiService() {
  return createAiService({
    provider: createProviderFromEnv(process.env),
    usage: createUsageTracker(createAdminClient()),
    limits: limitsFrom(process.env),
    ...(process.env.AI_DEBUG === '1'
      ? { debug: (message: string) => console.error('[ai]', message) }
      : {}),
  });
}
