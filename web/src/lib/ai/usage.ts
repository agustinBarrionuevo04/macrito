import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiUsage } from './types';

export type UsageKind = 'photo' | 'text';

/**
 * Límite diario por usuario y tipo. Lo maneja el servidor con service_role: el cliente no puede
 * escribir `ai_usage` ni llamar a estas funciones. Reservar es atómico (ver la migración).
 */
export function createUsageTracker(admin: SupabaseClient) {
  return {
    /** Reserva un uso. `false` si ya se alcanzó el límite del día. Lanza si la base falla. */
    async reserve(userId: string, day: string, kind: UsageKind, limit: number): Promise<boolean> {
      const { data, error } = await admin.rpc('reserve_ai_usage', {
        p_user: userId,
        p_day: day,
        p_kind: kind,
        p_limit: limit,
      });
      if (error) throw new Error(`no se pudo reservar el uso de IA: ${error.message}`);
      return data === true;
    },

    /** Devuelve un uso reservado (el pedido falló por el proveedor). No lanza: es un mejor esfuerzo. */
    async release(userId: string, day: string, kind: UsageKind): Promise<void> {
      await admin.rpc('release_ai_usage', { p_user: userId, p_day: day, p_kind: kind });
    },

    /** Suma los tokens del pedido. No lanza: no debe romper una respuesta ya obtenida. */
    async recordTokens(
      userId: string,
      day: string,
      kind: UsageKind,
      usage: AiUsage,
    ): Promise<void> {
      await admin.rpc('record_ai_tokens', {
        p_user: userId,
        p_day: day,
        p_kind: kind,
        p_input: usage.inputTokens,
        p_output: usage.outputTokens,
      });
    },
  };
}

export type UsageTracker = ReturnType<typeof createUsageTracker>;
