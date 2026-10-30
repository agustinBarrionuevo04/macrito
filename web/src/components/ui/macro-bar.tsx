import { cx } from '@/lib/ui/cx';
import { formatNumber } from '@/lib/ui/number';
import { isOver, progressRatio } from '@/lib/ui/progress';

export type MacroKind = 'protein' | 'carbs' | 'fat' | 'primary';

const FILL: Record<MacroKind, string> = {
  protein: 'bg-protein',
  carbs: 'bg-carbs',
  fat: 'bg-fat',
  primary: 'bg-primary',
};

type Props = {
  label: string;
  value: number;
  target: number;
  unit?: string;
  kind?: MacroKind;
  className?: string;
};

/** Barra de un macro: "Proteínas  96 / 160 g". Se tiñe de alerta si se pasa de la meta. */
export function MacroBar({ label, value, target, unit = 'g', kind = 'primary', className }: Props) {
  const ratio = progressRatio(value, target);
  const over = isOver(value, target);

  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className={cx('tabular-nums', over ? 'text-danger' : 'text-muted')}>
          {formatNumber(value, 0)} / {formatNumber(target, 0)} {unit}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={target > 0 ? target : 0}
        aria-valuenow={Math.max(value, 0)}
        className="bg-surface-muted h-2 overflow-hidden rounded-full"
      >
        <div
          className={cx(
            'h-full rounded-full transition-[width] duration-500',
            over ? 'bg-danger' : FILL[kind],
          )}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}
