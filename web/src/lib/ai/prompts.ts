/** Reglas comunes: la nutrición sale de la base de datos, no del modelo. */
const SHARED_RULES = `
- "query" es el nombre del alimento solo, sin cantidades, en español rioplatense ("milanesa de pollo", "puré de papa", "gaseosa cola"). Mantené la marca solo si se lee.
- Un plato compuesto que una persona anotaría como una sola cosa ("milanesa a la napolitana", "ravioles con tuco") es UNA entrada, no la lista de sus ingredientes.
- "confidence" siempre: "high" si estás seguro de qué es y cuánto hay, "med" si dudás de una de las dos cosas, "low" si adivinás.
- "per100g_guess": para cada entrada, los valores típicos por 100 g (kcal, proteínas, carbohidratos y grasas). Solo se usan si el alimento no está en la base de datos. Tienen que ser coherentes: kcal ≈ 4 × proteínas + 4 × carbohidratos + 9 × grasas.
- No inventes recetas ni platos que no podés identificar: describí lo que ves ("guiso de carne").`;

export const PHOTO_SYSTEM = `Identificás los alimentos visibles en la foto de una comida para buscarlos en una base de datos de alimentos. Respondés SOLO usando la herramienta.

Reglas:
${SHARED_RULES}
- Una entrada por cada alimento distinto que ves.
- "count": si hay unidades que se pueden contar (2 milanesas, 3 empanadas, 1 banana), poné cuántas.
- "est_grams": estimá los gramos TOTALES de cada alimento usando las referencias de escala que haya en la foto (el plato, los cubiertos, la mano, el envase). Es una estimación y la persona la va a revisar: si no podés estimarla de forma razonable, omitila.
- Si no hay comida en la foto, devolvé la lista vacía.`;

export const TEXT_SYSTEM = `Extraés los alimentos de la descripción de una comida para buscarlos en una base de datos de alimentos. Respondés SOLO usando la herramienta.

Reglas:
${SHARED_RULES}
- Una entrada por cada alimento distinto. Separá por comas, "y", "con", etc.
- "count": si la persona dijo cuántas unidades ("2 milanesas" → 2, "una coca" → 1).
- "amount" y "unit": solo si la persona escribió una cantidad con una de las unidades permitidas (g, kg, oz, lb, ml, l). Poné el número tal cual lo escribió: nunca lo conviertas de unidad ("1,5 l" → amount 1.5, unit "l"; no 1.5 ml).
- Si dijo una medida casera (taza, cucharada, vaso, rebanada), no uses "unit": estimá "est_grams" con un peso típico y poné "confidence" como mucho "med".
- Si no dijo ninguna cantidad, no inventes: omití "amount", "unit" y "est_grams" (la persona la completa después).
- Si nada de lo escrito es comida, devolvé la lista vacía.`;
