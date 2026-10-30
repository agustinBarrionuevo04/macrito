import { es } from '@/lib/i18n/es';

// Página de respaldo del service worker cuando no hay conexión. Es pública y estática.
export default function OfflinePage() {
  const t = es.ui.offline;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-2xl font-semibold">{t.title}</h1>
      <p className="text-muted">{t.description}</p>
      {/* Enlace común a propósito: recarga completa, para que el navegador vuelva a probar la red. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        href="/"
        className="bg-primary text-primary-foreground mt-2 inline-flex min-h-11 items-center rounded-lg px-5 font-medium"
      >
        {es.ui.retry}
      </a>
    </main>
  );
}
