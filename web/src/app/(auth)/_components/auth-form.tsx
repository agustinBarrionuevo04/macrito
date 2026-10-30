'use client';

import { useActionState } from 'react';
import { es } from '@/lib/i18n/es';
import type { AuthState } from '../actions';

export type AuthField = {
  name: string;
  type: 'email' | 'password';
  label: string;
  autoComplete: string;
};

type Props = {
  action: (state: AuthState, formData: FormData) => Promise<AuthState>;
  fields: AuthField[];
  submitLabel: string;
};

const inputClass =
  'w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-base outline-none focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-100';

export function AuthForm({ action, fields, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {fields.map((field) => (
        <label key={field.name} className="flex flex-col gap-1 text-sm font-medium">
          {field.label}
          <input
            name={field.name}
            type={field.type}
            autoComplete={field.autoComplete}
            defaultValue={field.type === 'email' ? state.email : undefined}
            required
            className={inputClass}
          />
        </label>
      ))}

      {state.error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}
      {state.message ? (
        <p role="status" className="text-sm text-green-700 dark:text-green-400">
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-zinc-900 px-4 py-2.5 font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? es.auth.submitting : submitLabel}
      </button>
    </form>
  );
}
