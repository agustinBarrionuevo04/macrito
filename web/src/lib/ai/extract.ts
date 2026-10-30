/**
 * Busca un valor JSON dentro de un texto: un bloque ```json … ``` o, si no hay, el primer objeto o
 * lista balanceado. Sirve cuando el modelo responde con texto en vez de (o además de) la herramienta.
 * Devuelve `undefined` si no encuentra nada que se pueda leer.
 */
export function extractJsonValue(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;

  const direct = tryParse(trimmed);
  if (direct !== undefined && typeof direct === 'object' && direct !== null) return direct;

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenced?.[1]) {
    const parsed = tryParse(fenced[1].trim());
    if (parsed !== undefined && typeof parsed === 'object' && parsed !== null) return parsed;
  }

  for (let start = 0; start < trimmed.length; start++) {
    const char = trimmed[start];
    if (char !== '{' && char !== '[') continue;
    const end = balancedEnd(trimmed, start);
    if (end === -1) continue;
    const parsed = tryParse(trimmed.slice(start, end + 1));
    if (parsed !== undefined && typeof parsed === 'object' && parsed !== null) return parsed;
  }
  return undefined;
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Índice del cierre que balancea la apertura en `start`, ignorando lo que está entre comillas. */
function balancedEnd(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (char === '\\') i += 1;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{' || char === '[') depth += 1;
    else if (char === '}' || char === ']') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Describe la forma de un valor sin mostrar su contenido: `{items: array(3), nota: string(12)}`.
 * Sirve para registrar qué devolvió el modelo sin guardar lo que comió la persona.
 */
export function describeShape(value: unknown, depth = 0): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    const first = value[0];
    return depth < 3 && first !== undefined
      ? `array(${value.length} de ${describeShape(first, depth + 1)})`
      : `array(${value.length})`;
  }
  switch (typeof value) {
    case 'string':
      return `string(${value.length})`;
    case 'object': {
      if (depth >= 3) return 'object';
      const entries = Object.entries(value as Record<string, unknown>).slice(0, 8);
      return `{${entries.map(([key, v]) => `${key}: ${describeShape(v, depth + 1)}`).join(', ')}}`;
    }
    default:
      return typeof value;
  }
}
