import type { ReactNode } from 'react';

type Props = {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  title: ReactNode;
  description?: ReactNode;
};

/** Opción de un grupo de radios, con forma de tarjeta táctil. El radio nativo queda oculto pero accesible. */
export function OptionCard({ name, value, checked, onChange, title, description }: Props) {
  return (
    <label className="bg-surface border-border has-checked:border-primary has-checked:bg-primary-soft has-focus-visible:outline-primary flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border p-4 has-focus-visible:outline-2 has-focus-visible:outline-offset-2">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className="border-border mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2"
      >
        {checked ? <span className="bg-primary size-2.5 rounded-full" /> : null}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="font-medium">{title}</span>
        {description ? <span className="text-muted text-sm">{description}</span> : null}
      </span>
    </label>
  );
}
