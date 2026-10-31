'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { reminderPayload } from './run';
import { es } from '@/lib/i18n/es';
import { createClient } from '@/lib/supabase/server';
import { createWebPushSender, vapidFromEnv } from './sender';
import { endpointInput, mealInput, reminderInput, subscriptionInput } from './schemas';

const e = es.reminders.errors;

type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function currentUserId(supabase: Supabase): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

const firstMessage = (error: { issues: { message: string }[] }) =>
  error.issues[0]?.message ?? e.generic;

/** Guarda (o actualiza) la suscripción de este dispositivo. */
export async function saveSubscription(raw: unknown): Promise<Result> {
  const parsed = subscriptionInput.safeParse(raw);
  if (!parsed.success) return fail(e.subscription);

  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) return fail(e.sessionExpired);

  const userAgent = ((await headers()).get('user-agent') ?? '').slice(0, 300);
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      user_agent: userAgent || null,
    },
    { onConflict: 'user_id,endpoint' },
  );
  if (error) return fail(e.generic);
  revalidatePath('/profile');
  return { ok: true };
}

/** Quita la suscripción de este dispositivo (después de cancelarla en el navegador). */
export async function removeSubscription(endpoint: unknown): Promise<Result> {
  const parsed = endpointInput.safeParse(endpoint);
  if (!parsed.success) return fail(e.subscription);

  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) return fail(e.sessionExpired);

  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('endpoint', parsed.data);
  if (error) return fail(e.generic);
  revalidatePath('/profile');
  return { ok: true };
}

/** Activa, desactiva o cambia la hora del recordatorio de una comida. */
export async function saveReminder(meal: unknown, input: unknown): Promise<Result> {
  const parsedMeal = mealInput.safeParse(meal);
  if (!parsedMeal.success) return fail(e.generic);
  const parsed = reminderInput.safeParse(input);
  if (!parsed.success) return fail(firstMessage(parsed.error));

  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) return fail(e.sessionExpired);

  const { error } = await supabase.from('reminder_settings').upsert(
    {
      user_id: userId,
      meal_type: parsedMeal.data,
      enabled: parsed.data.enabled,
      remind_at: parsed.data.remindAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,meal_type' },
  );
  if (error) return fail(e.generic);
  revalidatePath('/profile');
  return { ok: true };
}

/** Manda una notificación de prueba a los dispositivos del usuario. */
export async function sendTestNotification(): Promise<Result<{ delivered: number }>> {
  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) return fail(e.sessionExpired);

  const vapid = vapidFromEnv(process.env);
  if (!vapid) return fail(e.notConfigured);

  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId);
  if (error) return fail(e.generic);
  const subs = (data ?? []) as { endpoint: string; p256dh: string; auth: string }[];
  if (subs.length === 0) return fail(e.noDevice);

  const sender = createWebPushSender(vapid);
  const payload = {
    ...reminderPayload('lunch'),
    title: es.reminders.push.testTitle,
    body: es.reminders.push.testBody,
    url: '/profile',
    tag: 'test',
  };
  let delivered = 0;
  for (const sub of subs) {
    const result = await sender.send(sub, payload);
    if (result === 'sent') delivered += 1;
    else if (result === 'gone') {
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId)
        .eq('endpoint', sub.endpoint);
    }
  }
  if (delivered === 0) return fail(e.testFailed);
  return { ok: true, delivered };
}
