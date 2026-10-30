'use client';

import { useEffect, useRef, useState } from 'react';
import { es } from '@/lib/i18n/es';
import {
  chooseInstallOffer,
  detectPlatform,
  isDismissed,
  type InstallOffer,
} from '@/lib/pwa/install';
import { Button } from '@/components/ui/button';

const DISMISSED_KEY = 'macritos.install-dismissed';

/** Evento de Chrome/Android que permite disparar el diálogo de instalación. iOS no lo tiene. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function readDismissedAt(): number | null {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return raw === null ? null : Number(raw);
  } catch {
    return null;
  }
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Aviso para instalar la app. Android/Chrome: botón "Instalar" (beforeinstallprompt). iPhone: iOS no
 * ofrece instalación automática, así que se muestran los pasos de Safari (Compartir → Añadir a
 * pantalla de inicio). No aparece si ya está instalada ni durante 7 días después de descartarlo.
 */
export function InstallBanner() {
  const [offer, setOffer] = useState<InstallOffer>('none');
  const promptEvent = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const platform = detectPlatform({
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints,
    });
    const evaluate = () =>
      setOffer(
        chooseInstallOffer({
          platform,
          standalone: isStandalone(),
          hasPrompt: promptEvent.current !== null,
          dismissed: isDismissed(readDismissedAt(), Date.now()),
        }),
      );

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      promptEvent.current = event as BeforeInstallPromptEvent;
      evaluate();
    };
    const onInstalled = () => {
      promptEvent.current = null;
      setOffer('none');
    };

    evaluate();
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (offer === 'none') return null;

  const t = es.ui.install;

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // Sin almacenamiento: se oculta solo hasta recargar.
    }
    setOffer('none');
  }

  async function install() {
    const event = promptEvent.current;
    if (!event) return;
    await event.prompt();
    await event.userChoice;
    promptEvent.current = null;
    setOffer('none');
  }

  return (
    // Fijo abajo y sin ocupar lugar en el documento: así no desplaza el contenido al aparecer
    // (evita un salto de layout). Si la app tiene navegación inferior, se apoya encima de ella.
    <section
      aria-label={t.title}
      className="fixed inset-x-0 bottom-0 z-30 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] [body:has(nav[data-bottom-nav])_&]:bottom-[calc(3.5rem+env(safe-area-inset-bottom))] [body:has(nav[data-bottom-nav])_&]:pb-3"
    >
      <div className="bg-primary-soft border-border mx-auto flex max-w-md flex-col gap-3 rounded-2xl border p-4 shadow-lg">
        {offer === 'prompt' && (
          <>
            <div>
              <p className="font-semibold">{t.title}</p>
              <p className="text-muted text-sm">{t.description}</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={install}>{t.action}</Button>
              <Button variant="ghost" onClick={dismiss}>
                {t.dismiss}
              </Button>
            </div>
          </>
        )}

        {offer === 'ios-steps' && (
          <>
            <p className="font-semibold">{t.iosTitle}</p>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {t.iosSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <Button variant="ghost" onClick={dismiss} className="self-start">
              {t.dismiss}
            </Button>
          </>
        )}

        {offer === 'ios-open-safari' && (
          <>
            <p className="font-semibold">{t.iosOpenSafariTitle}</p>
            <p className="text-muted text-sm">{t.iosOpenSafari}</p>
            <Button variant="ghost" onClick={dismiss} className="self-start">
              {t.dismiss}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
