/**
 * `2026-03-15` → `15/03/2026`. Opera sobre el texto y no crea un `Date`: así la zona horaria no puede
 * correr el día (un `new Date('2026-03-15')` es medianoche UTC, o sea el 14 en Argentina).
 */
export function formatIsoDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso;
}

/** `2026-03-15` → `15/3`. Sin año, para ejes de gráficos. */
export function formatShortDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${Number(match[3])}/${Number(match[2])}` : iso;
}
