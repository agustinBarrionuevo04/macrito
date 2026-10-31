// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReminderRow } from '../server';

const h = vi.hoisted(() => ({
  saveSubscription: vi.fn(),
  removeSubscription: vi.fn(),
  saveReminder: vi.fn(),
  sendTestNotification: vi.fn(),
  show: vi.fn(),
}));
vi.mock('../actions', () => ({
  saveSubscription: h.saveSubscription,
  removeSubscription: h.removeSubscription,
  saveReminder: h.saveReminder,
  sendTestNotification: h.sendTestNotification,
}));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: h.show, dismiss: vi.fn() }) }));

const { ReminderSettings } = await import('./reminder-settings');

const INITIAL: ReminderRow[] = [
  { meal: 'breakfast', enabled: false, remindAt: '09:00' },
  { meal: 'lunch', enabled: true, remindAt: '13:00' },
  { meal: 'snack', enabled: false, remindAt: '17:30' },
  { meal: 'dinner', enabled: false, remindAt: '21:00' },
];
const KEY = 'AQID'; // base64url válido

type Env = {
  permission?: NotificationPermission;
  subscribed?: boolean;
  subscribe?: (options?: unknown) => Promise<unknown>;
  ios?: boolean;
  standalone?: boolean;
  sw?: boolean;
};

function fakeSubscription(endpoint = 'https://push.example/abc') {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: 'k', auth: 'a' } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  };
}

function setupBrowser(env: Env = {}) {
  const current = env.subscribed ? fakeSubscription() : null;
  const state = { current };
  const pushManager = {
    getSubscription: vi.fn(async () => state.current),
    subscribe: vi.fn(
      env.subscribe ??
        (async (options?: unknown) => {
          void options;
          return (state.current = fakeSubscription('https://push.example/nueva'));
        }),
    ),
  };
  const requestPermission = vi.fn(async () => env.permission ?? 'granted');
  vi.stubGlobal(
    'Notification',
    Object.assign(function () {}, { permission: env.permission ?? 'default', requestPermission }),
  );
  vi.stubGlobal('PushManager', function () {});
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: env.sw === false ? undefined : { ready: Promise.resolve({ pushManager }) },
  });
  if (env.sw === false) delete (navigator as unknown as Record<string, unknown>).serviceWorker;
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    value: env.ios
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Safari'
      : 'Mozilla/5.0 (Linux; Android 14) Chrome/120',
  });
  window.matchMedia = vi.fn().mockReturnValue({
    matches: env.standalone === true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;
  return { pushManager, requestPermission, state };
}

beforeEach(() => Object.values(h).forEach((fn) => fn.mockReset()));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const view = (key: string | null = KEY) =>
  render(<ReminderSettings vapidPublicKey={key} initial={INITIAL} />);

describe('ReminderSettings: estados', () => {
  it('sin clave VAPID dice que no está disponible y no ofrece activar', async () => {
    setupBrowser();
    view(null);
    expect(await screen.findByText(/todavía no están disponibles/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Activar avisos/ })).toBeNull();
  });
  it('en iPhone fuera de la app instalada explica cómo instalarla', async () => {
    setupBrowser({ ios: true });
    view();
    expect(await screen.findByText(/Añadir a pantalla de inicio/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Activar avisos/ })).toBeNull();
  });
  it('en iPhone con la app instalada deja activar', async () => {
    setupBrowser({ ios: true, standalone: true });
    view();
    expect(
      await screen.findByRole('button', { name: 'Activar avisos en este dispositivo' }),
    ).toBeTruthy();
  });
  it('con el permiso bloqueado lo explica', async () => {
    setupBrowser({ permission: 'denied' });
    view();
    expect(await screen.findByText(/Bloqueaste las notificaciones/)).toBeTruthy();
  });
  it('sin service worker dice que el navegador no los permite', async () => {
    setupBrowser({ sw: false });
    view();
    expect(await screen.findByText(/no permite avisos/)).toBeTruthy();
  });
});

describe('ReminderSettings: activar este dispositivo', () => {
  it('pide permiso, se suscribe con la clave pública y guarda la suscripción', async () => {
    const browser = setupBrowser();
    h.saveSubscription.mockResolvedValue({ ok: true });
    view();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Activar avisos en este dispositivo' }),
    );
    await waitFor(() => expect(h.saveSubscription).toHaveBeenCalled());
    expect(browser.requestPermission).toHaveBeenCalled();
    const options = browser.pushManager.subscribe.mock.calls[0]![0] as {
      userVisibleOnly: boolean;
      applicationServerKey: Uint8Array;
    };
    expect(options.userVisibleOnly).toBe(true);
    expect([...options.applicationServerKey]).toEqual([1, 2, 3]);
    expect(h.saveSubscription).toHaveBeenCalledWith({
      endpoint: 'https://push.example/nueva',
      keys: { p256dh: 'k', auth: 'a' },
    });
    expect(await screen.findByText(/avisos están activados/)).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Avisar en almuerzo' })).toBeTruthy();
  });
  it('si no da permiso lo avisa y no se suscribe', async () => {
    const browser = setupBrowser();
    browser.requestPermission.mockResolvedValue('denied');
    view();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Activar avisos en este dispositivo' }),
    );
    expect((await screen.findByRole('alert')).textContent).toMatch(/No diste permiso/);
    expect(browser.pushManager.subscribe).not.toHaveBeenCalled();
    expect(h.saveSubscription).not.toHaveBeenCalled();
  });
  it('si el navegador rechaza la suscripción (sin servicio push) muestra el error y sigue pudiendo reintentar', async () => {
    setupBrowser({
      subscribe: async () => {
        throw new DOMException('push service error', 'AbortError');
      },
    });
    view();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Activar avisos en este dispositivo' }),
    );
    expect((await screen.findByRole('alert')).textContent).toMatch(/No pudimos activar/);
    expect(screen.getByRole('button', { name: 'Activar avisos en este dispositivo' })).toBeTruthy();
    expect(h.saveSubscription).not.toHaveBeenCalled();
  });
  it('si el servidor no guarda la suscripción muestra su error', async () => {
    setupBrowser();
    h.saveSubscription.mockResolvedValue({
      ok: false,
      error: 'No pudimos activar los avisos en este dispositivo.',
    });
    view();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Activar avisos en este dispositivo' }),
    );
    expect((await screen.findByRole('alert')).textContent).toMatch(/No pudimos activar/);
    expect(screen.queryByRole('switch')).toBeNull();
  });
});

describe('ReminderSettings: dispositivo ya activado', () => {
  it('muestra las cuatro comidas con su estado y hora; la hora está deshabilitada si el aviso está apagado', async () => {
    setupBrowser({ subscribed: true });
    view();
    expect(await screen.findByRole('switch', { name: 'Avisar en desayuno' })).toBeTruthy();
    expect(screen.getAllByRole('switch')).toHaveLength(4);
    expect(
      (screen.getByRole('switch', { name: 'Avisar en almuerzo' }) as HTMLInputElement).checked,
    ).toBe(true);
    expect((screen.getByLabelText('Hora del aviso de almuerzo') as HTMLInputElement).value).toBe(
      '13:00',
    );
    expect((screen.getByLabelText('Hora del aviso de almuerzo') as HTMLInputElement).disabled).toBe(
      false,
    );
    expect((screen.getByLabelText('Hora del aviso de cena') as HTMLInputElement).disabled).toBe(
      true,
    );
  });
  it('activar una comida y cambiar su hora se guardan', async () => {
    setupBrowser({ subscribed: true });
    h.saveReminder.mockResolvedValue({ ok: true });
    view();
    fireEvent.click(await screen.findByRole('switch', { name: 'Avisar en cena' }));
    await waitFor(() =>
      expect(h.saveReminder).toHaveBeenCalledWith('dinner', { enabled: true, remindAt: '21:00' }),
    );
    fireEvent.change(screen.getByLabelText('Hora del aviso de cena'), {
      target: { value: '20:30' },
    });
    await waitFor(() =>
      expect(h.saveReminder).toHaveBeenLastCalledWith('dinner', {
        enabled: true,
        remindAt: '20:30',
      }),
    );
  });
  it('si no se pudo guardar vuelve al valor anterior y avisa', async () => {
    setupBrowser({ subscribed: true });
    h.saveReminder.mockResolvedValue({ ok: false, error: 'No pudimos guardar el aviso.' });
    view();
    fireEvent.click(await screen.findByRole('switch', { name: 'Avisar en cena' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/No pudimos guardar/);
    await waitFor(() =>
      expect(
        (screen.getByRole('switch', { name: 'Avisar en cena' }) as HTMLInputElement).checked,
      ).toBe(false),
    );
  });
  it('la prueba avisa si salió bien y muestra el error si no', async () => {
    setupBrowser({ subscribed: true });
    h.sendTestNotification.mockResolvedValueOnce({ ok: true, delivered: 1 });
    view();
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar una prueba' }));
    await waitFor(() =>
      expect(h.show).toHaveBeenCalledWith({ message: 'Prueba enviada', tone: 'success' }),
    );
    h.sendTestNotification.mockResolvedValueOnce({
      ok: false,
      error: 'No pudimos entregar la prueba.',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar una prueba' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/No pudimos entregar/);
  });
  it('desactivar cancela la suscripción del navegador y la borra del servidor', async () => {
    const browser = setupBrowser({ subscribed: true });
    const subscription = browser.state.current!;
    h.removeSubscription.mockResolvedValue({ ok: true });
    view();
    fireEvent.click(await screen.findByRole('button', { name: 'Desactivar en este dispositivo' }));
    await waitFor(() =>
      expect(h.removeSubscription).toHaveBeenCalledWith('https://push.example/abc'),
    );
    expect(subscription.unsubscribe).toHaveBeenCalled();
    expect(
      await screen.findByRole('button', { name: 'Activar avisos en este dispositivo' }),
    ).toBeTruthy();
  });
});
