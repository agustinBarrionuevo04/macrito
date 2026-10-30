import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { createOffClient } from './off-client';
import { createSupabaseFoodStore } from './repository';
import { createFoodService } from './service';
import { createUsdaClient } from './usda-client';

const DEFAULT_USER_AGENT = 'Macritos/0.1 (uso personal)';

/** Arma el servicio de alimentos de la request actual con las credenciales del entorno. */
export async function getFoodService() {
  const usdaKey = process.env.USDA_API_KEY;
  return createFoodService({
    store: createSupabaseFoodStore({ user: await createClient(), admin: createAdminClient() }),
    off: createOffClient({ userAgent: process.env.FOODS_USER_AGENT ?? DEFAULT_USER_AGENT }),
    usda: usdaKey ? createUsdaClient({ apiKey: usdaKey }) : null,
  });
}
