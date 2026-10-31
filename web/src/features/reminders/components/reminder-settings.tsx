'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { detectPlatform } from '@/lib/pwa/install';
import { pushSupport, urlBase64ToBytes, type PushSupport } from '@/lib/pwa/push';
import { es } from '@/lib/i18n/es';
import { t } from '@/lib/i18n/format';
import {
  removeSubscription,
  saveReminder,
  saveSubscription,
  sendTestNotification,
} from '../actions';
import type { ReminderRow } from '../server';

const r = es.reminders;

type Props = {
  /** Clave pública VAPID del servidor; `null` si los avisos no están configurados. */
  vapidPublicKey: string | null;
  initial: ReminderRow[];
};

/** El navegador puede no tener service worker (en desarrollo está apagado): no se cuelga esperándolo. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function readSupport(configured: boolean): PushSupport {
  const platform = detectPlatform({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
  });
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return pushSupport({
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPushManager: 'PushManager' in window,
    hasNotification: 'Notification' in window,
    permission: 'Notification' in window ? Notification.permission : null,
    isIos: platform === 'ios-safari' || platform === 'ios-other',
    standalone,
    configured,
  });
}

/** Recordatorios por comida con Web Push: activar este dispositivo, elegir horas y probar. */
export function ReminderSettings({ vapidPublicKey, initial }: Props) {
  const toast = useToast();
  const [support, setSupport] = useState<PushSupport | 'checking'>('checking');
  const [subscribed, setSubscribed] = useState(false);
  const [rows, setRows] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'enable' | 'disable' | 'test' | null>(null);
  const [saving, startSaving] = useTransition();

  const check = useCallback(async () => {
    const current = readSupport(vapidPublicKey !== null);
    setSupport(current);
    if (current !== 'ready') return;
    try {
      const registration = await withTimeout(navigator.serviceWorker.ready, 3000);
      setSubscribed((await registration.pushManager.getSubscription()) !== null);
    } catch {
      setSubscribed(false);
    }
  }, [vapidPublicKey]);

  useEffect(() => {
    // Las capacidades del navegador solo se conocen en el cliente: se leen después de montar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void check();
  }, [check]);

  async function enable() {
    if (!vapidPublicKey) return;
    setBusy('enable');
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setError(r.errors.permission);
        setSupport(readSupport(true));
        return;
      }
      const registration = await withTimeout(navigator.serviceWorker.ready, 8000);
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToBytes(vapidPublicKey),
        }));
      const result = await saveSubscription(subscription.toJSON());
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSubscribed(true);
    } catch {
      // El navegador rechazó la suscripción (sin red al servicio push, sin service worker, etc.).
      setError(r.errors.subscription);
    } finally {
      setBusy(null);
    }
  }

  async function disable() {
    setBusy('disable');
    setError(null);
    try {
      const registration = await withTimeout(navigator.serviceWorker.ready, 5000);
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await removeSubscription(endpoint);
      }
      setSubscribed(false);
    } catch {
      setError(r.errors.generic);
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy('test');
    setError(null);
    const result = await sendTestNotification();
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.show({ message: r.device.testSent, tone: 'success' });
  }

  function update(
    meal: ReminderRow['meal'],
    patch: Partial<Pick<ReminderRow, 'enabled' | 'remindAt'>>,
  ) {
    const previous = rows;
    const next = rows.map((row) => (row.meal === meal ? { ...row, ...patch } : row));
    const changed = next.find((row) => row.meal === meal)!;
    setRows(next);
    setError(null);
    startSaving(async () => {
      const result = await saveReminder(meal, {
        enabled: changed.enabled,
        remindAt: changed.remindAt,
      });
      if (!result.ok) {
        setRows(previous);
        setError(result.error);
      }
    });
  }

  if (support === 'checking') return null;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted text-sm">{r.help}</p>

      {support !== 'ready' ? (
        <p role="status" className="bg-surface-muted rounded-lg p-3 text-sm">
          {r.states[support]}
        </p>
      ) : null}

      {support === 'ready' && !subscribed ? (
        <Button loading={busy === 'enable'} onClick={() => void enable()}>
          {busy === 'enable' ? r.device.working : r.device.enable}
        </Button>
      ) : null}

      {support === 'ready' && subscribed ? (
        <>
          <p className="text-sm">{r.device.enabled}</p>
          <fieldset className="flex flex-col gap-2" disabled={saving}>
            <legend className="mb-1 text-sm font-medium">{r.meals}</legend>
            {rows.map((row) => {
              const meal = es.diary.meals[row.meal];
              return (
                <div key={row.meal} className="flex min-h-11 items-center justify-between gap-3">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      role="switch"
                      className="size-5"
                      checked={row.enabled}
                      aria-label={t(r.switchLabel, { meal: meal.toLowerCase() })}
                      onChange={(event) => update(row.meal, { enabled: event.target.checked })}
                    />
                    <span>{meal}</span>
                  </label>
                  <input
                    type="time"
                    value={row.remindAt}
                    disabled={!row.enabled}
                    aria-label={t(r.timeLabel, { meal: meal.toLowerCase() })}
                    onChange={(event) => {
                      if (event.target.value) update(row.meal, { remindAt: event.target.value });
                    }}
                    className="bg-surface border-border min-h-11 rounded-lg border px-3 tabular-nums"
                  />
                </div>
              );
            })}
          </fieldset>
          <div className="flex flex-col gap-2">
            <Button variant="secondary" loading={busy === 'test'} onClick={() => void test()}>
              {busy === 'test' ? r.device.testing : r.device.test}
            </Button>
            <Button variant="ghost" disabled={busy !== null} onClick={() => void disable()}>
              {r.device.disable}
            </Button>
          </div>
        </>
      ) : null}

      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
