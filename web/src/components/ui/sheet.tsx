'use client';

import type { ComponentProps } from 'react';
import { Dialog } from './dialog';

/** Hoja inferior para elegir porción, comida del día, etc. Es un `Dialog` anclado abajo. */
export function Sheet(props: Omit<ComponentProps<typeof Dialog>, 'variant'>) {
  return <Dialog {...props} variant="sheet" />;
}
