import { MacroBar } from '@/components/ui/macro-bar';
import { ProgressRing } from '@/components/ui/progress-ring';
import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import { formatNumber } from '@/lib/ui/number';
import type { DailyTargets } from '@/types';
import { kcalStatus } from '../totals';
import type { Snapshot } from '../types';

const s = es.diary.summary;

type Props = { totals: Snapshot; targets: DailyTargets | null };

/** Anillo con las calorías que quedan y barras de macros, respecto de la meta diaria. */
export function DaySummary({ totals, targets }: Props) {
  if (!targets) {
    return (
      <section className="bg-surface-muted rounded-2xl p-4 text-sm" aria-label={s.consumed}>
        <p className="text-2xl font-semibold tabular-nums">
          {formatNumber(totals.kcal, 0)}{' '}
          <span className="text-muted text-sm font-normal">kcal</span>
        </p>
        <p className="text-muted mt-1">{s.noTarget}</p>
      </section>
    );
  }

  const status = kcalStatus(targets.kcal, totals.kcal);

  return (
    <section className="flex flex-col gap-5" aria-label={s.consumed}>
      <div className="flex items-center gap-5">
        <ProgressRing
          value={totals.kcal}
          max={targets.kcal}
          size={140}
          strokeWidth={12}
          label={t(s.label, {
            consumed: formatNumber(totals.kcal, 0),
            target: formatNumber(targets.kcal, 0),
          })}
        >
          <span
            className={`text-2xl font-bold tabular-nums ${status.over ? 'text-danger' : ''}`}
            data-testid="kcal-remaining"
          >
            {formatNumber(status.remaining, 0)}
          </span>
          <span className="text-muted text-xs">{status.over ? s.over : s.remaining}</span>
        </ProgressRing>

        <dl className="flex flex-col gap-1 text-sm">
          <div>
            <dt className="text-muted">{s.consumed}</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {formatNumber(totals.kcal, 0)} kcal
            </dd>
          </div>
          <div>
            <dt className="text-muted">{s.target}</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {formatNumber(targets.kcal, 0)} kcal
            </dd>
          </div>
        </dl>
      </div>

      <div className="flex flex-col gap-3">
        <MacroBar
          label={s.protein}
          value={totals.protein_g}
          target={targets.protein_g}
          kind="protein"
        />
        <MacroBar label={s.carbs} value={totals.carbs_g} target={targets.carbs_g} kind="carbs" />
        <MacroBar label={s.fat} value={totals.fat_g} target={targets.fat_g} kind="fat" />
      </div>
    </section>
  );
}
