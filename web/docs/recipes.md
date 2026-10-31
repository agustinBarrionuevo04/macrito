# Recetas y comidas frecuentes (`/recipes`)

Código en `src/features/recipes/`. Pantallas: `src/app/(app)/recipes/` (lista, nueva, editar). Los atajos para cargar
(repetir y comidas frecuentes) están en la pestaña **Buscar** de `/add`.

## Dos tipos

|                      | Receta                                                                                | Comida frecuente (combo)                                                    |
| -------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Qué es               | Ingredientes con gramos, número de porciones y peso final opcional                    | Lista de alimentos con gramos que se agregan juntos                         |
| Cómo se usa          | Como **un alimento más**: se busca, se elige y se registra en gramos o en "1 porción" | Un toque en `/add`: agrega **una entrada por alimento** a la comida elegida |
| Origen de la entrada | `recipe`                                                                              | `recipe`                                                                    |

## Cómo funciona una receta

- Al guardar se **materializa un alimento propio** (`source = custom`, `foods.created_by` = usuario) con los valores por 100 g y
  una porción **"1 porción"**. Así reutiliza todo el flujo existente (búsqueda, cantidad, `addEntry`) sin código aparte.
- Valores por 100 g = suma de los ingredientes ÷ **peso final** (si lo informás, porque cocinar pierde o gana agua) o ÷ suma de
  los gramos crudos. Una porción pesa ese peso ÷ porciones. Los totales se suman en centésimas enteras (sin ruido decimal).
- Se rechaza una receta con valores imposibles (por ejemplo, un peso final muy bajo que da más de 900 kcal por 100 g).
- **Snapshot por ingrediente:** cada ingrediente guarda su nombre y sus valores por 100 g. Editar o borrar el alimento original
  **no cambia la receta**; y editar una receta no cambia las entradas ya registradas (guardan su propio snapshot).
- `addEntry` detecta si el alimento pertenece a una receta y fuerza `origin = 'recipe'` (el cliente no lo sabe).
- **El alimento de una receta no se edita a mano** (`updateCustomFood` lo rechaza): se calcula de los ingredientes y editarlo
  lo desincronizaría. Se edita la receta.

## Repetir una comida

En `/add`, "Repetir una comida o usar una frecuente": elegís la comida y tocás **Ayer** o **Semana pasada** (respecto del día que
estás cargando; muestra cuántas entradas hay y deshabilita lo que no existe). Usa `copyEntries` con alcance `meal`, o sea que
las copias quedan con origen `copy` y conservan el orden.

## Guardar una comida como frecuente

En el diario, cada comida con entradas tiene **"Guardar como frecuente"**. Los valores por 100 g de cada alimento se derivan de la
entrada (nutrición ÷ gramos). Las **calorías rápidas** (sin cantidad) no se pueden guardar y se saltean.

## Compartir

**Copiar para compartir** deja en el portapapeles un texto JSON versionado (`macritos: 1`) sin ids, y **Importar** lo lee en
cualquier cuenta. Lo importado se valida igual que una receta nueva (largos, rangos, hasta 40 ingredientes, hasta 30.000
caracteres): nada del texto se confía. **Duplicar** crea "Copia de …" con los mismos ingredientes.

## Datos

- Tablas `recipes` y `recipe_items` (migración `20261030190000`), con RLS por `user_id`.
- **`save_recipe`** y **`delete_recipe`** (funciones SQL, `security invoker`): guardan la receta, sus ingredientes y su alimento en
  **un solo paso atómico**, y borran todo junto. Los valores por 100 g de la receta los calcula la aplicación (`nutrition.ts`, con
  tests) y la función solo los persiste.
- Los valores por ingrediente los manda el cliente como snapshot (son datos propios, equivalentes a crear un alimento propio).

## Pruebas

- Cálculo de la receta (con ejemplos a mano), importar/exportar, esquemas, lectura de filas.
- Acciones contra el Supabase en memoria (con `rpc` simulada): cálculo en el servidor, validaciones, errores sin filtrar detalles.
- pgTAP (`recipes.test.sql`): creación, edición sin duplicar, combo sin alimento, validaciones, aislamiento entre usuarios, borrado.
- jsdom: editor (valores en vivo, guardar, quitar, eliminar con confirmación, duplicar, copiar), panel de repetir/combos, importar.
- Chromium (Pixel 7): crear, usar como alimento (origen `recipe`), editar sin tocar el historial, duplicar, copiar/importar,
  combo desde el diario, repetir ayer y eliminar.
