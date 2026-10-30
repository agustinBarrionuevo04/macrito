import { describe, expect, it } from 'vitest';
import { chooseInstallOffer, detectPlatform, isDismissed } from './install';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.88 Mobile/15E148 Safari/604.1';
const IPHONE_INSTAGRAM =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21E219 Instagram 330.0.0.20.114';
const IPAD_DESKTOP_MODE =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const MAC_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

describe('detectPlatform', () => {
  it('iPhone en Safari', () => {
    expect(detectPlatform({ userAgent: IPHONE_SAFARI })).toBe('ios-safari');
  });

  it('iPhone en Chrome o dentro de otra app no es Safari', () => {
    expect(detectPlatform({ userAgent: IPHONE_CHROME })).toBe('ios-other');
    expect(detectPlatform({ userAgent: IPHONE_INSTAGRAM })).toBe('ios-other');
  });

  it('iPad en modo escritorio se detecta por la pantalla táctil', () => {
    expect(
      detectPlatform({ userAgent: IPAD_DESKTOP_MODE, platform: 'MacIntel', maxTouchPoints: 5 }),
    ).toBe('ios-safari');
  });

  it('una Mac de verdad (sin pantalla táctil) es escritorio', () => {
    expect(detectPlatform({ userAgent: MAC_SAFARI, platform: 'MacIntel', maxTouchPoints: 0 })).toBe(
      'desktop',
    );
  });

  it('Android y escritorio', () => {
    expect(detectPlatform({ userAgent: ANDROID_CHROME })).toBe('android');
    expect(detectPlatform({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/124' })).toBe(
      'desktop',
    );
  });
});

describe('isDismissed', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = 1_000 * DAY;

  it('respeta la ventana de 7 días', () => {
    expect(isDismissed(now - 6 * DAY, now)).toBe(true);
    expect(isDismissed(now - 7 * DAY, now)).toBe(false);
    expect(isDismissed(now - 30 * DAY, now)).toBe(false);
  });

  it('sin registro, con un valor roto o del futuro, no está descartado', () => {
    expect(isDismissed(null, now)).toBe(false);
    expect(isDismissed(Number.NaN, now)).toBe(false);
    expect(isDismissed(now + DAY, now)).toBe(false);
  });
});

describe('chooseInstallOffer', () => {
  const base = {
    platform: 'android',
    standalone: false,
    hasPrompt: false,
    dismissed: false,
  } as const;

  it('ya instalada o descartada: nada', () => {
    expect(chooseInstallOffer({ ...base, hasPrompt: true, standalone: true })).toBe('none');
    expect(chooseInstallOffer({ ...base, hasPrompt: true, dismissed: true })).toBe('none');
    expect(chooseInstallOffer({ ...base, platform: 'ios-safari', standalone: true })).toBe('none');
  });

  it('con el evento beforeinstallprompt: botón de instalar', () => {
    expect(chooseInstallOffer({ ...base, hasPrompt: true })).toBe('prompt');
    expect(chooseInstallOffer({ ...base, platform: 'desktop', hasPrompt: true })).toBe('prompt');
  });

  it('iOS Safari: pasos manuales; iOS en otro navegador: abrir en Safari', () => {
    expect(chooseInstallOffer({ ...base, platform: 'ios-safari' })).toBe('ios-steps');
    expect(chooseInstallOffer({ ...base, platform: 'ios-other' })).toBe('ios-open-safari');
  });

  it('Android sin evento todavía, o escritorio sin evento: nada', () => {
    expect(chooseInstallOffer(base)).toBe('none');
    expect(chooseInstallOffer({ ...base, platform: 'desktop' })).toBe('none');
  });
});
