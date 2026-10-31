import { REMINDER_WINDOW_MINUTES } from './constants';
import { parseTime, type LocalMoment } from './time';

export type ReminderSetting = {
  enabled: boolean;
  /** Hora local, `HH:MM` o `HH:MM:SS`. */
  remindAt: string;
  lastSentOn: string | null;
};

/**
 * ¿Toca avisar? Sí si está activo, ya pasó la hora local pero dentro de la ventana, y hoy (local) todavía no se
 * resolvió. Una hora ilegible nunca está "vencida".
 */
export function isDue(
  setting: ReminderSetting,
  now: LocalMoment,
  windowMinutes: number = REMINDER_WINDOW_MINUTES,
): boolean {
  if (!setting.enabled || setting.lastSentOn === now.date) return false;
  const at = parseTime(setting.remindAt);
  if (at === null) return false;
  const elapsed = now.minutes - at;
  return elapsed >= 0 && elapsed < windowMinutes;
}
