# Diario (pantalla Hoy)

Código en `src/features/diary/`. Pantalla: `src/app/(app)/page.tsx`.

## Reglas

- **Día**: se calcula en la zona horaria del usuario (`todayInTimeZone`), nunca en UTC. La URL es la fuente
  de verdad: `/` es hoy y `/?date=AAAA-MM-DD` otro día. `resolveDay` trata una fecha inválida o futura como hoy.
- **Navegación**: botones anterior/siguiente, deslizamiento horizontal (≥ 60 px y más horizontal que vertical)
  y selector de fecha (`max` = hoy). La interfaz no navega al futuro; el servidor sí acepta cualquier fecha
  válida entre 2000 y 2100.
- **Snapshot**: cada entrada guarda sus kcal y macros ya calculados. Editar o borrar un alimento no cambia
  el historial.
- **`~`**: las entradas con `is_estimate` (IA) se marcan con `~`.
- **Meta**: `computeTargets(perfil)`. Si no se puede calcular, se muestra lo consumido y un aviso.

## Acciones (`actions.ts`, server actions)

Todas devuelven `{ ok: true, … } | { ok: false, error }` (error ya traducido). Validan con zod, exigen sesión
y dependen de la RLS para no tocar filas ajenas.

| Acción                                                                        | Qué hace                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `addEntry(draft, date)`                                                       | Carga el alimento **de la base por `food.id`** y calcula el snapshot en el servidor. Lo que mande el cliente aparte del id (valores nutricionales) se ignora.                                                |
| `addQuickEntry({name?, kcal, protein_g?, carbs_g?, fat_g?, meal_type}, date)` | `origin='manual'`, `food_id=null`, `quantity_g=0`, `is_estimate=false`.                                                                                                                                      |
| `updateEntry(id, {quantity_g?, meal_type?})`                                  | Reescala kcal/macros **proporcionalmente desde la propia entrada** (no desde el alimento). Las calorías rápidas (cantidad 0) no admiten cambiar la cantidad, sí la comida.                                   |
| `deleteEntry(id)`                                                             | Borra.                                                                                                                                                                                                       |
| `restoreEntry(entrada + day)`                                                 | "Deshacer": vuelve a insertar con los mismos datos (id nuevo) y la misma `created_at`, así queda en el mismo lugar. No hay borrado lógico.                                                                   |
| `copyEntries({source, toDay, toMeal?})`                                       | `source`: una entrada, una comida o un día. Copias con `origin='copy'`; `created_at` = ahora + índice ms para conservar el orden. Comida/día no se copian sobre sí mismos; una entrada sí (con otra comida). |

Límites: cantidad 0 < g ≤ 10.000; calorías rápidas 0 < kcal ≤ 20.000; nombre ≤ 100 caracteres.

## Pruebas

- Lógica pura: `snapshot`, `totals`, `dates`, `lib/ui/swipe`.
- Acciones: contra `src/test-utils/fake-supabase.ts` (Supabase en memoria con RLS emulada por columna dueña).
  La RLS real se prueba con pgTAP.
- Interfaz: tests jsdom de `DiaryView` y `DayPager`.
