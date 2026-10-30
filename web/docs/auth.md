# Auth, base de datos y aislamiento

## Cómo funciona

- **Registro cerrado con hook de Postgres.** `public.hook_before_user_created` es el hook "Before User Created" de Supabase Auth. Rechaza (403) cualquier email que no esté en `public.allowed_emails`. La tabla no tiene policies ni grants para `anon`/`authenticated`: nadie la lee desde la app.
- **Perfil vacío al crear usuario.** El trigger `on_auth_user_created` inserta la fila en `profiles`. Mientras `onboarding_completed_at` sea `null`, el proxy manda al usuario a `/onboarding`.
- **Proxy** (`src/proxy.ts`, en Next 16 reemplaza a `middleware.ts`): refresca la sesión y aplica `resolveRoute` (`src/lib/supabase/route-guard.ts`). Sin sesión → `/login` (las rutas `/api/*` responden 401). Con sesión y sin onboarding → `/onboarding`.
- **Clientes** (`src/lib/supabase/`): `client.ts` (navegador), `server.ts` (Server Components/Actions, respeta RLS), `admin.ts` (service role, solo servidor).
- **Email sin confirmar**: `enable_confirmations = false`. Si más adelante se activa, el alta devuelve un mensaje pidiendo confirmar el email.

## Activar el hook en el proyecto real

`supabase/config.toml` solo vale para el stack local. En el proyecto de Supabase hay que activarlo a mano:
**Authentication → Hooks → Before User Created → Postgres function → `public.hook_before_user_created`**.

Sin este paso cualquiera con la URL puede registrarse y consumir la API key de IA.

En el mismo proyecto, configurar:

- **Authentication → URL Configuration**: Site URL y `https://<dominio>/auth/callback` en Redirect URLs (lo usa el link de recuperar contraseña).
- **Largo mínimo de contraseña**: 8 (el formulario también lo exige).
- **SMTP propio** (opcional): el mailer por defecto de Supabase tiene un límite bajo de mails por hora.

## Agregar un email a la allowlist

```sh
# Desde ALLOWED_EMAILS en .env.local
pnpm db:seed-allowlist
```

o por SQL (editor de Supabase):

```sql
insert into public.allowed_emails (email) values ('persona@ejemplo.com');
```

El email va en minúsculas (la tabla lo exige). Quitar el acceso a futuro: `delete from public.allowed_emails where email = '...'` (no borra la cuenta ya creada).

## Tests

```sh
pnpm test        # unitarios (Vitest)
pnpm db:test     # migraciones + pgTAP en un Postgres local, sin Docker
supabase start && supabase test db   # contra el stack real (lo que corre el CI)
```

`pnpm db:test` simula el esquema `auth` y los roles de Supabase (`supabase/local/stub.sql`); sirve para iterar sin Docker pero **no** reemplaza al stack real ni prueba el hook de GoTrue.

## Reglas para tablas nuevas

Supabase otorga por defecto permisos a `anon` y `authenticated` sobre tablas nuevas de `public`. Toda migración que cree una tabla debe: activar RLS, hacer `revoke all` a `anon` y `authenticated`, y otorgar solo lo necesario junto con sus policies. Y agregar sus casos a `supabase/tests/`.

## Diferencias con `contracts.md`

Decisiones de implementación que endurecen lo que dice el contrato (a revisar):

- `foods`: un usuario solo puede crear alimentos `custom` o `ai_unverified`. Si pudiera escribir `source = 'off'` reservaría `(source, source_id)` y bloquearía el alta del catálogo compartido.
- `ai_usage`: el usuario solo lee. Escribe el servidor (service role). Si el cliente pudiera escribir, reiniciaría su contador y se saltearía `AI_DAILY_PHOTO_LIMIT`.
- `profiles`: el usuario lee y actualiza; no inserta ni borra (la fila la crea el trigger).
- `recipes` / `recipe_items`: no están en esta migración. El contrato no define sus columnas; los agrega 3-J.
