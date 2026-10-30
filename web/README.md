# Macritos

PWA de conteo de calorías, pensada para varias personas con registro cerrado (solo emails autorizados). Registra comidas buscando, escaneando el código de barras, escribiendo o con una foto analizada por IA, y calcula una meta diaria personalizada.

Next.js (App Router) · TypeScript · Tailwind · Supabase (Auth, Postgres, RLS) · pensada para Vercel.

Reglas de desarrollo: [`AGENTS.md`](AGENTS.md). Contratos: [`docs/contracts.md`](docs/contracts.md). Plan: [`../plans/PLAN_MACRITOS.md`](../plans/PLAN_MACRITOS.md).

## Qué hay hoy (Fase 2, MVP)

- Ingreso con email y contraseña (registro solo por invitación) y onboarding de una sola vez con la meta calculada en vivo.
- Diario del día: anillo de calorías restantes, macros, cuatro comidas, navegar entre días, editar, borrar con deshacer, copiar.
- Agregar alimento: buscador (catálogo propio, Open Food Facts, USDA, ARGENFOODS), escáner de códigos de barras, porciones, alimentos propios y favoritos.
- IA por foto y por texto, con pantalla de revisión antes de guardar.
- PWA: instalable, tema claro/oscuro.

Falta (Fases 3 y 4): progreso y gráficos, recetas, agua, pulido y deploy. Detalle en el plan.

## Requisitos

- **Node ≥ 22** y **pnpm 10** (`corepack enable` alcanza).
- **Docker** y la **CLI de Supabase** para correr Supabase en tu máquina. Instalación: <https://supabase.com/docs/guides/local-development/cli/getting-started>. Sin instalarla: `npx supabase@2.122.0 <comando>` (es la versión que usa el CI).

> ¿Sin Docker? Podés usar un proyecto de Supabase en la nube: ver [Usar un proyecto de Supabase en la nube](#usar-un-proyecto-de-supabase-en-la-nube).

## Correr en local

Todos los comandos, desde la carpeta `web/`.

**1. Instalar dependencias**

```sh
pnpm install
```

**2. Levantar Supabase local** (la primera vez baja las imágenes de Docker y tarda unos minutos)

```sh
supabase start
```

Aplica solo las migraciones de `supabase/migrations/` y activa el hook que cierra el registro (`supabase/config.toml`). Queda corriendo en:

| Servicio                    | URL                      |
| --------------------------- | ------------------------ |
| API                         | `http://127.0.0.1:54321` |
| Studio (panel de la base)   | `http://127.0.0.1:54323` |
| Bandeja de emails de prueba | `http://127.0.0.1:54324` |

**3. Copiar las claves locales**

```sh
supabase status -o env
```

Usá `API_URL`, `ANON_KEY` y `SERVICE_ROLE_KEY` de esa salida. (Las versiones nuevas de la CLI también las muestran como clave "publishable" y "secret"; sirven las de siempre.)

**4. Crear `.env.local`**

```sh
cp .env.example .env.local
```

Completar al menos:

```sh
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>
ALLOWED_EMAILS=tu@email.com
```

`.env.local` está en `.gitignore`: **nunca** lo subas al repo, y la clave `SUPABASE_SERVICE_ROLE_KEY` no lleva prefijo `NEXT_PUBLIC_` porque no debe llegar al navegador.

**5. Autorizar tu email** (el registro está cerrado: sin esto, "Crear cuenta" responde que el email no está autorizado)

```sh
pnpm db:seed-allowlist
```

**6. (Opcional) Cargar los alimentos argentinos de ARGENFOODS**

```sh
pnpm db:load-argenfoods              # solo descarga y genera un reporte para revisar
pnpm db:load-argenfoods -- --load    # además los carga en tu base
```

Descarga la tabla de la UNLu a `web/.local/` (ignorada por git: los datos **no** se suben al repo). Sin esto la app funciona igual, pero sin esa fuente de alimentos locales.

**7. Arrancar la app**

```sh
pnpm dev
```

Abrí <http://localhost:3000>, elegí **Crear cuenta** con el email del paso 4 y recorré el onboarding. En local no se pide confirmar el email.

## Probar cada parte

| Qué                           | Cómo                                                                                                                                                                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buscar alimentos              | Pestaña **Buscar** de `/add`. Open Food Facts funciona sin clave. USDA solo con `USDA_API_KEY` en `.env.local` (clave gratuita: <https://fdc.nal.usda.gov/api-key-signup>); sin ella se omite sin error.                               |
| Código de barras              | Pestaña **Escanear**. En la compu funciona con la cámara web (`localhost` cuenta como contexto seguro). Siempre podés escribir el código a mano.                                                                                       |
| IA por foto o texto           | Pestañas **Foto** y **Texto**. Requiere `AI_API_KEY` en `.env.local`; sin ella la app avisa que no está disponible. Límites diarios: `AI_DAILY_PHOTO_LIMIT` (20) y `AI_DAILY_TEXT_LIMIT` (100). Detalle en [`docs/ai.md`](docs/ai.md). |
| Emails (recuperar contraseña) | Llegan a la bandeja de pruebas: <http://127.0.0.1:54324>.                                                                                                                                                                              |
| Service worker / instalación  | Está apagado en `pnpm dev`. Para probarlo: `pnpm build && pnpm start`.                                                                                                                                                                 |

**Limitación:** desde el celular, por la red de tu casa, no hay HTTPS: la cámara y la instalación como app no andan. Eso se resuelve con el deploy.

## Comandos útiles

```sh
pnpm test            # tests unitarios y de interfaz
pnpm test:coverage   # con cobertura (exige ≥ 95 % en el cálculo nutricional)
pnpm lint
pnpm typecheck
pnpm format:check
pnpm build           # build de producción
pnpm db:test         # migraciones + pruebas de la base en un Postgres local, sin Docker
supabase db reset    # vuelve la base local a cero (borra datos y usuarios) y reaplica las migraciones
supabase stop        # apaga Supabase local
```

Después de `supabase db reset` hay que volver a correr `pnpm db:seed-allowlist` (y la carga de ARGENFOODS si la usabas).

## Problemas frecuentes

- **"Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY"**: falta `.env.local` o hay que reiniciar `pnpm dev` después de crearlo.
- **"Este email no está autorizado"**: corré `pnpm db:seed-allowlist` con el email en `ALLOWED_EMAILS`.
- **Puerto ocupado** (54321–54327): otro Supabase está corriendo; `supabase stop` o cambiá los puertos en `supabase/config.toml`.
- **La pantalla Hoy te manda al onboarding**: es lo esperado hasta completarlo una vez.
- **Foto o texto dicen "no disponible"**: falta `AI_API_KEY`.

## Usar un proyecto de Supabase en la nube

1. Crear el proyecto en <https://supabase.com> y cargar el esquema: `supabase link --project-ref <ref>` y `supabase db push` (aplica `supabase/migrations/`).
2. **Activar el hook a mano** (`config.toml` solo vale para el stack local): _Authentication → Hooks → Before User Created → Postgres function → `public.hook_before_user_created`_. Sin esto el registro queda **abierto**. Detalle en [`docs/auth.md`](docs/auth.md).
3. En `.env.local`, usar la URL y las claves del proyecto (_Project Settings → API_) y seguir desde el paso 5.
4. En _Authentication → URL Configuration_, agregar `http://localhost:3000/auth/callback` a las URLs de redirección.

## Documentación

[`docs/auth.md`](docs/auth.md) · [`docs/nutrition.md`](docs/nutrition.md) · [`docs/foods.md`](docs/foods.md) · [`docs/argenfoods.md`](docs/argenfoods.md) · [`docs/pwa.md`](docs/pwa.md) · [`docs/profile.md`](docs/profile.md) · [`docs/diary.md`](docs/diary.md) · [`docs/add-food.md`](docs/add-food.md) · [`docs/ai.md`](docs/ai.md)
