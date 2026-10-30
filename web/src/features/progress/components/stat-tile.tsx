import { cx } from '@/lib/ui/cx';

type Props = { label: string; value: string; hint?: string; className?: string };

/** Un número que importa, con su explicación. Para valores sueltos no hace falta un gráfico. */
export function StatTile({ label, value, hint, className }: Props) {
  return (
    <div className={cx('bg-surface-muted flex flex-col gap-0.5 rounded-xl p-3', className)}>
      <span className="text-muted text-sm">{label}</span>
      <span className="text-xl font-bold tabular-nums">{value}</span>
      {hint ? <span className="text-muted text-xs">{hint}</span> : null}
    </div>
  );
}
