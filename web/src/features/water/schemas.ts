import { z } from 'zod';
import { dayInput } from '@/features/diary/schemas';
import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import { MAX_WATER_PER_LOG_ML, WATER_GOAL_MAX_ML, WATER_GOAL_MIN_ML } from './goal';

const e = es.water.errors;

export { dayInput };

export const amountSchema = z
  .number(t(e.amount, { max: MAX_WATER_PER_LOG_ML }))
  .int(t(e.amount, { max: MAX_WATER_PER_LOG_ML }))
  .min(1, t(e.amount, { max: MAX_WATER_PER_LOG_ML }))
  .max(MAX_WATER_PER_LOG_ML, t(e.amount, { max: MAX_WATER_PER_LOG_ML }));

/** `null` = volver a la meta sugerida. */
export const goalSchema = z
  .number(t(e.goal, { min: WATER_GOAL_MIN_ML, max: WATER_GOAL_MAX_ML }))
  .int(t(e.goal, { min: WATER_GOAL_MIN_ML, max: WATER_GOAL_MAX_ML }))
  .min(WATER_GOAL_MIN_ML, t(e.goal, { min: WATER_GOAL_MIN_ML, max: WATER_GOAL_MAX_ML }))
  .max(WATER_GOAL_MAX_ML, t(e.goal, { min: WATER_GOAL_MIN_ML, max: WATER_GOAL_MAX_ML }))
  .nullable();
