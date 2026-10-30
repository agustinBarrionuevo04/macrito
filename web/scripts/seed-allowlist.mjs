// Carga ALLOWED_EMAILS (separados por coma) en public.allowed_emails.
// Uso: node --env-file=.env.local scripts/seed-allowlist.mjs
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const emails = [
  ...new Set(
    (process.env.ALLOWED_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  ),
];
if (emails.length === 0) {
  console.error('ALLOWED_EMAILS está vacío.');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
const { error } = await supabase.from('allowed_emails').upsert(
  emails.map((email) => ({ email })),
  { onConflict: 'email' },
);
if (error) {
  console.error(`No se pudo cargar la allowlist: ${error.message}`);
  process.exit(1);
}
console.log(`Allowlist actualizada: ${emails.join(', ')}`);
