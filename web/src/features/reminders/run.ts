import type { SupabaseClient } from '@supabase/supabase-js';
import { es } from '@/lib/i18n/es';
import type { PushPayload } from '@/lib/pwa/push';
import type { MealType } from '@/types';
import { isDue } from './due';
import { localMoment, type LocalMoment } from './time';

const DEFAULT_TIMEZONE = 'America/Argentina/Cordoba';

export type StoredSubscription = { endpoint: string; p256dh: string; auth: string };

/** `gone` = el navegador ya no acepta esa suscripción (desinstalada o permiso revocado): se borra. */
export type SendResult = 'sent' | 'gone' | 'failed';

export type PushSender = {
  send(subscription: StoredSubscription, payload: PushPayload): Promise<SendResult>;
};

export type RunSummary = {
  /** Recordatorios activos revisados. */
  considered: number;
  /** Recordatorios que ya tocaba enviar (dentro de la ventana y no resueltos hoy). */
  due: number;
  /** De esos, los que no se enviaron porque la comida ya estaba cargada. */
  alreadyLogged: number;
  /** Notificaciones entregadas al servicio push. */
  sent: number;
  failed: number;
  /** Suscripciones inválidas que se borraron. */
  removed: number;
};

type SettingRow = {
  user_id: string;
  meal_type: MealType;
  remind_at: string;
  last_sent_on: string | null;
};

export function reminderPayload(meal: MealType): PushPayload {
  return {
    title: es.reminders.push.titles[meal],
    body: es.reminders.push.body,
    url: `/add?meal=${meal}`,
    tag: `meal-${meal}`,
  };
}

/**
 * Envía los recordatorios que tocan ahora. Pensada para una tarea programada que corra cada 10–15 minutos.
 * - La hora es la LOCAL de cada usuario (su zona horaria del perfil).
 * - No avisa si esa comida ya tiene algo cargado hoy.
 * - Cada recordatorio se resuelve una vez por día; si todos los envíos fallan por un error pasajero, se
 *   reintenta en la próxima corrida mientras siga dentro de la ventana.
 * `admin` es el cliente con service role: sin RLS, solo servidor.
 */
export async function runReminders(deps: {
  admin: SupabaseClient;
  sender: PushSender;
  now?: Date;
}): Promise<RunSummary> {
  const { admin, sender } = deps;
  const now = deps.now ?? new Date();
  const summary: RunSummary = {
    considered: 0,
    due: 0,
    alreadyLogged: 0,
    sent: 0,
    failed: 0,
    removed: 0,
  };

  const { data: settingRows, error } = await admin
    .from('reminder_settings')
    .select('user_id, meal_type, remind_at, last_sent_on')
    .eq('enabled', true);
  if (error) throw new Error(`no se pudieron leer los recordatorios: ${error.message}`);
  const settings = (settingRows ?? []) as SettingRow[];
  summary.considered = settings.length;
  if (settings.length === 0) return summary;

  const userIds = [...new Set(settings.map((row) => row.user_id))];
  const [profiles, subscriptions] = await Promise.all([
    admin.from('profiles').select('user_id, timezone').in('user_id', userIds),
    admin
      .from('push_subscriptions')
      .select('user_id, endpoint, p256dh, auth')
      .in('user_id', userIds),
  ]);
  if (profiles.error || subscriptions.error)
    throw new Error('no se pudieron leer los perfiles o las suscripciones');

  const zones = new Map<string, string>();
  for (const row of (profiles.data ?? []) as { user_id: string; timezone: string | null }[]) {
    zones.set(row.user_id, row.timezone ?? DEFAULT_TIMEZONE);
  }
  const subsByUser = new Map<string, StoredSubscription[]>();
  for (const row of (subscriptions.data ?? []) as (StoredSubscription & { user_id: string })[]) {
    const list = subsByUser.get(row.user_id) ?? [];
    list.push({ endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth });
    subsByUser.set(row.user_id, list);
  }

  // Qué recordatorios tocan ahora, con el momento local de cada usuario.
  const momentOf = (userId: string): LocalMoment => {
    try {
      return localMoment(now, zones.get(userId) ?? DEFAULT_TIMEZONE);
    } catch {
      return localMoment(now, DEFAULT_TIMEZONE);
    }
  };
  const due = settings.flatMap((row) => {
    const moment = momentOf(row.user_id);
    return isDue({ enabled: true, remindAt: row.remind_at, lastSentOn: row.last_sent_on }, moment)
      ? [{ row, date: moment.date }]
      : [];
  });
  summary.due = due.length;
  if (due.length === 0) return summary;

  // Comidas que ya tienen algo cargado en el día local de cada usuario.
  const dueUsers = [...new Set(due.map(({ row }) => row.user_id))];
  const dueDates = [...new Set(due.map(({ date }) => date))];
  const logged = await admin
    .from('intake_entries')
    .select('user_id, logged_on, meal_type')
    .in('user_id', dueUsers)
    .in('logged_on', dueDates);
  if (logged.error) throw new Error('no se pudo leer el diario');
  const loggedKeys = new Set(
    ((logged.data ?? []) as { user_id: string; logged_on: string; meal_type: string }[]).map(
      (entry) => `${entry.user_id}|${entry.logged_on}|${entry.meal_type}`,
    ),
  );

  const markResolved = async (userId: string, meal: MealType, date: string) => {
    await admin
      .from('reminder_settings')
      .update({ last_sent_on: date })
      .eq('user_id', userId)
      .eq('meal_type', meal);
  };

  for (const { row, date } of due) {
    if (loggedKeys.has(`${row.user_id}|${date}|${row.meal_type}`)) {
      summary.alreadyLogged += 1;
      await markResolved(row.user_id, row.meal_type, date);
      continue;
    }
    const subs = subsByUser.get(row.user_id) ?? [];
    // Sin dispositivos no hay a quién avisar; no se marca para que, si activa uno, todavía llegue a tiempo.
    if (subs.length === 0) continue;

    const payload = reminderPayload(row.meal_type);
    let delivered = 0;
    let transient = 0;
    for (const sub of subs) {
      const result = await sender.send(sub, payload);
      if (result === 'sent') {
        delivered += 1;
        summary.sent += 1;
      } else if (result === 'gone') {
        summary.removed += 1;
        await admin
          .from('push_subscriptions')
          .delete()
          .eq('user_id', row.user_id)
          .eq('endpoint', sub.endpoint);
      } else {
        transient += 1;
        summary.failed += 1;
      }
    }
    // Se resuelve si llegó a algún dispositivo o si todos eran inválidos; con un fallo pasajero se reintenta.
    if (delivered > 0 || transient === 0) await markResolved(row.user_id, row.meal_type, date);
  }
  return summary;
}
