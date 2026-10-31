import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { runReminders } from '@/features/reminders/run';
import { createWebPushSender, vapidFromEnv } from '@/features/reminders/sender';
import { createAdminClient } from '@/lib/supabase/admin';

/** Compara en tiempo constante (el largo distinto ya revela poco: el secreto es largo y aleatorio). */
function validSecret(header: string | null, secret: string): boolean {
  const given = Buffer.from(header?.replace(/^Bearer\s+/i, '') ?? '');
  const wanted = Buffer.from(secret);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  // Sin secreto configurado el endpoint queda cerrado: nunca abierto por omisión.
  if (!secret) return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  if (!validSecret(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const vapid = vapidFromEnv(process.env);
  if (!vapid) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  try {
    const summary = await runReminders({
      admin: createAdminClient(),
      sender: createWebPushSender(vapid),
    });
    return NextResponse.json(summary);
  } catch (error) {
    console.error('cron/reminders falló', error);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}

/** Una tarea programada llama acá cada 10–15 minutos con `Authorization: Bearer $CRON_SECRET`. */
export const GET = handle;
export const POST = handle;
