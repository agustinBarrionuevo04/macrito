# Asistente "¿Qué como?" (`/assistant`)

Código en `src/features/assistant/`, ruta `src/app/api/ai/plan/route.ts` y pantalla `src/app/(app)/assistant/`.
Atajo en **Hoy** (tarjeta "¿Qué como?" debajo del resumen). Los recordatorios (Web Push, parte 3 de 3-L) van en otro PR.

## Qué hace

- **Una comida**: elegís desayuno / almuerzo / merienda / cena y te propone **3 opciones** concretas (alimentos con gramos)
  para llegar a lo que te falta del día. Cada opción se agrega al diario **con un toque** (una entrada por alimento).
- **Armar el día**: una opción para cada comida que todavía no tiene registros, repartiendo lo que falta. Se muestra el total
  del plan contra lo que falta. (El plan semanal del plan original **no** se hizo: ver "Fuera de alcance".)

## Principio: la nutrición sale de la base, no del modelo

1. El servidor calcula **lo que falta** = meta del día − lo ya registrado (nunca negativo).
2. Se le pide al modelo, con una herramienta forzada (`suggest_meals`), solo **nombres de alimentos y gramos**. El esquema
   no tiene calorías ni macros: no hay nada que pueda inventar ahí.
3. Cada nombre se busca en la **base local** (`search_foods`: `ar_seed`, alimentos propios y lo ya guardado; sin llamadas a
   Open Food Facts ni USDA) y se acepta con la misma regla que la revisión de fotos (`pickMatch`: ≥ 60 % de las palabras).
4. Calorías y macros de cada alimento y de la opción se calculan con los valores por 100 g de la base.
5. Al agregar, el cliente manda **solo `foodId` y gramos**; `addSuggestion` relee los alimentos y recalcula todo
   (no se pueden mandar calorías inventadas).

## Reglas que decidí (el plan no las fija)

- **Una opción con un alimento que no está en la base se descarta entera**, en vez de mostrarla sin ese ítem (subestimaría
  sus calorías). Si no queda ninguna: error `no_options` (422) "No pudimos armar opciones con alimentos de tu base".
- **Una opción que se pasa de lo que falta se descarta** (en modo "una comida"): más de `falta × 1,25 + 50 kcal`.
- Si **ya llegaste a la meta** (faltan < 150 kcal) en modo "una comida", no se consulta a la IA: se avisa.
- Las opciones del modelo con un ítem ilegible (gramos ≤ 0 o > 3.000, nombre vacío) también se descartan enteras.
- La comida de cada opción la fija el servidor: en "una comida" es la elegida; en "el día", la del modelo si está libre, y si
  no, la próxima libre. Sobran las que no caben.
- Se le cuentan al modelo hasta **25 alimentos habituales** (los más registrados en los últimos 30 días); ayudan a proponer
  lo que ya comés. Son nombres: se les quitan caracteres de control, invisibles y símbolos de etiquetas, y se limita el
  largo (`cleanFoodName`). El pedido **no incluye ningún texto libre del usuario**, y el prompt dice que lo que sigue son datos.
- **Cupo**: cada pedido cuenta como **un análisis de texto** del día (`AI_DAILY_TEXT_LIMIT`, por defecto 100); no hay un
  presupuesto aparte. Si el proveedor falla antes de responder, el cupo se libera (igual que foto y texto).
- Origen de las entradas: `ai_text` (sin migración), `is_estimate = false` porque los valores salen de la base.

## Cambios en `lib/ai`

`AiProvider.analyze(content, system, signal?, tool?)` acepta una herramienta opcional; sin ella sigue siendo
`log_meal_items`. Anthropic y Gemini la fuerzan y leen **su** llamada. `createAiService(...).structured(...)` ejecuta un
pedido de texto con su propia herramienta y su propio validador, con la misma reserva de cupo y registro de tokens.

## Fuera de alcance de este PR

- **Plan semanal**: el plan original dice "día/semana (opcional)". Solo hay día; una semana multiplica el costo de tokens y
  la revisión, y conviene decidirla con uso real.
- **Recordatorios con Web Push**: PR aparte (necesita claves VAPID, tabla de suscripciones, tarea programada y probar en
  un iPhone con la PWA instalada).

## No verificado

Probado con modelos y base simulados (Chromium Pixel 7 + Anthropic falso). **No** se probó con un modelo real ni con
`ar_seed` completo: la tasa de aciertos de los nombres contra ARGENFOODS es lo primero a medir con tu clave real
(`AI_DEBUG=1` muestra la respuesta cruda del modelo).
