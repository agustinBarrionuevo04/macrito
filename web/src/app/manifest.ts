import type { MetadataRoute } from 'next';
import { es } from '@/lib/i18n/es';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: es.app.name,
    short_name: es.app.name,
    description: es.app.description,
    lang: 'es-AR',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#fafaf9',
    theme_color: '#047857',
    categories: ['health', 'fitness', 'food'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
