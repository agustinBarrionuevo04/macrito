import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import { formatShortDate } from '@/lib/ui/format-date';
import { formatNumber } from '@/lib/ui/number';
import type { WeekRow } from '../stats';

const m = es.progress.macros;

/** Promedios diarios por bloque de 7 días (los días sin registrar no cuentan). */
export function WeeksTable({ rows }: { rows: readonly WeekRow[] }) {
  return (
    <table className="w-full text-sm tabular-nums">
      <caption className="sr-only">{m.weeksTitle}</caption>
      <thead>
        <tr className="text-muted text-left">
          <th scope="col" className="py-1 font-medium">
            {m.week}
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            {m.days}
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            {m.kcal}
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            P
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            C
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            G
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.to} className="border-border border-t">
            <th scope="row" className="py-1.5 text-left font-normal">
              {t('{from} al {to}', {
                from: formatShortDate(row.from),
                to: formatShortDate(row.to),
              })}
            </th>
            {row.avg ? (
              <>
                <td className="py-1.5 text-right">{row.loggedDays}</td>
                <td className="py-1.5 text-right">{formatNumber(row.avg.kcal, 0)}</td>
                <td className="py-1.5 text-right">{formatNumber(row.avg.protein_g, 0)}</td>
                <td className="py-1.5 text-right">{formatNumber(row.avg.carbs_g, 0)}</td>
                <td className="py-1.5 text-right">{formatNumber(row.avg.fat_g, 0)}</td>
              </>
            ) : (
              <td colSpan={5} className="text-muted py-1.5 text-right">
                {m.empty}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
