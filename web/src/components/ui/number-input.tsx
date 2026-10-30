'use client';

import { useId, useState } from 'react';
import { cx } from '@/lib/ui/cx';
import { formatNumber, isPartialDecimal, parseDecimal } from '@/lib/ui/number';

type Props = {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  unit?: string;
  /** Decimales a mostrar al terminar de editar. */
  decimals?: number;
  error?: string;
  disabled?: boolean;
  className?: string;
};

/**
 * Campo numérico para celular: teclado decimal y coma o punto como separador (es-AR escribe "1,5").
 * Mientras se escribe acepta textos a medias ("1,"); al salir del campo da formato. Nunca modifica lo que
 * escribió la persona (por ejemplo, no lo "recorta" a un límite): validar el rango es cosa del formulario,
 * que muestra el error con `error`.
 */
export function NumberInput({
  label,
  value,
  onChange,
  unit,
  decimals = 1,
  error,
  disabled,
  className,
}: Props) {
  const id = useId();
  const errorId = useId();
  const [text, setText] = useState(value === null ? '' : formatNumber(value, decimals));
  const [editing, setEditing] = useState(false);

  // Si el valor cambia desde afuera y no se está escribiendo, el texto lo sigue.
  const shown = editing ? text : value === null ? '' : formatNumber(value, decimals);

  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div
        className={cx(
          'bg-surface flex min-h-11 items-center gap-2 rounded-lg border px-3',
          error ? 'border-danger' : 'border-border focus-within:border-primary',
        )}
      >
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          value={shown}
          onFocus={() => {
            setText(value === null ? '' : String(value).replace('.', ','));
            setEditing(true);
          }}
          onChange={(event) => {
            const next = event.target.value;
            if (!isPartialDecimal(next)) return;
            setText(next);
            onChange(parseDecimal(next));
          }}
          onBlur={() => setEditing(false)}
          className="min-w-0 flex-1 bg-transparent py-2 text-base tabular-nums outline-none"
        />
        {unit ? <span className="text-muted text-sm">{unit}</span> : null}
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
