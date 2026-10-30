# Cálculo nutricional (`src/lib/nutrition/`)

Funciones puras, sin UI ni base de datos. Portadas de OpenNutriTracker (`lib/core/utils/calc/`), que queda como referencia. Fórmulas y fuentes: `docs/tdee-iom-2005-verification.md` en la raíz del repo.

## API

| Función                                            | Qué hace                                                                                                                                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `computeTargets(profile, options?)`                | Contrato 1.3: `DailyTargets` redondeados a enteros.                                                                                                                    |
| `calcTargets(profile, options?)`                   | Desglose sin redondear (`tee`, `goalAdjustment`, `manualAdjustment`, `rawKcal`, `floorKcal`, macros, `warnings`). Es lo que usa la pantalla "cómo se calculó mi meta". |
| `splitMacros(input)` / `validateMacroSplit(split)` | Reparto de macros y validación para formularios.                                                                                                                       |
| `calcTee`, `paCoefficient`, `palValue`             | IOM 2005 p. 204.                                                                                                                                                       |
| `calcAge(birthDate, today)`                        | Edad en calendario exacto.                                                                                                                                             |
| `todayInTimeZone(tz, now?)`                        | Fecha local `YYYY-MM-DD`; nunca en UTC.                                                                                                                                |
| `bmi`, `bmiCategory`                               | IMC y clasificación OMS.                                                                                                                                               |
| `units.ts`                                         | kcal↔kJ, cm↔in, pies/pulgadas, kg↔lb, g↔oz, ml↔fl oz.                                                                                                                  |

`calcTargets` suma a `computeTargets` lo que el contrato no devuelve (TEE, ajuste, avisos) sin cambiarlo.

## Decisiones

- **Meta** = TEE + ajuste por objetivo + ajuste manual, nunca por debajo del piso (mujer 1200, hombre 1500 kcal; configurable con `options.minKcal`). Si el piso corrige la meta, `warnings` incluye `below_kcal_floor` con el valor sin corregir.
- **Ajuste por objetivo**: con `weeklyGoalKg`, kg/semana × 1100; si no, bajar −500, mantener 0, subir +500.
- **Objetivo semanal inconsistente** (no finito, o que contradice el objetivo: bajar con +, subir con −, mantener con ≠ 0): se ignora, se usa el ajuste por defecto del objetivo y se agrega `weekly_goal_ignored`.
- **Edad**: 13 a 130 años; fuera de rango lanza `NutritionInputError`. Por debajo de 19 se calcula con las ecuaciones de adultos y se agrega `adult_equations_under_19`.
- **Macros por defecto** (sin `proteinGPerKg` ni `macroSplit`): proteína por peso según objetivo (bajar 2.0, mantener 1.6, subir 1.8 g/kg), grasa 25 % de las kcal, carbohidratos el resto. Rango configurable de proteína: 0.8–2.5 g/kg (`PROTEIN_G_PER_KG_RANGE`, lo valida la UI).
- **Con `proteinGPerKg`**: la proteína es fija; la grasa es `macroSplit.fat` o 25 %; carbohidratos el resto. Si proteína + grasa superan las kcal, se recorta primero la grasa y después la proteína (`protein_capped`). Prioridad: proteína, grasa, carbohidratos.
- **Con `macroSplit` solamente**: reparto porcentual explícito (debe sumar 1 ± 0.001). El piso de grasa de 20 % (`MIN_FAT_FRACTION`) no se impone en el cálculo: `validateMacroSplit` lo informa (`fat_below_min`) para que los formularios lo apliquen.
- **Presets**: `MACRO_PRESETS.balanced` 50/30/20 y `classic` 60/25/15 (el de OpenNutriTracker).
- **Redondeo**: solo `computeTargets` redondea (a enteros). `calcTargets` devuelve valores sin redondear.
- **Hoy**: si no se pasa `options.today`, se calcula en la zona horaria del perfil.

## Qué no se portó

- El "taper" de OpenNutriTracker (reducir el déficit al acercarse al peso objetivo): no está en el plan.
- Cálculos de actividad física y MET, y el perfil de calorías no binario: la app solo tiene `male`/`female`.
- Unidades con texto de interfaz y stones.

## Tests

Los vectores de TEE son los de `test/unit_test/tdee_iom2005_published_values_test.dart`: 26 celdas impresas en las Tablas 5-29 y 5-30 del IOM (tolerancia ±1.5 kcal) y 6 derivadas de p. 204 por fuera del repo (otras edades, incluido el caso de PA "low active" de mujeres). Un test comprueba además que esos casos detectan el bug #987. Cobertura del módulo: 100 %, con umbral de 95 % en CI.
