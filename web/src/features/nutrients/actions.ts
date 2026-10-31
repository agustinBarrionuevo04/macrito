'use server';

import { revalidatePath } from 'next/cache';
import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import { formatNumber } from '@/lib/ui/number';
import { createClient } from '@/lib/supabase/server';
import { isValidKcalAdjustment } from './kcal-adjustment';
import {
  PROTEIN_G_PER_KG_RANGE,
  macroEditIssue,
  rowFromMacroEdit,
  type MacroEdit,
} from './macro-edit';

const m = es.nutrients.macros.errors;
const a = es.nutrients.adjustment.errors;

type Result = { ok: true } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function currentUserId(supabase: Supabase): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Lee y valida lo que mandó el cliente: nada de lo que no sea un número o un modo conocido pasa. */
function parseMacroEdit(raw: unknown): MacroEdit | null {
  const input = (raw ?? {}) as Record<string, unknown>;
  if (input.mode === 'default') return { mode: 'default' };
  if (input.mode === 'g_per_kg') {
    return isNumber(input.proteinGPerKg)
      ? { mode: 'g_per_kg', proteinGPerKg: input.proteinGPerKg }
      : null;
  }
  if (input.mode === 'percent') {
    return isNumber(input.carbs) && isNumber(input.fat) && isNumber(input.protein)
      ? { mode: 'percent', carbs: input.carbs, fat: input.fat, protein: input.protein }
      : null;
  }
  return null;
}

/** Guarda el reparto de macros (porcentajes, proteína por kilo o el de por defecto) en el perfil. */
export async function updateMacros(raw: unknown): Promise<Result> {
  const edit = parseMacroEdit(raw);
  if (!edit) return fail(m.not_number);
  const issue = macroEditIssue(edit);
  if (issue) {
    return fail(
      t(m[issue], {
        sum:
          edit.mode === 'percent'
            ? Math.round((edit.carbs + edit.fat + edit.protein) * 10) / 10
            : 0,
        min: formatNumber(PROTEIN_G_PER_KG_RANGE.min, 1),
        max: formatNumber(PROTEIN_G_PER_KG_RANGE.max, 1),
      }),
    );
  }

  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) return fail(m.sessionExpired);

  const { data, error } = await supabase
    .from('profiles')
    .update(rowFromMacroEdit(edit))
    .eq('user_id', userId)
    .select('user_id');
  if (error || !data?.length) return fail(m.generic);
  revalidatePath('/');
  revalidatePath('/profile');
  return { ok: true };
}

/** Guarda el ajuste manual de calorías (entero entre −1.000 y +1.000). */
export async function updateKcalAdjustment(value: unknown): Promise<Result> {
  if (!isValidKcalAdjustment(value)) return fail(a.invalid);

  const supabase = await createClient();
  const userId = await currentUserId(supabase);
  if (!userId) return fail(a.sessionExpired);

  const { data, error } = await supabase
    .from('profiles')
    .update({ kcal_adjustment: value })
    .eq('user_id', userId)
    .select('user_id');
  if (error || !data?.length) return fail(a.generic);
  revalidatePath('/');
  revalidatePath('/profile');
  return { ok: true };
}
