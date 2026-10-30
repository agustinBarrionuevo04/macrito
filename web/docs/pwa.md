# PWA y sistema de diseño (1-D)

## Service worker (Serwist)

- Fuente: `src/sw.ts`. Se compila con esbuild en el build y se sirve **prerenderizado** en `/serwist/sw.js` (`src/app/serwist/[path]/route.ts`, `@serwist/turbopack`). Se registra desde `components/pwa/pwa-provider.tsx`; **en desarrollo está apagado** (interfiere con el hot reload): para probarlo, `pnpm build && pnpm start`.
- **Precachea** el JS/CSS de Next y la página `/offline`.
- **No cachea páginas, respuestas RSC ni `/api/*`**: son datos de un usuario autenticado y quedarían en el dispositivo tras cerrar sesión. Las navegaciones van siempre a la red; si falla, se muestra `/offline`. La cola offline para registrar comidas es de 4-M (IndexedDB).
- `src/sw.ts` usa la librería `webworker`, no `dom`: tiene su propio `tsconfig.sw.json` y `pnpm typecheck` revisa los dos.
- **`cacheComponents` y `partialPrefetching` están apagados** en `next.config.ts`. Con `cacheComponents` el handler de Serwist para Turbopack no se prerenderiza y generaría el service worker en cada pedido, con esbuild dentro de la función serverless. Es reversible cuando Serwist lo soporte.

## Instalación

| Plataforma                   | Qué ve el usuario                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| Android / Chrome             | Botón "Instalar" cuando el navegador dispara `beforeinstallprompt`.                  |
| iPhone, Safari               | Pasos: Compartir → Añadir a pantalla de inicio (iOS no tiene `beforeinstallprompt`). |
| iPhone, otro navegador o app | Pide abrir el link en Safari.                                                        |
| Ya instalada (standalone)    | Nada.                                                                                |

"Ahora no" lo oculta 7 días (`localStorage`). El aviso es un panel fijo abajo, apoyado sobre la navegación inferior si existe, y no empuja el contenido. La lógica (`src/lib/pwa/install.ts`) es pura y tiene tests.

## Manifest e íconos

`src/app/manifest.ts` (standalone, `es-AR`, colores). Los íconos están en `public/icons/` (192, 512, maskable 512 y Apple touch 180) y `src/app/favicon.ico`; se regeneran con `python3 scripts/generate-icons.py` (requiere Pillow). Un test comprueba que cada ícono exista y mida lo que declara el manifest.

## Tema

Tokens de color como variables CSS en `src/app/globals.css` (`bg-surface`, `text-muted`, `bg-primary`, `text-protein`…). Los componentes usan solo esos tokens: no hace falta `dark:`. Oscuro automático según el sistema, o forzado con `data-theme="dark|light"`. `ThemeToggle` guarda la preferencia en `localStorage` y un script inline en `<head>` la aplica antes de pintar (sin parpadeo). Todos los tokens de texto cumplen contraste AA.

## Componentes (`src/components/ui/`)

`Button` · `Dialog` y `Sheet` (sobre `<dialog>` nativo: foco, Esc y fondo inerte los resuelve el navegador) · `NumberInput` (teclado decimal, coma o punto; nunca modifica lo escrito: el rango lo valida el formulario) · `ProgressRing` · `MacroBar` · `Toast` (`useToast`, con acción "Deshacer") · `Skeleton` · `BottomNav` · `ThemeToggle`. La lógica numérica y de navegación vive en `src/lib/ui/` con tests; los componentes se prueban renderizados en el servidor.

`app/(app)/layout.tsx` envuelve las pantallas con sesión con la navegación inferior. Las rutas `/add`, `/progress` y `/profile` las crean 2-F, 2-G, 3-I y 2-E.

## Rendimiento

Lighthouse (móvil, `next start` local) sobre `/login`: Rendimiento **97**, Accesibilidad **100**, Buenas prácticas **100**, SEO **100**; CLS 0, TBT 160 ms. Para repetirlo: `pnpm build`, `pnpm start` y `npx lighthouse http://localhost:3000/login --only-categories=performance`. Lighthouse 12 ya no tiene la categoría PWA; la instalabilidad se verificó en un navegador real (service worker activo, manifest válido, íconos).

## Pendiente de verificar en dispositivos reales

La instalación requiere HTTPS en un dominio real. Hay que comprobar en un iPhone y en un Android que la app se instala, abre en pantalla completa y respeta la barra inferior (`safe-area`). Se podrá probar apenas esté el despliegue (4-O).
