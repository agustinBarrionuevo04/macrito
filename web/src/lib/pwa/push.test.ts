import { describe, expect, it } from 'vitest';
import { parsePushPayload, pushSupport, safeAppPath, urlBase64ToBytes } from './push';

describe('safeAppPath', () => {
  it('deja pasar rutas internas con su consulta', () => {
    expect(safeAppPath('/add?meal=lunch')).toBe('/add?meal=lunch');
    expect(safeAppPath('/')).toBe('/');
  });
  it('descarta lo que sale de la app o no es una ruta', () => {
    for (const bad of [
      '//evil.com',
      'https://evil.com',
      'javascript:alert(1)',
      '/\\evil.com',
      'add',
      '',
      null,
      undefined,
      42,
      '/' + 'a'.repeat(400),
    ]) {
      expect(safeAppPath(bad), String(bad)).toBe('/');
    }
  });
});

describe('parsePushPayload', () => {
  it('lee un mensaje completo', () => {
    expect(
      parsePushPayload(
        JSON.stringify({
          title: 'Hora del almuerzo',
          body: '¿Ya cargaste?',
          url: '/add?meal=lunch',
          tag: 'meal-lunch',
        }),
      ),
    ).toEqual({
      title: 'Hora del almuerzo',
      body: '¿Ya cargaste?',
      url: '/add?meal=lunch',
      tag: 'meal-lunch',
    });
  });
  it('un mensaje vacío, roto o de otra forma igual da una notificación válida', () => {
    const fallback = { title: 'Macritos', body: '', url: '/', tag: 'macritos' };
    for (const raw of [undefined, null, '', 'no es json', '[]', '"texto"', '42', '{}']) {
      expect(parsePushPayload(raw), String(raw)).toEqual(fallback);
    }
  });
  it('sanea la ruta y acota el largo del texto', () => {
    const payload = parsePushPayload(
      JSON.stringify({ title: 'a'.repeat(500), url: 'https://evil.com' }),
    );
    expect(payload.url).toBe('/');
    expect(payload.title).toHaveLength(200);
  });
});

describe('urlBase64ToBytes', () => {
  it('decodifica base64url con y sin relleno', () => {
    expect([...urlBase64ToBytes('AQID')]).toEqual([1, 2, 3]);
    expect([...urlBase64ToBytes('-_8')]).toEqual([251, 255]); // "-_8=" → 0xFB 0xFF
  });
});

describe('pushSupport', () => {
  const base = {
    hasServiceWorker: true,
    hasPushManager: true,
    hasNotification: true,
    permission: 'default' as NotificationPermission | null,
    isIos: false,
    standalone: false,
    configured: true,
  };
  it('lista cuando todo está disponible', () => {
    expect(pushSupport(base)).toBe('ready');
    expect(pushSupport({ ...base, permission: 'granted' })).toBe('ready');
  });
  it('sin clave VAPID en el servidor no se puede activar (gana sobre todo lo demás)', () => {
    expect(pushSupport({ ...base, configured: false, isIos: true })).toBe('not-configured');
  });
  it('iPhone en el navegador pide instalar la app; ya instalada pasa', () => {
    expect(pushSupport({ ...base, isIos: true })).toBe('ios-install');
    expect(pushSupport({ ...base, isIos: true, standalone: true })).toBe('ready');
  });
  it('falta de APIs o permiso bloqueado', () => {
    expect(pushSupport({ ...base, hasPushManager: false })).toBe('unsupported');
    expect(pushSupport({ ...base, hasServiceWorker: false })).toBe('unsupported');
    expect(pushSupport({ ...base, hasNotification: false, permission: null })).toBe('unsupported');
    expect(pushSupport({ ...base, permission: 'denied' })).toBe('denied');
  });
});
