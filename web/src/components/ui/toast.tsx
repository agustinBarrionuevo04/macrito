'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { es } from '@/lib/i18n/es';
import { cx } from '@/lib/ui/cx';
import { addToast, removeToast } from '@/lib/ui/toast-queue';

export type ToastTone = 'info' | 'success' | 'error';

export type ToastInput = {
  message: string;
  tone?: ToastTone;
  /** Acción opcional, por ejemplo "Deshacer" al borrar una comida. */
  action?: { label: string; onClick: () => void };
  /** Milisegundos hasta que se cierra sola. Por defecto 4000 (6000 si tiene acción). */
  duration?: number;
};

type ToastItem = ToastInput & { id: number };

type ToastApi = { show: (toast: ToastInput) => number; dismiss: (id: number) => void };

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast debe usarse dentro de <ToastProvider>');
  return api;
}

const TONE: Record<ToastTone, string> = {
  info: 'border-border',
  success: 'border-primary',
  error: 'border-danger',
};

function ToastView({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const duration = toast.duration ?? (toast.action ? 6000 : 4000);

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), duration);
    return () => clearTimeout(timer);
  }, [toast.id, duration, onDismiss]);

  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      className={cx(
        'bg-surface text-foreground flex items-center gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg',
        TONE[toast.tone ?? 'info'],
      )}
    >
      <p className="flex-1">{toast.message}</p>
      {toast.action ? (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick();
            onDismiss(toast.id);
          }}
          className="text-primary min-h-11 px-2 font-semibold"
        >
          {toast.action.label}
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label={es.ui.close}
        className="text-muted -mr-2 inline-flex size-11 items-center justify-center"
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => removeToast(current, id));
  }, []);

  const show = useCallback((toast: ToastInput) => {
    const id = nextId.current;
    nextId.current += 1;
    setToasts((current) => addToast(current, { ...toast, id }));
    return id;
  }, []);

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        role="region"
        aria-label={es.ui.notifications}
        className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md flex-col gap-2 px-4"
      >
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastView toast={toast} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
