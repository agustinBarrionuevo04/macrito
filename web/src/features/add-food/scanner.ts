/** Lo mínimo que usa la app de un lector de códigos: `BarcodeDetector` nativo o su polyfill. */
export type CodeDetector = {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
};

/** Formatos que interesan: los de productos de góndola (EAN-13 es el de Argentina). */
export const BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a'] as const;

type NativeBarcodeDetector = {
  new (options: { formats: string[] }): CodeDetector;
  getSupportedFormats(): Promise<string[]>;
};

/**
 * Crea un lector. Usa `BarcodeDetector` nativo si el navegador lo tiene (Chrome en Android); si no
 * (iOS Safari, escritorio), carga el polyfill WASM bajo demanda, con el `.wasm` servido por la propia
 * app y no desde un CDN. `null` si no hay forma de leer códigos.
 */
export async function createDetector(): Promise<CodeDetector | null> {
  const native = (globalThis as { BarcodeDetector?: NativeBarcodeDetector }).BarcodeDetector;
  if (native) {
    try {
      const supported = await native.getSupportedFormats();
      const formats = BARCODE_FORMATS.filter((format) => supported.includes(format));
      if (formats.length > 0) return new native({ formats });
    } catch {
      // Cae al polyfill.
    }
  }

  try {
    const { BarcodeDetector, setZXingModuleOverrides } = await import('barcode-detector/ponyfill');
    const wasm = new URL('zxing-wasm/reader/zxing_reader.wasm', import.meta.url).href;
    setZXingModuleOverrides({
      locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasm : prefix + path),
    });
    return new BarcodeDetector({ formats: [...BARCODE_FORMATS] });
  } catch {
    return null;
  }
}
