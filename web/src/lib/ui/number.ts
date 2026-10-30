const DECIMAL = /^\d*[.,]?\d*$/;

/**
 * Interpreta lo que escribe el usuario: acepta coma o punto decimal (es-AR escribe "1,5").
 * Devuelve `null` si está vacío o no es un número. No admite negativos ni notación científica.
 */
export function parseDecimal(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '' || !DECIMAL.test(trimmed)) return null;
  const value = Number(trimmed.replace(',', '.'));
  return Number.isFinite(value) && /\d/.test(trimmed) ? value : null;
}

/** ¿Es un texto válido a mitad de escritura ("", "1,", ",5")? Para no rechazar teclas intermedias. */
export function isPartialDecimal(text: string): boolean {
  return DECIMAL.test(text.trim());
}

/** Formatea para mostrar, con la coma decimal de es-AR y hasta `decimals` decimales. */
export function formatNumber(value: number, decimals = 1): string {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: decimals }).format(value);
}
