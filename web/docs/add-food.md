# Agregar alimento (`/add`)

Código en `src/features/add-food/`. Pantalla: `src/app/(app)/add/page.tsx`. Parámetros de URL:
`/add?meal=lunch&date=AAAA-MM-DD` (los dos opcionales; una fecha inválida o futura cae en hoy).

## Flujo

1. **Buscar** (`FoodPicker`): sin texto muestra favoritos y recientes (cargados en el servidor); con 2 o más letras
   busca en `GET /api/foods/search` con espera de 300 ms y cancelando la búsqueda anterior. Estados: carga, error con
   "Reintentar", fuentes caídas (aviso), sin resultados (ofrece crear el alimento con lo escrito).
2. **Escanear** (`BarcodeScanner`): cámara trasera + lectura continua cada 250 ms. Siempre hay ingreso a mano.
   El código se valida y normaliza con `normalizeBarcode` (dígito verificador GS1) antes de consultar
   `GET /api/foods/barcode/:code`. Producto desconocido → ofrece crearlo con ese código.
3. **Mi alimento**: formulario de alimento propio (valores por 100 g, fibra/azúcares/sodio opcionales, porciones).
4. **Cantidad** (`PortionSheet`): gramos o una porción del alimento, vista previa en vivo y comida del día.
   Al confirmar llama a `addEntry(draft, day)` (2-F); el servidor recalcula la nutrición desde la base.
   Se queda en `/add` y avisa con un toast ("Ver diario" lleva al día).

Origen de la entrada: `search` (buscador, favoritos, recientes), `barcode` (escáner) o `manual` (alimento recién creado).

## Escáner

- `BarcodeDetector` nativo si existe (Chrome en Android). Si no (iOS Safari, escritorio), se carga bajo demanda el
  polyfill `barcode-detector` (zxing-cpp en WASM).
- **El `.wasm` (~950 KB) lo sirve la propia app** (`/_next/static/media/zxing_reader.*.wasm`), no un CDN: por defecto el
  polyfill lo baja de jsDelivr. Por eso `zxing-wasm` está fijado en la misma versión que usa `barcode-detector` (3.1.6);
  si se actualiza una, hay que actualizar la otra.
- Formatos: EAN-13 (el de Argentina), EAN-8 y UPC-A.
- Permisos: si se deniega la cámara se explica cómo habilitarla; sin soporte, sin cámara o con error, queda el ingreso
  a mano. La cámara se apaga al leer, al cerrar y al salir de la pantalla.
- La cámara necesita HTTPS (o `localhost`): otra razón para el deploy antes de probar en el celular.

## Alimentos propios

- `createCustomFood` / `updateCustomFood` (server actions): siempre `source = 'custom'` y `created_by` = usuario de la
  sesión; lo que mande el cliente en esos campos se ignora. Validación con zod (`schemas.ts`): kcal 0–900 y cada macro
  0–100 por 100 g, macros que suman ≤ 105 g, código de barras válido, hasta 10 porciones.
- **Corregir un alimento del catálogo** = guardar una copia propia precargada. El original no se toca. Si la copia
  conserva el código de barras, al escanearlo gana la versión del usuario (`findByBarcode`).
- Editar un alimento propio **no cambia las entradas ya registradas**: guardan su propio snapshot.
- Son "propios" los de origen `custom` y `ai_unverified` (los crea 2-H).

## Favoritos

`setFavorite(foodId, boolean)`: idempotente, sobre `favorite_foods` (RLS por usuario). La interfaz es optimista y
revierte con un aviso si el servidor falla.

## Pruebas

- Lógica y acciones: `portions`, `schemas`, `actions` (contra `test-utils/fake-supabase`), `api`, `server`.
- Interfaz (jsdom): buscador (debounce, carrera de respuestas, estados), cantidad, escáner (permisos, lecturas inválidas,
  apagado de la cámara), formulario y la pantalla completa.
- Verificado en Chromium (Pixel 7) con cámara falsa que reproduce un video de un EAN-13 real: el polyfill lo lee y abre
  el producto. **No se probó en un iPhone ni en un Android real**: queda para el deploy.
