/** Lado mayor de la foto que se sube: alcanza para reconocer comida y baja costo y latencia. */
export const MAX_SIDE_PX = 1024;
export const JPEG_QUALITY = 0.8;

/** Tamaño que entra en `maxSide` conservando la proporción; nunca agranda. */
export function fitWithin(
  width: number,
  height: number,
  maxSide = MAX_SIDE_PX,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (!(longest > 0)) return { width: 0, height: 0 };
  if (longest <= maxSide) return { width, height };
  const scale = maxSide / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Reduce la foto en el navegador (~1024 px, JPEG calidad 0,8) antes de subirla. Redibujarla en un
 * canvas también aplica la orientación EXIF y descarta los metadatos. Lanza si no se puede leer.
 */
export async function resizeToJpeg(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const size = fitWithin(bitmap.width, bitmap.height);
    if (size.width === 0) throw new Error('imagen vacía');
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('sin canvas');
    // Fondo blanco: un PNG con transparencia saldría negro en JPEG.
    context.fillStyle = '#fff';
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    if (!blob) throw new Error('no se pudo codificar');
    return blob;
  } finally {
    bitmap.close();
  }
}
