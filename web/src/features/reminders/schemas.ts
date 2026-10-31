import { z } from 'zod';
import { mealInput } from '@/features/diary/schemas';
import { es } from '@/lib/i18n/es';
import { normalizeTime } from './time';

const e = es.reminders.errors;

export { mealInput };

/** `HH:MM` en 24 h; se normaliza (acepta `HH:MM:SS`). */
export const timeInput = z.string(e.time).transform((value, ctx) => {
  const normalized = normalizeTime(value);
  if (normalized === null) {
    ctx.addIssue({ code: 'custom', message: e.time });
    return z.NEVER;
  }
  return normalized;
});

export const reminderInput = z.object({
  enabled: z.boolean(e.generic),
  remindAt: timeInput,
});

/** Lo que devuelve `PushSubscription.toJSON()`. */
export const subscriptionInput = z.object({
  endpoint: z
    .url(e.subscription)
    .refine((url) => url.startsWith('https://'), e.subscription)
    .max(2048, e.subscription),
  keys: z.object({
    p256dh: z.string(e.subscription).min(1).max(512),
    auth: z.string(e.subscription).min(1).max(512),
  }),
});

export const endpointInput = z.url(e.subscription).max(2048, e.subscription);
