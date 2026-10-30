import { createSerwistRoute } from '@serwist/turbopack';

// El service worker se genera en el build y se sirve en /serwist/sw.js.
export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute(
  {
    swSrc: 'src/sw.ts',
    useNativeEsbuild: true,
    // La página offline no está en .next/static: se agrega a mano. La revisión cambia en cada build.
    additionalPrecacheEntries: [{ url: '/offline', revision: crypto.randomUUID() }],
  },
);
