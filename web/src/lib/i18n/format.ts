/** Reemplaza `{nombre}` por su valor. Un `{x}` sin valor queda tal cual, para que el error se note. */
export function t(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = vars[key];
    return value === undefined ? match : String(value);
  });
}
