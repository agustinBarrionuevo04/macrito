# Progreso y tendencias (`/progress`)

Código en `src/features/progress/`. Pantalla: `src/app/(app)/progress/page.tsx`. El período sale de la URL:
`/progress?range=7|30|90` (por defecto 30; cualquier otro valor cae en 30).

## Qué muestra

- **Tarjetas:** racha, "dentro de tu meta", promedio diario y días registrados. Son números sueltos: no llevan gráfico.
- **Peso:** lecturas como puntos grises y **promedio móvil de 7 días** como línea (énfasis), con el valor final rotulado y el
  cambio del período (y por semana si hay al menos 7 días de datos).
- **Calorías:** una columna por día (en 90 días, promedio por semana) contra una línea de meta.
- **Macros:** promedio diario contra la meta (barras) y una tabla por bloques de 7 días.
- Cada gráfico tiene descripción para lectores de pantalla, detalle al tocar o enfocar (teclado) y una **tabla equivalente**.

## Definiciones (decisiones nuestras: el plan no las fija)

| Qué                   | Cómo se calcula                                                                                                                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Promedios**         | Solo sobre los **días registrados**: un día sin registrar no cuenta como 0 kcal.                                                                                                                                                                  |
| **Dentro de tu meta** | % de los días registrados con kcal a **±10 %** de la meta (`ADHERENCE_TOLERANCE`). Simétrico: comer de más o de menos fuera de ese margen no cuenta.                                                                                              |
| **Racha**             | Días seguidos con al menos una entrada hasta hoy. Si hoy todavía no registraste nada **no se corta** (el día no terminó): cuenta desde ayer. Se calcula sobre los últimos 90 días: si llega al borde se muestra "90+".                            |
| **Meta**              | La **actual** del perfil, aplicada a todo el período (no se guarda historial de metas). Si cambiaste de peso u objetivo, los días viejos se comparan con la meta de hoy.                                                                          |
| **Semanas**           | Bloques de 7 días que **terminan hoy** (no semanas de calendario: evita depender de qué día empieza la semana).                                                                                                                                   |
| **Promedio móvil**    | Portado de `weight_moving_average.dart`: ventana de 7 días (incluido el día), cada punto queda en una lectura real y se descartan los puntos con menos de 2 lecturas. Las lecturas de los 6 días anteriores al período se usan solo como ventana. |

## Datos

- **Totales por día:** función SQL `daily_totals(p_from, p_to)` (migración `20261030180000`), `security invoker`: la RLS decide
  qué filas ve y además filtra por `auth.uid()`. Devuelve una fila por día con registros (≤ 90), así no se traen miles de entradas.
- **Pesos:** `weight_logs` del período más 6 días.
- Una sola carga de 90 días sirve para los tres períodos y para la racha. Si alguna consulta falla se muestra un error, no un resumen a medias.

## Gráficos

SVG propio (sin librería), siguiendo el skill de dataviz del proyecto: columnas ≤ 24 px con 4 px redondeados en la punta,
líneas de 2 px, puntos de r ≥ 4 con anillo del color de la superficie, grilla de 1 px, rótulos solo en lo importante y colores
de texto neutros. Las áreas táctiles son de al menos 28 px de ancho dentro del SVG.

**Colores de macros:** el validador del skill marcó que carbohidratos y grasas (naranja y rosa de 1-D) eran casi indistinguibles
(ΔE 14,4 en visión normal, el piso es 15). Se reemplazaron por los tres primeros colores de la paleta ya validada
(azul, naranja y turquesa), que pasan todas las pruebas por pares en modo claro y oscuro. Cambia también las barras del diario.

## Pruebas

- Lógica pura: promedio móvil (con cálculos a mano), estadísticas, racha, semanas, escalas y marcas, armado del modelo de la pantalla y lectura de filas.
- SQL (pgTAP): `daily_totals.test.sql` (sumas, rango con bordes, aislamiento entre usuarios, anónimo bloqueado).
- jsdom: gráficos (puntos, línea, meta, detalle al tocar, tabla), selector de período y tabla semanal.
- Chromium (Pixel 7) contra un Supabase falso con 25 días de comidas y 16 pesos: racha, 67 % de adherencia, promedio, cambio de peso, 7/30/90 días, tabla, modo oscuro y sin scroll horizontal.
