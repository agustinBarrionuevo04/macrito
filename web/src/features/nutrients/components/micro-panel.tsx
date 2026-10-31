import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import { cx } from '@/lib/ui/cx';
import { formatNumber } from '@/lib/ui/number';
import { progressRatio } from '@/lib/ui/progress';
import {
  microCoverage,
  microReferences,
  microStatus,
  type MicroReference,
  type MicroStatus,
  type MicroTotals,
} from '../reference';

const n = es.nutrients;

type RowProps = {
  label: string;
  value: number;
  unit: string;
  decimals: number;
  reference: MicroReference;
};

const FILL: Record<MicroStatus, string> = {
  reached: 'bg-primary',
  below: 'bg-primary',
  over: 'bg-danger',
};

function MicroBar({ label, value, unit, decimals, reference }: RowProps) {
  const status = microStatus(value, reference);
  const kindLabel = reference.kind === 'goal' ? n.goal : n.limit;
  const shown = t(n.valueGoal, {
    value: formatNumber(value, decimals),
    reference: formatNumber(reference.value, 0),
    unit,
  });
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">
          {label} <span className="text-muted font-normal">({kindLabel})</span>
        </span>
        <span
          className={cx(
            'tabular-nums',
            status === 'over' ? 'text-danger font-semibold' : 'text-muted',
          )}
        >
          {shown}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={reference.value}
        aria-valuenow={Math.min(value, reference.value)}
        aria-valuetext={`${shown}${status === 'over' ? `. ${n.over}` : status === 'reached' ? `. ${n.reached}` : ''}`}
        className="bg-surface-muted h-2 overflow-hidden rounded-full"
      >
        <div
          className={cx('h-full rounded-full transition-[width] duration-500', FILL[status])}
          style={{ width: `${progressRatio(value, reference.value) * 100}%` }}
        />
      </div>
      {status === 'over' ? <p className="text-danger text-xs">{n.over}</p> : null}
      {status === 'reached' ? <p className="text-primary text-xs">{n.reached}</p> : null}
    </div>
  );
}

type Props = { totals: MicroTotals; targetKcal: number | null };

/** Fibra, azúcares y sodio del día contra una referencia (meta de fibra, tope de azúcares y de sodio). */
export function MicroPanel({ totals, targetKcal }: Props) {
  const coverage = microCoverage(totals);
  const refs = targetKcal === null ? null : microReferences(targetKcal);

  return (
    <section aria-labelledby="micro-title" className="flex flex-col gap-3">
      <h2 id="micro-title" className="text-lg font-semibold">
        {n.title}
      </h2>
      {refs ? (
        <div className="flex flex-col gap-3">
          <MicroBar
            label={n.fiber}
            value={totals.fiber_g}
            unit="g"
            decimals={1}
            reference={refs.fiber}
          />
          <MicroBar
            label={n.sugar}
            value={totals.sugar_g}
            unit="g"
            decimals={1}
            reference={refs.sugar}
          />
          <MicroBar
            label={n.sodium}
            value={totals.sodium_mg}
            unit="mg"
            decimals={0}
            reference={refs.sodium}
          />
        </div>
      ) : (
        <p className="text-muted text-sm">{n.noTarget}</p>
      )}
      <p className="text-muted text-xs">
        {coverage === 'none'
          ? n.coverageNone
          : coverage === 'partial'
            ? t(n.coveragePartial, { withData: totals.withData, entries: totals.entries })
            : n.coverageComplete}
      </p>
      <details>
        <summary className="text-primary min-h-11 cursor-pointer py-3 text-sm font-medium">
          {n.howTitle}
        </summary>
        <ul className="text-muted flex flex-col gap-2 text-xs">
          <li>{n.howFiber}</li>
          <li>{n.howSugar}</li>
          <li>{n.howSodium}</li>
        </ul>
      </details>
    </section>
  );
}
