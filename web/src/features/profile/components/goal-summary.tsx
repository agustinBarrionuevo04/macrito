import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import { formatNumber } from '@/lib/ui/number';
import type { TargetsBreakdown, TargetsWarning } from '@/lib/nutrition';

const s = es.profile.summary;

function warningText(warning: TargetsWarning): string {
  const w = es.profile.warnings;
  switch (warning.code) {
    case 'below_kcal_floor':
      return t(w.below_kcal_floor, {
        raw: formatNumber(Math.round(warning.rawKcal), 0),
        floor: formatNumber(warning.floorKcal, 0),
      });
    case 'adult_equations_under_19':
      return w.adult_equations_under_19;
    case 'weekly_goal_ignored':
      return w.weekly_goal_ignored;
    case 'protein_capped':
      return w.protein_capped;
  }
}

/** Con signo explícito y el signo menos tipográfico (−), no el guion, que se lee como separador. */
const signed = (value: number) => {
  const rounded = Math.round(value);
  if (rounded === 0) return '0';
  return `${rounded > 0 ? '+' : '−'}${formatNumber(Math.abs(rounded), 0)}`;
};

/** Meta diaria con su desglose: gasto estimado, ajustes, macros y avisos. */
export function GoalSummary({ breakdown }: { breakdown: TargetsBreakdown }) {
  const rows: [label: string, value: string][] = [
    [s.tee, `${formatNumber(Math.round(breakdown.tee), 0)} kcal`],
    [s.goalAdjustment, `${signed(breakdown.goalAdjustment)} kcal`],
  ];
  if (breakdown.manualAdjustment !== 0)
    rows.push([s.manualAdjustment, `${signed(breakdown.manualAdjustment)} kcal`]);

  const macros: [label: string, grams: number][] = [
    [s.protein, breakdown.protein_g],
    [s.carbs, breakdown.carbs_g],
    [s.fat, breakdown.fat_g],
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-primary-soft rounded-2xl p-5 text-center">
        <p className="text-5xl font-bold tabular-nums">
          {formatNumber(Math.round(breakdown.kcal), 0)}
        </p>
        <p className="text-muted">{s.kcal}</p>
      </div>

      <dl className="grid grid-cols-3 gap-3 text-center">
        {macros.map(([label, grams]) => (
          <div key={label} className="bg-surface border-border rounded-xl border p-3">
            <dd className="text-xl font-semibold tabular-nums">
              {formatNumber(Math.round(grams), 0)} g
            </dd>
            <dt className="text-muted text-sm">{label}</dt>
          </div>
        ))}
      </dl>

      {breakdown.warnings.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {breakdown.warnings.map((warning) => (
            <li
              key={warning.code}
              role="note"
              className="border-warning text-foreground bg-surface-muted rounded-lg border-l-4 p-3 text-sm"
            >
              {warningText(warning)}
            </li>
          ))}
        </ul>
      ) : null}

      <section aria-label={s.howTitle} className="flex flex-col gap-2 text-sm">
        <h3 className="font-semibold">{s.howTitle}</h3>
        <dl className="flex flex-col gap-1">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4">
              <dt className="text-muted">{label}</dt>
              <dd className="tabular-nums">{value}</dd>
            </div>
          ))}
          <div className="border-border flex justify-between gap-4 border-t pt-1 font-semibold">
            <dt>{s.goal}</dt>
            <dd className="tabular-nums">{formatNumber(Math.round(breakdown.kcal), 0)} kcal</dd>
          </div>
        </dl>
        <p className="text-muted">{s.howText}</p>
      </section>
    </div>
  );
}
