# Datos de alimentos (`src/lib/foods/`, `/api/foods/*`)

## Endpoints

| Endpoint                       | Respuesta                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------ |
| `GET /api/foods/search?q=`     | `Food[]` (hasta 20). Header `X-Foods-Degraded: 1` si una fuente externa falló. |
| `GET /api/foods/barcode/:code` | `Food` o `null` (producto desconocido o sin datos completos).                  |

Errores: `{ "error": code }` con `unauthorized` (401), `rate_limited` (429, con `Retry-After`), `invalid_query` / `invalid_barcode` (400), `sources_unavailable` (503), `internal` (500). El cliente traduce los códigos a textos.

`contracts.md` y el plan nombran `POST` para la búsqueda en un lugar y `GET` en otro; se implementó `GET` (idempotente, sin cuerpo).

## Flujo de búsqueda

1. **Catálogo local** (`search_foods`, función de Postgres con RLS): ignora acentos y mayúsculas, escapa comodines y devuelve si es favorito y cuándo se usó por última vez.
2. Si hay **menos de 8** coincidencias locales, se consulta en paralelo **Open Food Facts** (Search-a-licious; si cae, el buscador clásico) y **USDA** (solo `Foundation` y `SR Legacy`; se omite sin `USDA_API_KEY`). Cada fuente tiene timeout de 6 s.
3. Se juntan sin duplicados y se ordenan: **favoritos y recientes** → **ar_seed y alimentos propios** → resto. Dentro de cada grupo, relevancia textual primero; en el resto, vendidos en Argentina y más populares primero.
4. De los resultados externos solo se **guardan** los que llegan a mostrarse (hasta 20) en `foods` con `created_by = null`, usando service role. Así la próxima vez salen del catálogo local y tienen el `id` que necesita `addEntry`.
5. Si fallan todas las fuentes y no hay nada local: 503. Si falla alguna pero hay resultados: se devuelven marcados como degradados.

## Normalización

- **OFF**: nombre en español si existe; kcal de `energy-kcal_100g` (o kJ ÷ 4.184); sodio de `sodium_100g` × 1000 (o sal ÷ 2.5); porción de `serving_quantity`. Se descartan los productos sin código, nombre, kcal o alguno de los tres macros.
- **USDA**: energía por número de nutriente 208 (o Atwater 958/957, o kJ 268). Sin porciones (la búsqueda no las trae).
- Ambos descartan valores imposibles: kcal fuera de 0–900 por 100 g, un macro fuera de 0–100 g o macros que suman más de 105 g.

## Código de barras

`normalizeBarcode` acepta EAN-8, UPC-A, EAN-13 y GTIN-14, valida el dígito verificador y lleva todo a EAN-13 (UPC-A y GTIN-14 con 0 adelante). Un código mal tipeado da `invalid_barcode` en vez de buscar en balde. Primero se busca en el catálogo local (gana la versión corregida por el usuario) y recién después en OFF.

## Límite de uso

30 pedidos por minuto por usuario y endpoint, en memoria. En serverless cada instancia cuenta por separado: frena abusos y bucles del cliente, pero no es un límite global exacto.

## Limitaciones conocidas

- **USDA está en inglés**: una búsqueda en español ("leche entera") no encuentra nada ahí. El español lo cubren OFF y `ar_seed`.
- Las búsquedas con pocas coincidencias reales (por ejemplo 3 resultados) consultan las fuentes externas cada vez, porque no hay caché por consulta; solo salen directo del catálogo las que tienen 8 o más.
- Los clientes se verificaron contra las APIs reales el 2026-10-30 (búsqueda y código de barras de OFF, búsqueda de USDA); los tests usan respuestas simuladas con esas formas. El buscador clásico de OFF estaba caído ese día, así que su forma de respuesta no se pudo comprobar.

## Alimentos argentinos (`ar_seed`)

La fuente es la tabla **ARGENFOODS** de la Universidad Nacional de Luján. Ver [`argenfoods.md`](argenfoods.md): cómo se carga, qué cubre y las condiciones de uso.
