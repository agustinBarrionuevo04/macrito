export const THEME_STORAGE_KEY = 'macritos.theme';

/**
 * Se inyecta en <head> y corre antes de pintar: aplica el tema guardado para que no parpadee el
 * claro antes del oscuro. Sin preferencia guardada manda el tema del sistema (solo CSS).
 */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export type ThemePreference = 'light' | 'dark' | 'system';

/** Aplica el tema al documento. `system` quita el atributo y manda la preferencia del sistema. */
export function applyTheme(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === 'system') delete root.dataset.theme;
  else root.dataset.theme = preference;
}
