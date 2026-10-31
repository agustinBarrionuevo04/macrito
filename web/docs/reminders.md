# Recordatorios con Web Push (3-L, parte 3)

Código en `src/features/reminders/`, endpoint `src/app/api/cron/reminders/route.ts`, handlers de `push` y `notificationclick` en
`src/sw.ts`. Se configuran en **Perfil → Recordatorios**. Migración: `supabase/migrations/20261030210000_reminders.sql`
(pgTAP: `supabase/tests/reminders.test.sql`).

## Cómo funciona

1. En **Perfil → Recordatorios** la persona toca "Activar avisos en este dispositivo": el navegador pide permiso, se crea una
   suscripción push (clave pública VAPID) y se guarda en `push_subscriptions` (una fila por usuario y dispositivo).
2. Elige, por comida (desayuno, almuerzo, merienda, cena), si quiere aviso y a qué **hora local**. Se guarda en
   `reminder_settings`. Horas sugeridas: 09:00, 13:00, 17:30, 21:00.
3. Una **tarea programada** llama cada 10–15 minutos a `GET /api/cron/reminders` con `Authorization: Bearer $CRON_SECRET`.
   El servidor (`runReminders`) mira los recordatorios activos y, por cada uno que toca, envía un push cifrado (librería
   `web-push`, firma VAPID) a todos los dispositivos del usuario. Al tocar la notificación se abre `/add?meal=<comida>`.

## Reglas

- **Hora local del usuario** (`profiles.timezone`); si la zona es inválida se usa la de Argentina.
- Toca desde la hora configurada y **durante 90 minutos** (`REMINDER_WINDOW_MINUTES`): si la tarea se atrasa más, ya no se avisa
  ("es hora del almuerzo" a las 18 no sirve).
- **Una vez por día y por comida** (`last_sent_on`).
- **No avisa si esa comida ya tiene algo cargado hoy** (y la da por resuelta).
- Sin dispositivos activos no marca nada: si la persona activa uno dentro de la ventana, todavía le llega.
- Un error pasajero del servicio push (429/5xx/red) **no** la marca como enviada: se reintenta en la próxima corrida. Si llegó a
  algún dispositivo, queda resuelta. Las suscripciones que el servicio push da por muertas (404/410) se borran.
- Cambiar la hora no reinicia el "ya enviado de hoy" (evita un segundo aviso si se edita después de recibirlo).
- Las notificaciones con la misma etiqueta (`meal-<comida>`) se reemplazan, no se acumulan.
- El destino al tocar se valida (`safeAppPath`): solo rutas internas, nunca un sitio externo.

## Configuración (solo servidor)

| Variable                                 | Para qué                                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Claves VAPID. Se generan una vez con `npx web-push generate-vapid-keys`. La pública se le pasa al navegador.  |
| `VAPID_SUBJECT`                          | Contacto: `mailto:vos@email.com` o una URL `https://`.                                                        |
| `CRON_SECRET`                            | Secreto de la tarea programada (texto largo y aleatorio). **Sin él el endpoint responde 503: queda cerrado.** |

Sin las claves VAPID la sección dice "todavía no están disponibles" y no ofrece activar. **No** cambies las claves una vez
que hay dispositivos suscritos: las suscripciones existentes dejan de servir y cada persona tiene que volver a activar.

## La tarea programada (decisión pendiente para el despliegue, 4-O)

`/api/cron/reminders` sirve para cualquier programador que pueda hacer un GET con un encabezado. Opciones:

| Opción                                         | Costo    | Notas                                                                                                          |
| ---------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| Vercel Cron (`vercel.json`)                    | Plan Pro | El plan gratuito (Hobby) solo permite **una vez por día**: no alcanza. **No** se agregó `vercel.json` por eso. |
| GitHub Actions con `schedule` (cada 10–15 min) | Gratis   | Llama al endpoint con `curl`. Puede atrasarse varios minutos en horas pico (la ventana de 90 min lo tolera).   |
| Un cron externo (cron-job.org, etc.)           | Gratis   | Más puntual, depende de un tercero.                                                                            |

Cuando definamos el despliegue lo configuro (hay que cargar `CRON_SECRET` y la URL como secretos).

## iPhone / iPad

Web Push en iOS solo funciona con la app **instalada en la pantalla de inicio** y abierta desde ahí (iOS 16.4 o superior).
En el navegador la pantalla muestra los pasos para instalarla. Hay que probarlo en un iPhone real con HTTPS.

## No verificado

Probado con el Supabase simulado, el envío con la librería simulada y Chromium (Pixel 7): activar/desactivar, guardar y recargar
los horarios, errores y el endpoint programado (401/503/200 con resumen, "ya cargado" y fallo pasajero). **No** se verificó una
entrega real: eso necesita HTTPS, claves VAPID reales y un navegador con el servicio push (FCM/Apple) accesible. La primera
prueba real es el botón "Enviar una prueba".
