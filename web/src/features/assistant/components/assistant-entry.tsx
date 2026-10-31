import Link from 'next/link';
import { es } from '@/lib/i18n/es';

const a = es.assistant.entry;

/** Atajo de Hoy hacia el asistente: "¿Qué como?" para el día que se está viendo. */
export function AssistantEntry({ day, today }: { day: string; today: string }) {
  return (
    <Link
      href={day === today ? '/assistant' : `/assistant?date=${day}`}
      className="bg-surface border-border hover:bg-surface-muted flex min-h-14 items-center justify-between gap-3 rounded-xl border px-4 py-3"
    >
      <span>
        <span className="block font-semibold">{a.title}</span>
        <span className="text-muted block text-sm">{a.help}</span>
      </span>
      <span aria-hidden="true" className="text-muted">
        ›
      </span>
    </Link>
  );
}
