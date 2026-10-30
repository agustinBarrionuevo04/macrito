# Contratos compartidos

Todo lo que cruza fronteras entre agentes vive acá y en `src/types/`. Nadie los rompe después de la Fase 0. Quien necesite cambiar un contrato abre un PR solo para eso.

Fuente: sección 1 de `plans/PLAN_MACRITOS.md`.

## 1. Esquema de base de datos

Postgres, migraciones en `web/supabase/migrations/`.

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

**RLS.** Todas las tablas con `user_id`: `using (user_id = auth.uid()) with check (user_id = auth.uid())`. En `foods`: lectura para cualquier autenticado si `created_by is null or created_by = auth.uid()`; escritura solo propia (`created_by = auth.uid()`); el catálogo compartido se escribe con service role desde el servidor.

**Día.** `logged_on` se calcula en la zona horaria del usuario, nunca en UTC (Argentina es UTC-3; una cena a las 23:30 no puede caer en el día siguiente).

## 2. Tipos TypeScript

Definidos en `src/types/` (importar desde `@/types`).

| Tipo                                                                        | Archivo      |
| --------------------------------------------------------------------------- | ------------ |
| `Nutrients`, `Food`, `Portion`, `FoodSource`, `MealType`, `Origin`          | `food.ts`    |
| `EntryDraft`                                                                | `entry.ts`   |
| `UserProfile`, `DailyTargets`, `Sex`, `ActivityLevel`, `Goal`, `MacroSplit` | `profile.ts` |
| `PhotoItem`, `PhotoResult`, `Confidence`                                    | `ai.ts`      |

Convenciones: los tipos de nutrición usan `snake_case` (`protein_g`) como en el plan; `UserProfile` usa `camelCase`. Las fechas son `string` ISO `YYYY-MM-DD`.

`UserProfile` en el plan termina en `...`: se completó con las columnas de `profiles` (`displayName`, `targetWeightKg`, `kcalAdjustment`, `proteinGPerKg`, `macroSplit`, `timezone`).

## 3. Funciones y APIs contractuales

| Contrato                                                                                   | Dueño |
| ------------------------------------------------------------------------------------------ | ----- |
| `computeTargets(profile: UserProfile): DailyTargets` — función pura                        | 1-B   |
| `POST /api/foods/search?q=` → `Food[]`                                                     | 1-C   |
| `GET /api/foods/barcode/:code` → `Food \| null`                                            | 1-C   |
| `POST /api/ai/photo` (multipart, imagen) → `{ items: PhotoItem[] }`                        | 2-H   |
| `POST /api/ai/text` (`{ text }`) → `{ items: PhotoItem[] }`                                | 2-H   |
| `addEntry(draft: EntryDraft, date: string)`, `updateEntry`, `deleteEntry` — Server Actions | 2-F   |
| `<FoodPicker onSelect={(food) => …} />`                                                    | 2-G   |
| `<PortionSheet food onConfirm={(draft: EntryDraft) => …} />`                               | 2-G   |

El flujo de agregar alimento (2-G) y la IA (2-H) **solo** llaman a `addEntry`; nunca escriben directo a la base.

## 4. Puntos abiertos

Huecos detectados al escribir los tipos. No se resolvieron por suposición: están pendientes de decisión.

1. `updateEntry` y `deleteEntry`: el plan no fija firmas ni tipo de retorno de las tres Server Actions.
2. Quick-add de kcal sin alimento (2-F): `EntryDraft` exige `food: Food`, pero el quick-add no tiene alimento.
3. Alimento sin match (decisión abierta 2): `PhotoItem` no tiene campo para las macros por 100 g que sugiere el modelo.
4. Desglose del onboarding (2-E): pide mostrar TEE y ajuste, pero `computeTargets` devuelve solo `DailyTargets`. Lo mismo para el aviso de piso de seguridad (1-B).
5. Macros por defecto (decisión abierta 3): el plan remite a una "sección 3.2" que no existe.
