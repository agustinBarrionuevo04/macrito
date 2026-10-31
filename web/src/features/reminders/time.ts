/** "13:05" o "13:05:00" → minutos desde la medianoche; `null` si no es una hora válida. */
export function parseTime(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Hora a mostrar y guardar: siempre "HH:MM". */
export function normalizeTime(value: unknown): string | null {
  const minutes = parseTime(value);
  if (minutes === null) return null;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export type LocalMoment = { date: string; minutes: number };

/** Fecha (`AAAA-MM-DD`) y minutos desde la medianoche en una zona horaria. Lanza si la zona no existe. */
export function localMoment(now: Date, timeZone: string): LocalMoment {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}
