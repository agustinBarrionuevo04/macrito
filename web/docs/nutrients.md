# Nutrientes finos y agua

Código en `src/features/nutrients/` y `src/features/water/`. Se ve en dos lugares:

- **Hoy** (`/`): tarjeta de **Agua** y panel de **Fibra, azúcares y sodio**, debajo del resumen del día.
- **Perfil** (`/profile`), sección **Metas finas**: reparto de macros, ajuste manual de calorías y meta de agua.

Migración: `supabase/migrations/20261030200000_nutrients_water.sql` (pgTAP: `supabase/tests/nutrients_water.test.sql`).

## Micronutrientes (fibra, azúcares, sodio)

- Las entradas del diario **no guardan** fibra, azúcares ni sodio: se calculan al leer, con la función SQL `micro_totals(p_day)`
  (`security invoker`, o sea que respeta RLS): suma `cantidad / 100 × valor por 100 g` del alimento de cada entrada.
- Devuelve siempre una fila con `entries` (entradas del día) y `with_data` (las que tienen al menos un dato). El panel muestra
  esa **cobertura**: "Calculado con 1 de 2 entradas…" avisa que el resto no informa estos datos y que el total puede ser mayor.
  Las entradas sin alimento asociado (calorías rápidas, estimaciones de IA sin alimento) no aportan.
- Si se edita o borra el alimento, el total del día cambia (no hay snapshot). Es una decisión consciente: son datos
  orientativos y evita duplicar columnas en cada entrada.

### Referencias (`reference.ts`)

| Nutriente | Tipo   | Valor                            | Fuente                                      |
| --------- | ------ | -------------------------------- | ------------------------------------------- |
| Fibra     | meta   | 14 g por cada 1.000 kcal de meta | Ingesta adecuada del IOM (EE.UU.)           |
| Sodio     | máximo | 2.000 mg por día                 | OMS (≈ 5 g de sal)                          |
| Azúcares  | máximo | 10 % de las kcal ÷ 4 g           | OMS (azúcares libres; **solo orientativo**) |

Pasarse de la fibra no es un problema (solo se marca "llegaste"); pasarse de azúcares o sodio marca "superaste el máximo".
Justo en el tope todavía no es "pasado". Las etiquetas informan azúcares totales (con los de fruta y lácteos), por eso el
tope es orientativo. La pantalla explica de dónde sale cada referencia.

## Reparto de macros (`macro-edit.ts`)

Tres modos, con vista previa en vivo ("Así quedaría tu meta") contra el motor `lib/nutrition`:

| Modo              | Entrada                                | Reglas                                                      |
| ----------------- | -------------------------------------- | ----------------------------------------------------------- |
| Por defecto       | —                                      | Proteína según objetivo, 25 % grasas, resto carbohidratos   |
| Porcentajes       | carbohidratos / grasas / proteínas (%) | Suman 100, cada uno 0–100, **grasas ≥ 20 %**                |
| Proteína por kilo | g de proteína por kg                   | Entre 0,8 y 3; grasas fijas en 25 %; carbohidratos el resto |

- La meta de calorías **no cambia**: solo cómo se reparte.
- Siempre se escriben **las dos columnas** (`macro_split` y `protein_g_per_kg`), una en `null`, así un modo no deja restos del otro.
- Si la proteína pedida no entra en las calorías, la vista previa avisa (`protein_capped`).
- Validación en el cliente (para la vista previa) y de nuevo en la server action (`updateMacros`) con zod.

## Ajuste manual de calorías (`kcal-adjustment.ts`)

- Entero entre −1.000 y +1.000, en pasos de 50, que se **suma a la meta calculada** (`profiles.kcal_adjustment`, ya existía).
- La vista previa muestra "Calculada X + ajuste Y". Si el resultado baja del piso de seguridad (1.200 kcal mujeres, 1.500
  hombres) se corrige al piso y avisa (`below_kcal_floor`).
- El texto pide cambios chicos (50–100 kcal) y desaconseja los grandes: no es consejo médico.

## Agua (`src/features/water/`)

- Tabla `water_logs` (una fila por toma). Se agregó `created_at` para poder **deshacer la última toma** de forma determinista.
- Meta: **35 ml por kg** de peso, acotada a 1.500–4.000 ml (`goal.ts`). Meta propia opcional en `profiles.water_goal_ml`
  (500–10.000 ml); `null` vuelve a la sugerida.
- Botones rápidos +200 / +330 / +500 / +1.000 ml, "Otra cantidad" (1–5.000 ml por toma) y "Deshacer la última toma".
- Acciones: `addWater`, `undoLastWater`, `setWaterGoal`. Fecha siempre en la zona horaria del usuario; los errores se traducen
  a `es.water.errors` sin filtrar detalles de la base.
- La barra es un `progressbar` accesible con texto ("Agua tomada: X de Y ml").

## Qué no se verificó

Probado con el Supabase falso local y pgTAP; **no** contra Supabase real ni en un teléfono real.
