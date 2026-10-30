import { z } from 'zod';

const publicEnvSchema = z.object({
  url: z.url(),
  anonKey: z.string().min(1),
});

const serviceRoleSchema = z.string().min(1);

export type SupabasePublicEnv = z.infer<typeof publicEnvSchema>;

/** Variables públicas. Se leen una por una para que Next las inyecte en el bundle del cliente. */
export function getPublicEnv(): SupabasePublicEnv {
  const parsed = publicEnvSchema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!parsed.success) {
    throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  return parsed.data;
}

/** Solo servidor. */
export function getServiceRoleKey(): string {
  const parsed = serviceRoleSchema.safeParse(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!parsed.success) {
    throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY');
  }
  return parsed.data;
}
