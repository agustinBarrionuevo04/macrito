/** Detección de plataforma e instalación de la PWA. Lógica pura; el navegador la alimenta. */

export type InstallPlatform = 'ios-safari' | 'ios-other' | 'android' | 'desktop';

export type PlatformInput = {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
};

// Navegadores de iOS que no son Safari, y webviews de apps (no pueden "Añadir a inicio").
const IOS_NON_SAFARI =
  /CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|FBAN|FBAV|Instagram|Line\/|Twitter|MicroMessenger/i;

export function detectPlatform({
  userAgent,
  platform,
  maxTouchPoints = 0,
}: PlatformInput): InstallPlatform {
  // iPadOS 13+ se presenta como Mac; se distingue por la pantalla táctil.
  const isIos =
    /iPhone|iPad|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
  if (isIos) return IOS_NON_SAFARI.test(userAgent) ? 'ios-other' : 'ios-safari';
  if (/Android/i.test(userAgent)) return 'android';
  return 'desktop';
}

export const DISMISS_DAYS = 7;

/** ¿El usuario descartó el aviso hace menos de `DISMISS_DAYS`? */
export function isDismissed(dismissedAt: number | null, now: number): boolean {
  if (dismissedAt === null || !Number.isFinite(dismissedAt) || dismissedAt > now) return false;
  return now - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

export type InstallOffer = 'none' | 'prompt' | 'ios-steps' | 'ios-open-safari';

/**
 * Qué mostrar para instalar:
 * - ya instalada o descartada → nada;
 * - hay evento `beforeinstallprompt` (Android/Chrome) → botón "Instalar";
 * - iOS Safari → pasos manuales (iOS no tiene `beforeinstallprompt`);
 * - iOS en otro navegador → pedir que abra en Safari.
 */
export function chooseInstallOffer(input: {
  platform: InstallPlatform;
  standalone: boolean;
  hasPrompt: boolean;
  dismissed: boolean;
}): InstallOffer {
  const { platform, standalone, hasPrompt, dismissed } = input;
  if (standalone || dismissed) return 'none';
  if (hasPrompt) return 'prompt';
  if (platform === 'ios-safari') return 'ios-steps';
  if (platform === 'ios-other') return 'ios-open-safari';
  return 'none';
}
