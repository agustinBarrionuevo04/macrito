# Onboarding y perfil (2-E)

## Flujo

1. Tras el primer ingreso, `proxy.ts` ve `onboarding_completed_at is null` y manda a `/onboarding`. La página es la segunda barrera: sin sesión va a `/login`; con el onboarding hecho, a `/`.
2. **Wizard de 7 pasos** (más la bienvenida): sexo, fecha de nacimiento, altura y peso, nivel de actividad, objetivo (con ritmo semanal y peso objetivo opcional), reparto de macros y resumen. Cada paso se valida antes de avanzar; "Atrás" conserva lo cargado.
3. El **resumen** calcula la meta en el navegador con `calcTargets` (1-B): TEE, ajuste por objetivo, meta y macros, más los avisos (piso de calorías, menor de 19 años). Muestra el aviso de que son estimaciones, no consejo médico.
4. **Confirmar** llama a `completeOnboarding`: guarda el peso del día en `weight_logs`, actualiza `profiles` y marca `onboarding_completed_at`; redirige a `/`. Es idempotente: si ya estaba completado, no pisa nada.
5. `/profile` muestra la meta con su desglose, el registro de peso, el editor de datos, el tema y el cierre de sesión. **La meta no se guarda**: se calcula siempre desde `profiles`, así que cambiar un dato la recalcula sola.

## Reglas

- **Rangos de formulario**: altura 100–250 cm, peso 25–400 kg, edad 13–130 años (más estrictos que los de la librería de cálculo). Las reglas viven una sola vez en `validation.ts`; las usan el wizard y el esquema zod del servidor.
- **Ritmo semanal**: bajar −0,25 / −0,5 / −0,75 / −1 kg por semana; subir +0,25 / +0,5; mantener no lleva ritmo. El valor por defecto es −0,5 al bajar y +0,25 al subir. El resumen y los avisos explican si el piso de calorías corrige la meta (por ejemplo −1 kg en una persona chica).
- **Peso objetivo** (opcional): al bajar tiene que ser menor que el actual; al subir, mayor.
- **Presets de macros**: "Alto en proteína" (por defecto; no fija reparto: proteína por kg según el objetivo, 25 % de grasa), "Equilibrado" 50/30/20 y "Clásico" 60/25/15. Un reparto propio (3-K) se conserva al editar el perfil salvo que se elija un preset.
- **El peso** solo se carga en el onboarding. Después se cambia **registrándolo** (`logWeight`): un registro por día (hoy, en la zona horaria del usuario), y `profiles.weight_kg` queda con el más reciente.
- **El día** se calcula en la zona horaria del perfil, nunca en UTC. La zona horaria no tiene pantalla para cambiarla: usa el valor por defecto de la columna (`America/Argentina/Cordoba`).
- Las acciones solo escriben las columnas del perfil que corresponden: nunca `user_id`, `kcal_adjustment`, `timezone` ni `onboarding_completed_at` desde el cliente (salvo que lo marca la acción al completar).

## Código

| Qué                                                                | Dónde                                                           |
| ------------------------------------------------------------------ | --------------------------------------------------------------- |
| Reglas de validación                                               | `src/features/profile/validation.ts`                            |
| Esquema del servidor                                               | `schema.ts`                                                     |
| Borrador del wizard, pasos, vista previa                           | `draft.ts`                                                      |
| Fila de `profiles` ↔ perfil, presets                               | `mapping.ts`                                                    |
| Server Actions: `completeOnboarding`, `updateProfile`, `logWeight` | `actions.ts`                                                    |
| Lectura del perfil en el servidor                                  | `server.ts`                                                     |
| Pantallas                                                          | `src/app/onboarding/page.tsx`, `src/app/(app)/profile/page.tsx` |

`getCurrentProfile()` (`server.ts`) es lo que usan las demás pantallas para obtener el perfil y calcular metas (por ejemplo, el diario en 2-F).

## Pruebas

- Lógica pura, acciones (con Supabase simulado) y componentes con DOM (jsdom): el wizard completo, el editor y el registro de peso.
- `supabase/tests/onboarding_flow.test.sql` ejecuta, como usuario autenticado y con las policies reales, las mismas operaciones SQL que hacen las acciones.
- Además se recorrió el flujo completo en Chromium contra un Supabase falso con estado (login simulado, redirección al onboarding, los 7 pasos, guardado, edición del perfil, registro de peso, cierre de sesión).

## Pendiente

- Probar contra un proyecto Supabase real (el hook de registro, el correo de recuperación y este flujo con sesiones reales).
- Pantalla para cambiar la zona horaria y el ajuste manual de kcal (3-K).
- Los links de la navegación inferior a `/add` y `/progress` dan 404 hasta que 2-G y 3-I creen esas pantallas.
