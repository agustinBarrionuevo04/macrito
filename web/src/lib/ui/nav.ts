/** ¿La ruta actual pertenece a esa pestaña? `/` solo coincide exacto; el resto, por prefijo de segmento. */
export function isNavActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
