# ARGENFOODS (`ar_seed`)

Tabla de composición de alimentos argentinos de la Universidad Nacional de Luján (UNLu): <https://www.argenfood.unlu.edu.ar/>. Todos los valores son por 100 g de porción comestible.

## Condiciones de uso

El sitio reserva todos los derechos a la UNLu y autoriza el uso **sin fines comerciales**, **sin mutilaciones de la obra**, citando a los titulares y la referencia electrónica completa (<https://www.argenfood.unlu.edu.ar/Tablas/Varios/Cond_Uso.htm>). Por eso:

- **Los datos no se guardan en el repo.** Se descargan con un script y se cargan directo a la base. La caché local vive en `web/.local/` (ignorada por Git).
- Se carga **toda la tabla**, no una selección.
- **La atribución es obligatoria** donde se muestren estos alimentos: `es.foods.attribution.argenfoods` (`src/lib/i18n/es.ts`). Está pendiente mostrarla en la interfaz (2-G / 2-E); cualquier pantalla que muestre alimentos `ar_seed` debe incluirla.
- Uso personal y no comercial. Si la app se comercializara, hay que pedir permiso a la UNLu.

## Cargar la tabla

```sh
pnpm db:load-argenfoods              # descarga y genera el reporte; no toca la base
pnpm db:load-argenfoods -- --load    # además carga a `foods` (source = 'ar_seed')
```

`--load` necesita `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en `.env.local`. Es idempotente: se puede repetir y actualiza por `(source, source_id)`. Opciones: `--refresh` (ignora la caché) y `--include-flagged` (también carga los que tienen avisos).

Descarga ~500 páginas con 4 pedidos en paralelo (~30 s la primera vez) y deja el reporte en `.local/argenfoods-report.csv`, con una fila por alimento: código, nombre, estado (`ok`, `revisar`, `omitido`), motivo, notas, valores y URL de la fuente.

## Qué se carga

De los 481 alimentos del índice (tabla actualizada al 12/09/2024 según el sitio):

| Resultado    | Cantidad | Qué pasa                                                                                                                     |
| ------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Se cargan    | 427      | Energía y los tres macros, publicados o completados con las reglas de abajo.                                                 |
| Para revisar | 4        | Las kcal no cierran con proteína/carbohidratos/grasa (Atwater 4/4/9, desvío > 15 %). No se cargan salvo `--include-flagged`. |
| Omitidos     | 50       | Faltan datos que no se pueden deducir (por ejemplo cortes vacunos que solo traen grasa).                                     |

Para cada alimento se guarda: kcal, proteína, carbohidratos, grasa, fibra y sodio. La tabla trae además agua, minerales y vitaminas, que la app no usa todavía. **Los alimentos no traen porciones** (la tabla no las publica): se pesan en gramos.

### Valores en blanco

La tabla deja en blanco lo que no analizó. Ese blanco **no** se toma como 0 sin más. Se completa un valor solo en estos casos, y queda en la columna `notas` del reporte:

- `energy_computed`: falta la energía pero están los tres macros. Se calcula con los factores 4/4/9 que la propia tabla documenta en su anexo.
- `protein_inferred_zero`, `fat_inferred_zero`, `carbs_inferred_zero`: faltan uno o más macros y la energía publicada queda explicada **solo con los macros presentes**, a ±3 kcal (carnes y pescados sin carbohidratos, verduras sin grasa, aceites sin proteína ni carbohidratos). Medido sobre las páginas reales, 146 de 149 casos coinciden a ±2 kcal.
- `carbs_total_only`: la página solo trae "carbohidratos totales" (sin disponibles ni fibra). Se usan los totales, que incluyen la fibra.

Los carbohidratos son los **disponibles** si existen; si no, totales − fibra; si no, totales.

## Qué NO cubre

ARGENFOODS es una tabla de **ingredientes**: vacuno (34 cortes), quesos, huevos, papas, aceites, lácteos, frutas y verduras. No tiene platos preparados ni productos industriales: **milanesa, empanada, facturas, medialunas, fideos, yerba, alfajores, pizza, ñoquis**. Esos salen de Open Food Facts, de los alimentos personalizados y del flujo `ai_unverified` de la fase 2-H.

## Código

- `src/lib/foods/argenfoods.ts`: interpreta las páginas y aplica las reglas (con tests; usa HTML sintético, sin datos de la UNLu).
- `scripts/load-argenfoods.mjs`: descarga, reporte y carga.
