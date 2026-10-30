# Análisis con IA (foto y texto)

Código en `src/lib/ai/` (servidor), `src/app/api/ai/*` y `src/features/ai-photo/` (pantalla de revisión).
Se usa desde las pestañas **Foto** y **Texto** de `/add`.

## Principios

- **La nutrición sale de la base de datos, no del modelo.** El modelo solo nombra los alimentos y estima cantidades.
  Cada nombre se busca en `/api/foods/search` y se toma el primer resultado que contiene casi todas las palabras de la
  consulta (`pickMatch`, 60 %). Orden de la búsqueda: favoritos y recientes → `ar_seed` y propios → resto.
- **Excepción deliberada (decisión del plan):** si no hay un match razonable, el modelo sugiere valores por 100 g
  (`per100g_guess`) y recién **al confirmar** se crea un alimento `ai_unverified` del usuario, marcado "Sin verificar".
  Un valor sugerido nunca pisa a uno de la base.
- **Todo lo que sale de la IA es una estimación:** las entradas se guardan con `origin = ai_photo | ai_text` e
  `is_estimate = true` (el diario las muestra con `~`).
- **Nada se guarda sin confirmar:** la pantalla de revisión permite editar gramos, cambiar el alimento, sacar renglones y
  agregar uno olvidado.
- **La respuesta del modelo no se confía** (aunque ignore el esquema): `parseModelItems` descarta ítems mal formados,
  ignora campos que no están en el contrato (por ejemplo, calorías inventadas), anula gramos imposibles (> 3.000 g por
  ítem, el síntoma típico de un error ×1000) y convierte las unidades que declaró (`1,5 l` → 1.500 g, nunca 1,5 ml).
  Los valores sugeridos tienen que ser plausibles y cerrar con Atwater (4/4/9). Si había ítems y no sobrevivió ninguno es
  un error (`ai_bad_response`); una lista vacía es "no hay comida".

## Respuestas del modelo que no vienen como se pidió

El prompt le exige al modelo responder **solo** con la herramienta, pero no se confía en eso: se aprovecha lo que haya
en la respuesta para no tirar tokens ya pagados (`coerceItemsRoot`, `extractJsonValue`).

- Si llamó a la herramienta, se usa su contenido; si llamó a otra, también.
- Si contestó con **texto**, se busca el JSON ahí (bloque con cercas o el primer objeto/lista balanceado).
- La lista puede venir como **texto JSON**, **suelta**, con **otro nombre** (`foods`, `alimentos`, …) o **anidada** un nivel.
- Cada ítem acepta nombres alternativos (`name`/`nombre` por `query`, `grams`/`gramos` por `est_grams`).
- Todo lo recuperado pasa por la misma validación estricta (gramos, unidades, campos fuera del contrato).
- No se reintenta: un segundo pedido costaría tokens de nuevo. Si no hay nada recuperable, error controlado (`ai_bad_response`, 502).

`max_tokens` es 2048: con varios ítems y sus valores por 100 g, 1024 se quedaba corto y la respuesta llegaba cortada.

## Diagnóstico de errores

Cada error del modelo se registra en el servidor (la terminal donde corre `pnpm dev`) con el código y un detalle **sin
contenido del usuario ni la clave**: para HTTP, el código y el mensaje de la API (`HTTP 400 (invalid_request_error: …)`);
para respuestas inútiles, `stop_reason`, los tipos de bloque y la _forma_ de lo recibido
(`{items: array(3 de {query: string(12)})}`). Con `AI_DEBUG=1` se agrega la respuesta cruda recortada a 800 caracteres.

## Endpoints

| Endpoint             | Entrada                                 | Respuesta                |
| -------------------- | --------------------------------------- | ------------------------ |
| `POST /api/ai/photo` | multipart, campo `image` (JPEG, ≤ 2 MB) | `{ items: PhotoItem[] }` |
| `POST /api/ai/text`  | `{ "text": "…" }` (2–500 caracteres)    | `{ items: PhotoItem[] }` |

Errores `{ "error": code }`: `unauthorized` 401 · `invalid_request` 400 · `too_large` 413 · `unsupported_type` 415 ·
`quota_exceeded` 429 (con `limit`) · `image_rejected` 422 · `ai_bad_response` 502 · `ai_not_configured` / `ai_unavailable`
503 · `ai_timeout` 504 · `internal` 500. El detalle técnico se registra en el servidor y no se devuelve.

## Privacidad de la foto

- **No se guarda en ningún lado.** El servidor la recibe en memoria, la manda al proveedor y la descarta.
- El navegador la reduce a ~1024 px (JPEG, calidad 0,8) antes de subirla; redibujarla en un canvas ya descarta el EXIF.
- **El servidor quita los metadatos de todos modos** (`stripJpegMetadata`): EXIF/GPS, XMP, comentarios e ICC. Se mira el
  contenido (firma JPEG), no el tipo que declara el cliente. Solo se aceptan JPEG.
- A Anthropic le llega la imagen sin metadatos. Ver sus condiciones de retención de datos antes de abrir la app a más gente.

## Límites y costo

- Límite diario por usuario y tipo: `AI_DAILY_PHOTO_LIMIT` (20 por defecto) y `AI_DAILY_TEXT_LIMIT` (100). El "día" es el
  de la zona horaria del perfil.
- **Atómico:** `reserve_ai_usage` (migración `20261030170000`) suma 1 solo si hay cupo, en un único statement; dos pedidos
  simultáneos no pueden pasarse. Solo la puede ejecutar `service_role`: el cliente no puede reiniciar su contador.
- **Cuándo cuenta:** si el proveedor falla antes de devolver una respuesta (caído, timeout, 429, respuesta que no es
  JSON o sin la herramienta) el cupo se libera. Si el modelo respondió pero la respuesta no sirve (`ai_bad_response`) o
  vino vacía, cuenta: se gastaron tokens.
- **Tokens:** se suman en `ai_usage.input_tokens/output_tokens` (`record_ai_tokens`) para ver el costo real. Se registran
  aunque la respuesta no sirva.
- Se valida el pedido (sesión, tamaño, formato) **antes** de reservar cupo: un pedido inválido no consume.

## Proveedor

Interfaz `AiProvider.analyze(content, system)` (`src/lib/ai/types.ts`). Hoy solo Anthropic (`anthropic.ts`): Messages API
con salida forzada por herramienta (`tool_choice`), imagen antes del texto, timeout de 25 s. Agregar otro proveedor no
toca el esquema ni los prompts: se agrega un `case` en `config.ts`.

Variables (solo servidor): `AI_PROVIDER`, `AI_MODEL` (por defecto `claude-sonnet-5-5`), `AI_API_KEY`, `AI_BASE_URL`
(pruebas o proxy), `AI_DAILY_PHOTO_LIMIT`, `AI_DAILY_TEXT_LIMIT`. Sin `AI_API_KEY` el endpoint responde `ai_not_configured`.

## Prompts

`src/lib/ai/prompts.ts`, en español rioplatense. Foto: un ítem por alimento visible, plato compuesto = una entrada,
`count` para lo contable, `est_grams` con referencias de escala (plato, cubiertos), lista vacía si no hay comida. Texto:
no inventar cantidades que la persona no dijo; unidades solo de la lista y sin convertir.

## Pruebas

- Unitarias: validación de la respuesta (tabla de respuestas malformadas), unidades, JPEG sin EXIF, proveedor (HTTP,
  timeout, sin herramienta), configuración, servicio (cupo, liberación, tokens) y rutas.
- pgTAP (`ai_usage.test.sql`): límite atómico, aislamiento por usuario/día/tipo, liberar, tokens y que el cliente no
  pueda llamar a las funciones.
- jsdom: captura, análisis, revisión (editar, quitar, elegir, fallas parciales, alimento sin verificar).
- Chromium (Pixel 7) contra un Supabase y un Anthropic falsos: 32 verificaciones, incluyendo EXIF con ubicación que no
  llega al modelo, respuestas malformadas, proveedor caído y límite diario.
- **No se probó con el modelo real**: falta `AI_API_KEY`. Lo que sí está verificado es la forma del pedido (herramienta
  forzada, imagen primero) y todo el manejo de la respuesta. **Pendiente del criterio de aceptación del plan:** probar con
  10 fotos reales de comida argentina y revisar la calidad de las estimaciones.
