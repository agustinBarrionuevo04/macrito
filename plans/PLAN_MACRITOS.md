# Macritos — Plan de implementación por fases (para agentes en paralelo)

PWA de conteo de calorías, multiusuario con login, con IA por foto. Uso personal (2 usuarios: yo y mi novia). Objetivo: paridad funcional real con Fitia en lo que importa, sin pagar suscripción.

## 0. Decisiones ya tomadas

| Tema | Decisión |
|---|---|
| Base | Fork de OpenNutriTracker (Flutter, GPL-3.0). **Se usa como referencia de lógica, no como base de código.** El código Flutter queda intacto en la raíz. |
| App nueva | Carpeta `web/` dentro del mismo repo. Mantener licencia GPL-3.0 (se portan fórmulas y prompts). |
| Frontend | Next.js (App Router) + TypeScript + Tailwind. PWA con Serwist. |
| Backend | Supabase: Auth + Postgres + RLS. Route Handlers de Next.js para IA y proxies. |
| Deploy | Vercel + Supabase. |
| Idioma | Solo es-AR. Todos los textos en un único archivo `web/src/lib/i18n/es.ts`. |
| Multiusuario | Cada fila lleva `user_id`, aislada por RLS. Perfil pedido **una sola vez** tras el primer login (onboarding). Nada hardcodeado. |
| Registro | **Cerrado**: allowlist de emails. Sin esto, cualquiera que encuentre la URL consume la API key de IA. |
| IA | Modelo con visión, **solo desde el servidor**. La API key nunca llega al navegador. El ID del modelo va en variable de entorno, no hardcodeado. |

### Decisiones abiertas (el agente de Fase 0 aplica el default; yo corrijo si no me gusta)

1. **Gramos por foto.** ONT prohíbe que el modelo estime peso (solo cuenta unidades) y exige que la nutrición salga de la base de datos. Para Macritos: el modelo **sí puede proponer gramos**, marcados como `estimado` y **siempre editables** antes de guardar. La nutrición **nunca** viene del modelo si hay match en la base. *Default: sí.*
2. **Alimento sin match en la base** (milanesa, locro, facturas). *Default:* el modelo sugiere macros por 100 g, se guardan como alimento personalizado con la marca `ia_no_verificado`, editable y reutilizable.
3. **Macros por defecto.** ONT usa 60 % carbos / 25 % grasas / 15 % proteínas. *Default Macritos:* proteína por peso corporal (g/kg), configurable. Ver sección 3.2.

---

## 1. Contratos compartidos (los fija la Fase 0, nadie los rompe después)

Todo lo que cruza fronteras entre agentes vive en `web/docs/contracts.md` y en `web/src/types/`. Un agente que necesite cambiar un contrato abre un PR solo para eso.

### 1.1 Esquema de base de datos (Postgres, migraciones en `web/supabase/migrations/`)

```sql
profiles            -- 1 fila por usuario
  user_id uuid pk references auth.users
  display_name text
  sex text check (sex in ('male','female'))      -- necesario para la fórmula
  birth_date date
  height_cm numeric
  weight_kg numeric                              -- peso actual (se refleja desde weight_logs)
  target_weight_kg numeric null
  activity_level text check (in ('sedentary','low_active','active','very_active'))
  goal text check (in ('lose','maintain','gain'))
  weekly_goal_kg numeric null                    -- ej. -0.5 baja, +0.25 sube
  kcal_adjustment int default 0                  -- ajuste manual
  protein_g_per_kg numeric null                  -- si null, usar % del preset
  macro_split jsonb null                         -- {carbs:0.5, fat:0.3, protein:0.2}
  timezone text default 'America/Argentina/Cordoba'
  onboarding_completed_at timestamptz null       -- null => redirigir al onboarding

weight_logs         (id, user_id, logged_on date, weight_kg, unique(user_id, logged_on))

foods               -- catálogo compartido + alimentos propios
  id uuid pk
  source text      -- 'off' | 'usda' | 'ar_seed' | 'custom' | 'ai_unverified'
  source_id text null
  barcode text null
  name text, brand text null
  kcal_100g, protein_100g, carbs_100g, fat_100g numeric
  fiber_100g, sugar_100g, sodium_mg_100g numeric null
  portions jsonb default '[]'    -- [{label:'1 unidad', grams:60}, ...]
  created_by uuid null           -- null = catálogo compartido
  unique(source, source_id)

intake_entries      -- el diario
  id, user_id, logged_on date, meal_type ('breakfast','lunch','dinner','snack')
  food_id uuid null references foods
  name text                      -- snapshot
  quantity_g numeric             -- siempre en gramos internamente
  kcal, protein_g, carbs_g, fat_g numeric   -- snapshot: editar un alimento NO reescribe el historial
  origin text ('manual','barcode','search','ai_photo','ai_text','recipe','copy')
  is_estimate boolean default false
  created_at

recipes / recipe_items            (Fase 3)
water_logs                        (id, user_id, logged_on, ml)
favorite_foods                    (user_id, food_id)
ai_usage                          (user_id, day date, kind, count, input_tokens, output_tokens)
```

**RLS**: todas las tablas con `user_id` → `using (user_id = auth.uid()) with check (user_id = auth.uid())`. En `foods`: lectura para cualquier autenticado si `created_by is null or created_by = auth.uid()`; escritura solo propia (`created_by = auth.uid()`); el catálogo compartido se escribe con service role desde el servidor.

**Día**: `logged_on` se calcula en la zona horaria del usuario, nunca en UTC (Argentina es UTC-3; una cena a las 23:30 no puede caer en el día siguiente).

### 1.2 Tipos TypeScript clave (`web/src/types/`)

```ts
type Nutrients = { kcal:number; protein_g:number; carbs_g:number; fat_g:number;
                   fiber_g?:number; sugar_g?:number; sodium_mg?:number }
type Food = { id:string; source:FoodSource; name:string; brand?:string; barcode?:string;
              per100g:Nutrients; portions:{label:string; grams:number}[] }
type EntryDraft = { food:Food; quantity_g:number; meal_type:MealType; origin:Origin; is_estimate:boolean }
type UserProfile = { sex; birthDate; heightCm; weightKg; activityLevel; goal; weeklyGoalKg?; ... }
type DailyTargets = { kcal:number; protein_g:number; carbs_g:number; fat_g:number }
type PhotoItem = { query:string; est_grams:number|null; count?:number; confidence:'low'|'med'|'high' }
```

### 1.3 Funciones/APIs contractuales

- `computeTargets(profile: UserProfile): DailyTargets` — función pura (Fase 1-B).
- `POST /api/foods/search?q=` y `GET /api/foods/barcode/:code` → `Food[]` / `Food | null` (Fase 1-C).
- `POST /api/ai/photo` (multipart, imagen) → `{ items: PhotoItem[] }`. `POST /api/ai/text` ({text}) → igual (Fase 2-H).
- `addEntry(draft: EntryDraft, date: string)` y `updateEntry`, `deleteEntry` — Server Actions (Fase 2-F). El flujo de agregar alimento (2-G) y la IA (2-H) **solo** llaman a `addEntry`, nunca escriben directo a la base.
- Componente `<FoodPicker onSelect={(food)=>…} />` y `<PortionSheet food onConfirm={(EntryDraft)=>…} />` (Fase 2-G).

---

## 2. Mapa de fases y paralelismo

```
Fase 0  Bootstrap + contratos ............ 1 agente   (bloqueante, corto)
Fase 1  Fundaciones ...................... 4 agentes en paralelo  (A, B, C, D)
Fase 2  Núcleo funcional (MVP) ........... 4 agentes en paralelo  (E, F, G, H)
Fase 3  Paridad con Fitia ................ 4 agentes en paralelo  (I, J, K, L)
Fase 4  Endurecimiento y entrega ......... 3 agentes en paralelo  (M, N, O)
```

**Regla de t3 code:** un agente = un git worktree = una rama `feat/<id>-<nombre>`. Cada agente toca **solo** los archivos de su columna "Dueño de". Si necesita algo fuera, lo pide cambiando el contrato en un PR aparte.

**Orden de merge Fase 1:** A → B → C → D (D puede ir en cualquier momento). **Fase 2** arranca cuando A y B están mergeados; C y D pueden terminar durante la Fase 2 si los contratos están fijos (los agentes usan mocks de la interfaz).

---

## 3. Fases en detalle

### FASE 0 — Bootstrap y contratos (1 agente, ~medio día)

**Rama:** `feat/0-bootstrap`

Tareas:
1. Crear `web/` con Next.js (App Router, TS estricto, Tailwind, ESLint, Prettier), Vitest, Playwright instalado (sin tests aún).
2. Crear `web/AGENTS.md` con las reglas: TS estricto, sin `any`, cada función de cálculo con test, textos solo en `i18n/es.ts`, ningún secreto en el cliente, nada de lógica de negocio en componentes.
3. Inicializar Supabase CLI (`web/supabase/`), `config.toml`, `.env.example` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`, `AI_DAILY_PHOTO_LIMIT`, `ALLOWED_EMAILS`).
4. Escribir `web/docs/contracts.md` con la sección 1 de este documento (esquema, tipos, firmas) y crear los archivos `web/src/types/*.ts`.
5. CI (GitHub Actions): `lint`, `typecheck`, `vitest`, `build`.
6. Estructura de carpetas (esto define los "dueños" de la sección 4).

**Aceptación:** `pnpm dev` levanta, `pnpm test` y `pnpm build` pasan en CI, `contracts.md` revisado por mí.

---

### FASE 1 — Fundaciones (4 agentes en paralelo)

#### 1-A · Base de datos, Auth y aislamiento multiusuario
**Rama:** `feat/1a-db-auth` · **Dueño de:** `web/supabase/**`, `web/src/lib/supabase/**`, `web/src/app/(auth)/**`, `web/src/middleware.ts`

1. Migraciones con todo el esquema de 1.1, índices (`intake_entries(user_id, logged_on)`, `foods(barcode)`, `foods` con `pg_trgm` para búsqueda por nombre).
2. RLS completa según 1.1.
3. Trigger `on auth.users insert` → crea fila vacía en `profiles`.
4. **Allowlist de registro**: bloquear signup si el email no está en `ALLOWED_EMAILS` (hook de Auth o chequeo en Server Action + desactivar signups públicos en Supabase).
5. Páginas: login, registro, recuperar contraseña, logout. Email + contraseña; Google OAuth opcional.
6. `middleware.ts`: sin sesión → `/login`; con sesión y `onboarding_completed_at is null` → `/onboarding`.
7. Clientes Supabase (browser, server, service-role) con `@supabase/ssr`.

**Aceptación (obligatorio, test automático):** dos usuarios de prueba; el usuario B **no puede** leer, insertar ni modificar filas del usuario A en ninguna tabla (pgTAP o test de integración). Un email fuera de la allowlist no puede registrarse.

#### 1-B · Librería de cálculo nutricional (pura, sin UI ni DB)
**Rama:** `feat/1b-nutrition-core` · **Dueño de:** `web/src/lib/nutrition/**`

Portar desde el código Dart (referencia en la raíz del repo): `lib/core/utils/calc/tdee_calc.dart`, `pal_calc.dart`, `calorie_goal_calc.dart`, `macro_calc.dart`, `bmi_calc.dart`, `unit_calc.dart`, y `docs/tdee-iom-2005-verification.md` (vectores de prueba).

Fórmulas (IOM 2005, ya verificadas en ONT):

```
Hombre:  TEE = 864  − 9.72·edad  + PA·(14.2·peso_kg + 503·altura_m)
Mujer:   TEE = 387  − 7.31·edad  + PA·(10.9·peso_kg + 660.7·altura_m)
```

Atención: **PA multiplica todo el paréntesis** (peso y altura). ONT tuvo un bug por quitar esos paréntesis (issue #987) que subestimaba 109–489 kcal/día.

```
PAL por nivel:  sedentary 1.25 · low_active 1.5 · active 1.75 · very_active 2.2
PA según PAL:   <1.4 → 1.0
                <1.6 → 1.12 (H) / 1.14 (M)
                <1.9 → 1.27
                ≥1.9 → 1.54 (H) / 1.45 (M)
Meta kcal = TEE + ajuste_objetivo + ajuste_manual
Ajuste objetivo: si hay weekly_goal_kg → weekly_goal_kg × 1100 kcal/día
                 si no: lose −500 · maintain 0 · gain +500
Macros: carbos/proteína 4 kcal/g, grasa 9 kcal/g
```

Tareas:
1. Funciones puras: `calcAge`, `calcTee`, `calcTargets`, `splitMacros` (modo % y modo g/kg de proteína), `bmi`, conversiones de unidades.
2. **Pisos de seguridad** (mejora sobre ONT): la meta nunca baja de un mínimo configurable (default 1200 kcal mujer / 1500 hombre) y se avisa en pantalla si el objetivo semanal lo fuerza.
3. Tests con vectores del documento de verificación de ONT + casos borde (edad límite, pesos extremos, objetivo semanal inválido).

**Aceptación:** cobertura ≥ 95 % del módulo; los resultados coinciden con ONT en los vectores de referencia.

#### 1-C · Capa de datos de alimentos
**Rama:** `feat/1c-food-data` · **Dueño de:** `web/src/lib/foods/**`, `web/src/app/api/foods/**`

1. Cliente **Open Food Facts** (búsqueda por texto y por código de barras; referencia en `lib/core/utils/off_const.dart`). Normalizar a `Food`, descartar productos sin kcal/macros, enviar `User-Agent` propio.
2. Cliente **USDA FoodData Central** para alimentos genéricos (CC0). Normalizar a `Food`.
3. **Seed de alimentos argentinos** (`ar_seed`): script que carga ~150 alimentos básicos locales (milanesa, empanada, asado, mate cocido, facturas, dulce de leche, fideos, etc.) con porciones caseras. Fuente: tabla oficial ARGENFOODS / datos reales de etiquetas; cada fila con su `source` documentado. Los valores se marcan para que yo los revise.
4. Endpoints `GET /api/foods/search` y `GET /api/foods/barcode/[code]`: primero la tabla `foods` local (cache), después OFF/USDA, guardando lo que se usa en `foods` para la próxima vez. Ranking: favoritos y recientes del usuario → `ar_seed` → resto.
5. Debounce y rate limit por usuario; timeouts y fallback si OFF está caído.

**Aceptación:** buscar "milanesa", "leche entera" y un código de barras argentino real devuelve resultados normalizados; segunda búsqueda sale de la cache.

#### 1-D · Shell PWA y sistema de diseño
**Rama:** `feat/1d-pwa-shell` · **Dueño de:** `web/src/app/layout.tsx`, `web/src/components/ui/**`, `web/src/app/manifest.ts`, `web/public/**`, `web/src/sw.ts`

1. Serwist: service worker, precache del shell, página offline.
2. Manifest (nombre Macritos, íconos 192/512/maskable, `display: standalone`, colores), instalable en Android y iOS.
3. Navegación inferior móvil-first (Hoy · Agregar · Progreso · Perfil), tema claro/oscuro, componentes base (Button, Sheet, Dialog, Input numérico, ProgressRing, MacroBar, Toast, Skeleton).
4. Rendimiento desde el día 1: fuentes del sistema o una sola fuente variable, cero librerías pesadas, rutas con carga diferida.
5. **Guía de instalación para iPhone**: iOS no muestra aviso de instalación (no existe `beforeinstallprompt`). Detectar iOS Safari fuera de modo standalone y mostrar un banner/pantalla con los pasos (Compartir → Añadir a pantalla de inicio). En Android usar el evento `beforeinstallprompt` con botón "Instalar".

**Aceptación:** Lighthouse PWA instalable, Performance ≥ 90 en la página de login; se instala en el teléfono.

---

### FASE 2 — Núcleo funcional / MVP (4 agentes en paralelo)

Requiere A y B mergeados. Si C o D no terminaron, usar mocks de sus interfaces.

#### 2-E · Onboarding y perfil
**Rama:** `feat/2e-onboarding` · **Dueño de:** `web/src/app/onboarding/**`, `web/src/app/(app)/profile/**`, `web/src/features/profile/**`

1. Wizard de pasos cortos, **una sola vez**: sexo, fecha de nacimiento, altura, peso, nivel de actividad (con descripción clara de cada uno), objetivo (bajar/mantener/subir), ritmo semanal, peso objetivo opcional, preset de macros.
2. Pantalla final con la **meta calculada en vivo** (usa `computeTargets`) y desglose: TEE, ajuste, meta, macros. Botón confirmar → guarda y setea `onboarding_completed_at`.
3. Pantalla de perfil: editar cualquier dato; al cambiar, la meta se recalcula automáticamente. Registrar peso (guarda en `weight_logs` y actualiza `profiles.weight_kg`).
4. Ningún valor por defecto de calorías/macros en el código: todo sale de `profiles`.

**Aceptación:** usuario nuevo → login → onboarding → diario con su meta. Usuario existente nunca vuelve a ver el onboarding. Dos usuarios con perfiles distintos ven metas distintas.

#### 2-F · Diario (pantalla Hoy)
**Rama:** `feat/2f-diary` · **Dueño de:** `web/src/app/(app)/page.tsx`, `web/src/features/diary/**`

1. Vista del día: anillo de kcal restantes, barras de macros, secciones por comida (desayuno, almuerzo, merienda/snack, cena) con sus entradas.
2. Navegar entre días (swipe y selector); respetar la zona horaria del perfil.
3. Server Actions `addEntry`, `updateEntry`, `deleteEntry` (contrato 1.3) con validación (zod).
4. Editar cantidad de una entrada, borrar con deshacer, copiar entrada/comida/día completo a otra fecha.
5. Quick-add de calorías sin alimento (solo kcal y macros opcionales).
6. Entradas con `is_estimate` se muestran con indicador "~".

**Aceptación:** crear, editar, borrar y copiar entradas; los totales coinciden exactamente con la suma de snapshots; usuario B no ve nada de A.

#### 2-G · Flujo de agregar alimento
**Rama:** `feat/2g-add-food` · **Dueño de:** `web/src/app/(app)/add/**`, `web/src/features/add-food/**`

1. `<FoodPicker>`: buscador con resultados (recientes y favoritos arriba), estados de carga/error/vacío.
2. **Escáner de códigos de barras**: `BarcodeDetector` nativo cuando existe; fallback con `barcode-detector` (polyfill WASM) para iOS Safari. Entrada manual del código como respaldo. Cámara trasera, permisos claros.
3. `<PortionSheet>`: elegir cantidad en gramos o porciones (`portions`), vista previa de kcal/macros en vivo, elegir comida del día.
4. Crear/editar **alimento personalizado** (propio del usuario) y duplicar uno del catálogo para corregirlo.
5. Favoritos.

**Aceptación:** buscar → elegir → ajustar porción → aparece en el diario. Escanear un código real agrega el producto. Funciona en Android Chrome e iOS Safari instalada.

#### 2-H · IA por foto y por texto
**Rama:** `feat/2h-ai-photo` · **Dueño de:** `web/src/lib/ai/**`, `web/src/app/api/ai/**`, `web/src/features/ai-photo/**`

Referencia de diseño (leer antes): `lib/features/add_meal/domain/meal_items_api.dart` (esquema de herramienta, validación contra respuestas del modelo que ignoran el esquema), `data/model_meal_photo_interpreter.dart` y `model_meal_text_interpreter.dart` (system prompts), `docs/ai-architecture.md`.

Principios heredados de ONT (**se mantienen**):
- Salida por *tool use* con esquema JSON; **validar en el servidor** la respuesta aunque el modelo ignore el esquema (descartar ítems mal formados, normalizar unidades y evitar errores 1000× como litros leídos como ml).
- Interfaz de proveedor intercambiable (`AiProvider.analyze(content, system)`), con Anthropic como default; agregar otro proveedor no debe tocar el esquema.
- La nutrición sale de la base de datos, no del modelo.

Desvío deliberado (decisión abierta 1 y 2):
- El modelo devuelve por ítem `query` (nombre del alimento en español), `est_grams` (estimado) o `count`, y `confidence`.
- Cada `query` se resuelve contra `/api/foods/search` priorizando `ar_seed` y alimentos del usuario. Si no hay match razonable → crear alimento `ai_unverified` con macros por 100 g sugeridas por el modelo, claramente marcado.

Tareas:
1. `POST /api/ai/photo`: requiere sesión; límite de tamaño (≤ 2 MB); límite diario por usuario (`AI_DAILY_PHOTO_LIMIT`, tabla `ai_usage`); la imagen **no se guarda** en ningún lado; se quita EXIF.
2. Cliente: capturar con `<input capture>` / cámara, **reducir a ~1024 px y JPEG q≈0.8 en el navegador** antes de subir (costo y latencia).
3. System prompt en español rioplatense: identificar alimentos visibles, platos compuestos como una sola entrada, no inventar recetas, devolver lista vacía si no hay comida, usar referencias de escala del plato cuando existan para estimar gramos, y siempre declarar `confidence`.
4. **Pantalla de revisión**: lista de ítems detectados con gramos editables, quitar ítems, agregar uno olvidado, cambiar el alimento matcheado; recién al confirmar se llama a `addEntry` con `origin='ai_photo'` e `is_estimate=true`.
5. `POST /api/ai/text`: "2 milanesas con puré y una coca" → mismos ítems y misma pantalla de revisión (barato y muy útil).
6. Manejo de errores: sin cuota, proveedor caído, foto sin comida, timeout; mensajes claros.
7. Registrar tokens usados en `ai_usage` para ver el costo real.

**Aceptación:** 10 fotos de comidas reales mías (incluyendo comida argentina) → resultados razonables y editables; ninguna respuesta del modelo con campos inesperados rompe la app (test con respuestas malformadas simuladas); superar el límite diario devuelve error controlado.

**Hito MVP al terminar la Fase 2:** login → onboarding único → meta personalizada → registrar comidas por búsqueda, código de barras, texto o foto → diario con totales. Ya es usable todos los días.

---

### FASE 3 — Paridad con Fitia (4 agentes en paralelo)

#### 3-I · Progreso y tendencias
**Rama:** `feat/3i-progress` · **Dueño de:** `web/src/app/(app)/progress/**`, `web/src/features/progress/**`
Gráfico de peso con media móvil (referencia: `weight_moving_average.dart`), promedio semanal de kcal vs meta, adherencia, racha de días registrados, resumen de macros por semana/mes. Gráficos livianos (SVG propio o librería mínima). Leer el skill de dataviz antes de diseñar.

#### 3-J · Recetas y comidas guardadas
**Rama:** `feat/3j-recipes` · **Dueño de:** `web/src/app/(app)/recipes/**`, `web/src/features/recipes/**`
Crear recetas (ingredientes + gramos → macros por porción, número de porciones), usarlas como alimento, guardar "comidas frecuentes" (combos), repetir comida de ayer / de la semana pasada con un toque. Importar/duplicar recetas.

#### 3-K · Micronutrientes, agua y objetivos finos
**Rama:** `feat/3k-nutrients` · **Dueño de:** `web/src/features/nutrients/**`, `web/src/features/water/**`
Panel de fibra, azúcares y sodio con referencia diaria; registro de agua con meta; editar distribución de macros (porcentajes o g/kg) desde el perfil con vista previa; opción de ajuste manual de kcal (+/−) con explicación.

#### 3-L · Asistente de plan y recordatorios (lo más parecido a Fitia)
**Rama:** `feat/3l-assistant` · **Dueño de:** `web/src/features/assistant/**`, `web/src/app/api/ai/plan/**`
1. "¿Qué cenar para llegar a mis macros?": con lo que falta del día, la IA propone 2–3 opciones concretas usando alimentos de `ar_seed` y del historial del usuario; cada opción se agrega al diario con un toque. Mismos principios: la nutrición sale de la base.
2. Plan de comidas del día/semana (opcional, mismo límite diario de uso de IA).
3. Recordatorios con Web Push (en iOS requiere PWA instalada); configurables por comida y desactivables.

---

### FASE 4 — Endurecimiento y entrega (3 agentes en paralelo)

#### 4-M · Offline y rendimiento
**Rama:** `feat/4m-offline-perf` — Cola offline en IndexedDB para registrar comidas sin conexión y sincronizar al volver (resolución de conflictos simple: gana la última edición). **No depender de Background Sync** (iOS no lo soporta): sincronizar al abrir la app y al recuperar conexión (`online` event). **La fuente de verdad es siempre Supabase**; el almacenamiento local de iOS puede borrarse tras días sin uso, así que solo es cola temporal y cache; cache de recientes/favoritos; presupuesto de rendimiento (Lighthouse ≥ 90 en todas las rutas principales, bundle inicial < 200 KB gz si es posible); skeletons en lugar de spinners.

#### 4-N · Calidad y seguridad
**Rama:** `feat/4n-qa-security` — Suite E2E con Playwright: (1) flujo completo de usuario nuevo, (2) **test de aislamiento con dos usuarios** en el navegador, (3) agregar por búsqueda/código/foto simulada, (4) cambio de día cerca de medianoche en zona horaria Argentina. Revisión de RLS, cabeceras de seguridad (CSP), validación zod en todas las Server Actions y Route Handlers, auditoría de que ningún secreto llega al bundle del cliente.

#### 4-O · Datos, deploy y operación
**Rama:** `feat/4o-deploy` — Exportar mis datos (CSV/JSON) e importar; backup (export programado o `pg_dump` documentado); despliegue en Vercel + proyecto Supabase de producción con variables; dominio opcional; tope de gasto de IA (límite diario por usuario + alerta en el proveedor); `README` de operación (cómo agregar un email a la allowlist, cómo rotar la API key).

---

## 4. Matriz de dueños de archivos (evita conflictos de merge)

| Agente | Directorios propios |
|---|---|
| 0 | `web/` (raíz de config), `web/docs/`, `web/src/types/` |
| 1-A | `supabase/**`, `src/lib/supabase/**`, `src/app/(auth)/**`, `src/middleware.ts` |
| 1-B | `src/lib/nutrition/**` |
| 1-C | `src/lib/foods/**`, `src/app/api/foods/**` |
| 1-D | `src/components/ui/**`, `src/app/layout.tsx`, `src/sw.ts`, `public/**` |
| 2-E | `src/app/onboarding/**`, `src/app/(app)/profile/**`, `src/features/profile/**` |
| 2-F | `src/app/(app)/page.tsx`, `src/features/diary/**` |
| 2-G | `src/app/(app)/add/**`, `src/features/add-food/**` |
| 2-H | `src/lib/ai/**`, `src/app/api/ai/**`, `src/features/ai-photo/**` |
| 3-I a 3-L | su propia carpeta en `src/features/<nombre>/` y su ruta |
| 4-M/N/O | transversales: coordinar con PR chicos y rebase frecuente |

Los textos nuevos se agregan a `i18n/es.ts` (archivo compartido: cada agente solo agrega claves bajo su propio prefijo, para que los merges no choquen).

## 5. Definición de "hecho" (para todo PR)

1. `lint`, `typecheck`, `test`, `build` en verde.
2. Tests de la lógica nueva; ningún cálculo sin test.
3. Sin `any`, sin secretos en el cliente, sin textos fuera de `i18n`.
4. Validación de entrada (zod) en toda frontera de red.
5. Si toca datos de usuario: probado que otro usuario no puede verlos.
6. Descripción del PR con qué cambió, cómo probarlo y capturas si hay UI.

## 6. Riesgos conocidos

| Riesgo | Mitigación |
|---|---|
| La base de alimentos no cubre comida argentina | Seed `ar_seed` (1-C), alimentos personalizados (2-G), `ai_unverified` editable (2-H) |
| Gramos estimados por foto poco precisos | Siempre editables, marcados "~", revisión obligatoria antes de guardar |
| Costo de IA se dispara | Límite diario por usuario, imagen reducida en el cliente, registro de tokens, modelo chico por defecto |
| Registro abierto consume la API key | Allowlist de emails + signups públicos desactivados |
| iOS Safari y APIs de PWA (escáner, push) | Polyfill de `BarcodeDetector`, push solo con PWA instalada, probar en iPhone real |
| Meta de calorías insegura | Pisos de seguridad, desglose visible del cálculo, aviso si el ritmo semanal es agresivo |
| Aviso: esto no es una herramienta médica | Texto visible en el onboarding: las metas son estimaciones; ante condiciones de salud consultar a un profesional |

## 7. Plantilla de prompt para cada agente

```
Sos el agente <ID>. Trabajás en el repo del fork de OpenNutriTracker, carpeta web/.
Rama: feat/<id>-<nombre>, en tu propio worktree.
Leé primero: web/AGENTS.md, web/docs/contracts.md y la sección "<ID>" de PLAN_MACRITOS.md.
Solo podés modificar los archivos de tu columna "Dueño de". Si necesitás cambiar un contrato, hacelo en un PR aparte.
La referencia de lógica es el código Dart en la raíz del repo (solo lectura).
Terminás cuando se cumplen los criterios de aceptación de tu tarea y la definición de "hecho" (sección 5).
Al terminar, resumí: qué hiciste, qué decisiones tomaste, qué quedó pendiente.
```
