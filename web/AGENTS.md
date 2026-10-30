# AGENTS.md (web/)

Macritos (PWA Next.js). Reglas completas: [`docs/agent-rules.md`](docs/agent-rules.md). Contratos: [`docs/contracts.md`](docs/contracts.md).

Resumen: TS estricto sin `any`; cálculos con test; textos solo en `src/lib/i18n/es.ts`; ningún secreto en el cliente; sin lógica de negocio en componentes; zod en toda frontera de red.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
