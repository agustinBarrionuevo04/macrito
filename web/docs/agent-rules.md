# Reglas para agentes (web/)

Reglas completas para quien trabaje en `web/` (Macritos, PWA en Next.js). Las reglas de la raíz del repo (`../AGENTS.md`) aplican solo al código Flutter. Plan: `../plans/PLAN_MACRITOS.md`. Contratos: `contracts.md`.

Este contenido vive acá y no en `web/AGENTS.md` porque el check `check_agents_md` del CI de Flutter limita el total de los `AGENTS.md` de una misma ruta a 31 000 bytes y la raíz ya ocupa casi todo.

## Reglas

- TypeScript estricto. **Sin `any`** (ESLint lo rechaza).
- **Toda función de cálculo tiene test** (Vitest, junto al archivo: `foo.test.ts`).
- **Textos solo en `src/lib/i18n/es.ts`**, bajo tu propio prefijo. Solo es-AR.
- **Ningún secreto en el cliente.** Solo `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` llevan prefijo `NEXT_PUBLIC_`. La key de IA y la service role viven solo en el servidor.
- **Nada de lógica de negocio en componentes.** Va en `src/lib/` o en Server Actions.
- Validación de entrada con zod en toda frontera de red.
- Si tocás datos de usuario, probá que otro usuario no los puede ver.
- Los contratos de `contracts.md` y `src/types/` no se rompen: si hace falta cambiarlos, PR aparte.
- Cada agente toca solo los directorios de su columna "Dueño de" (sección 4 del plan).

## Comandos

```sh
pnpm dev            # servidor de desarrollo
pnpm lint
pnpm typecheck
pnpm test           # Vitest
pnpm test:coverage
pnpm test:e2e       # Playwright
pnpm build
pnpm format         # Prettier
```

## Ramas y commits

- Una rama por feature (`feat/<id>-<nombre>`) o bug (`fix/<nombre>`), sale de `develop`; el PR va contra `develop`.
- Commits convencionales (`feat:`, `fix:`, `chore:`, `docs:`). Sin trailers de IA.
- Un PR está "hecho" cuando `lint`, `typecheck`, `test` y `build` están en verde.
