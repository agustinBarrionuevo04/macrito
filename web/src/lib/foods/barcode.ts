/** Dígito verificador GS1 (EAN-8, UPC-A, EAN-13, GTIN-14): pesos 3,1,3,1… de derecha a izquierda. */
function hasValidCheckDigit(code: string): boolean {
  const digits = [...code].map(Number);
  const check = digits.pop();
  if (check === undefined) return false;
  const sum = digits
    .reverse()
    .reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * Normaliza un código de barras ingresado o escaneado. Devuelve `null` si no es válido.
 * UPC-A (12) y GTIN-14 que empieza con 0 se llevan a EAN-13, que es como OFF los guarda.
 */
export function normalizeBarcode(raw: string): string | null {
  const code = raw.replace(/[\s-]/g, '');
  if (!/^\d+$/.test(code)) return null;

  let canonical = code;
  if (canonical.length === 12) canonical = `0${canonical}`;
  else if (canonical.length === 14 && canonical.startsWith('0')) canonical = canonical.slice(1);

  if (![8, 13, 14].includes(canonical.length)) return null;
  return hasValidCheckDigit(canonical) ? canonical : null;
}
