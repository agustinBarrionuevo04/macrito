/** ¿Empieza como un JPEG (SOI + marcador)? */
export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/**
 * Quita de un JPEG los metadatos (EXIF con ubicación y fecha, XMP, comentarios, perfiles ICC):
 * deja solo lo necesario para decodificar la imagen. Devuelve `null` si el archivo está mal formado.
 * Conserva APP0 (JFIF) y APP14 (Adobe: define la conversión de color); descarta el resto de APPn y COM.
 */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array | null {
  if (!isJpeg(bytes)) return null;
  const out: number[] = [0xff, 0xd8];
  let i = 2;

  while (i < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    // Relleno: varios 0xFF seguidos antes del marcador.
    while (bytes[i + 1] === 0xff) i += 1;
    const marker = bytes[i + 1];
    if (marker === undefined) return null;

    if (marker === 0xd9) {
      out.push(0xff, 0xd9);
      return Uint8Array.from(out);
    }
    // Marcadores sin longitud (TEM, RSTn).
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(0xff, marker);
      i += 2;
      continue;
    }

    const high = bytes[i + 2];
    const low = bytes[i + 3];
    if (high === undefined || low === undefined) return null;
    const length = (high << 8) | low;
    if (length < 2 || i + 2 + length > bytes.length) return null;

    const isMetadata = (marker >= 0xe1 && marker <= 0xef && marker !== 0xee) || marker === 0xfe;
    if (marker === 0xda) {
      // Inicio del escaneo: el resto (datos de imagen hasta EOI) se copia tal cual.
      for (let j = i; j < bytes.length; j++) out.push(bytes[j]!);
      return Uint8Array.from(out);
    }
    if (!isMetadata) {
      for (let j = i; j < i + 2 + length; j++) out.push(bytes[j]!);
    }
    i += 2 + length;
  }
  return null;
}
