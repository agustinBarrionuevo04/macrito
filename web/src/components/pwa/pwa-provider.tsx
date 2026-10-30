'use client';

import { SerwistProvider } from '@serwist/turbopack/react';
import type { ReactNode } from 'react';

/**
 * Registra el service worker (/serwist/sw.js). En desarrollo queda apagado: interfiere con el
 * hot reload. Sin recarga automática al volver la conexión (se perdería lo que se está
 * escribiendo) y sin cachear páginas al navegar (son datos privados del usuario).
 */
export function PwaProvider({ children }: { children: ReactNode }) {
  return (
    <SerwistProvider
      swUrl="/serwist/sw.js"
      disable={process.env.NODE_ENV === 'development'}
      cacheOnNavigation={false}
      reloadOnOnline={false}
    >
      {children}
    </SerwistProvider>
  );
}
