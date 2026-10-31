# Plan: proveedor Gemini (sin pago) y errores claros de proveedor

Estado: **borrador, esperando "aprobado"**.

## Contexto
- El 502 de `/add` no es un bug de parseo: Anthropic responde `HTTP 400 … credit balance is too low`
  (verificado con una llamada real). La API se factura aparte del plan Pro de Claude Code.
- El usuario quiere evitar el pago → usar el plan gratuito de la API de Gemini.
- `AiProvider` (`lib/ai/types.ts`) ya es intercambiable: solo cambia cómo se manda el pedido y cómo
  se lee la respuesta. No se toca `types.ts`, `usage.ts` ni las firmas de `service.ts`.

## Alcance
1. **Errores claros (cualquier proveedor).** En `anthropic.ts` (`errorForStatus`), un 400 con
   "credit balance" pasa a `unavailable` (503) en vez de `bad_response`/`image_rejected`.
   Texto en `es.aiFood.errors.*` solo si hace falta una clave nueva.
2. **`lib/ai/gemini.ts`** con `createGeminiProvider({ apiKey, model, baseUrl?, timeoutMs?, fetch? })`.
   - `POST {base}/v1beta/models/{model}:generateContent`, header `x-goog-api-key`.
   - `systemInstruction`, `contents` (texto o `inlineData` JPEG base64), una `functionDeclaration`
     `log_meal_items` y `toolConfig.functionCallingConfig = { mode: 'ANY', allowedFunctionNames: [...] }`.
   - El esquema de la herramienta se adapta (Gemini acepta un subconjunto de OpenAPI): se quita
     `additionalProperties`; el resto se valida con la API real.
   - Lectura: `candidates[0].content.parts[].functionCall.args`; si no hay, JSON en `text` con
     `extractJsonValue`. `usageMetadata` → tokens. `diagnostics` con la forma, sin contenido.
   - Errores: 400 → `bad_response` (texto) / `image_rejected` (foto); 401/403 → `unauthorized`;
     429 (`RESOURCE_EXHAUSTED`) → `rate_limited`; 5xx/red → `unavailable`; timeout → `timeout`.
     Se registra el detalle del error sin clave ni contenido del usuario.
3. **`config.ts`**: caso `gemini` en `createProviderFromEnv`, modelo por defecto en una constante
   (se confirma contra la clave real; no se inventa), `AI_MODEL` lo pisa.
4. **Docs/env:** `.env.example` y `web/docs/ai.md` (proveedores, variables, aviso de privacidad del
   plan gratuito: Google puede usar lo enviado para mejorar sus productos).

## Fuera de alcance
- Reintentos automáticos, cambios en `parseModelItems` o en los límites de validación.
- Conectar con la suscripción de Claude Code (no permitido por los términos de Anthropic).
- Fallback automático entre proveedores.

## Tests (sin red, con `fetch` simulado)
- `gemini.test.ts`: cuerpo de la petición (texto y foto), lectura de `functionCall`, JSON en texto,
  respuesta vacía, `finishReason` distinto de STOP, y cada código HTTP → `AiError`.
- `anthropic.test.ts`: el 400 de crédito da `unavailable` para texto y foto.
- `config.test.ts`: `AI_PROVIDER=gemini` con y sin clave.
- Prueba manual: 1 llamada real de texto y 1 de foto con la clave de Gemini, con `AI_DEBUG=1`.

## Pasos de construcción
1. Rama `fix/ai-provider-gemini` desde `develop`.
2. Tests primero, luego implementación.
3. `cd web && pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm build && pnpm format:check`.
4. PR a `develop` con la causa del 502 documentada y la evidencia de la llamada real.

## Qué necesito del usuario
- Una clave de Gemini (aistudio.google.com → Get API key) puesta en `AI_API_KEY`, con
  `AI_PROVIDER=gemini`, para la prueba real. Yo no la creo.
- Confirmar que acepta el aviso de privacidad del plan gratuito (fotos de comidas de invitados).

## Riesgos
- Los límites y modelos gratuitos de Gemini cambian; se verifican en ai.google.dev al construir.
- Gemini puede rechazar campos del esquema o devolver otra forma: se ajusta con la respuesta real.
