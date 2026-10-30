import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { ENTRY_COLUMNS, entryFromRow, entryRowSchema } from './mapping';
import type { DiaryEntry } from './types';

/** Entradas del día `day` del usuario de la sesión, en el orden en que se cargaron. */
export async function getDayEntries(userId: string, day: string): Promise<DiaryEntry[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('intake_entries')
    .select(ENTRY_COLUMNS)
    .eq('user_id', userId)
    .eq('logged_on', day)
    .order('created_at', { ascending: true });
  if (error || !data) return null;
  return data.flatMap((row) => {
    const parsed = entryRowSchema.safeParse(row);
    return parsed.success ? [entryFromRow(parsed.data)] : [];
  });
}
