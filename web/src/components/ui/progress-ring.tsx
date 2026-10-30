import type { ReactNode } from 'react';
import { cx } from '@/lib/ui/cx';
import { ringGeometry } from '@/lib/ui/progress';

type Props = {
  value: number;
  max: number;
  /** Diámetro en px. */
  size?: number;
  strokeWidth?: number;
  /** Texto accesible, por ejemplo "1.200 de 2.000 kcal". */
  label: string;
  /** Contenido centrado dentro del anillo. */
  children?: ReactNode;
  className?: string;
};

/** Anillo de progreso. Pasa a color de alerta cuando `value` supera `max`. */
export function ProgressRing({
  value,
  max,
  size = 160,
  strokeWidth = 14,
  label,
  children,
  className,
}: Props) {
  const g = ringGeometry({ value, max, size, strokeWidth });
  const center = size / 2;

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max > 0 ? max : 0}
      aria-valuenow={Math.max(value, 0)}
      className={cx('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        className="-rotate-90"
      >
        <circle
          cx={center}
          cy={center}
          r={g.radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-surface-muted"
        />
        <circle
          cx={center}
          cy={center}
          r={g.radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={g.circumference}
          strokeDashoffset={g.offset}
          className={cx(
            'transition-[stroke-dashoffset] duration-500',
            g.over ? 'stroke-danger' : 'stroke-primary',
          )}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  );
}
