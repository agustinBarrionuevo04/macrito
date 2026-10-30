// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ createDetector: vi.fn() }));
vi.mock('../scanner', () => ({ createDetector: h.createDetector }));

const { BarcodeScanner } = await import('./barcode-scanner');

const VALID = '7790001000019';

function mockCamera(impl: () => Promise<unknown>) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(impl) },
  });
}

const track = () => ({ stop: vi.fn() });

beforeEach(() => {
  h.createDetector.mockReset();
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const start = () => fireEvent.click(screen.getByRole('button', { name: 'Abrir la cámara' }));
const settle = () => act(() => vi.advanceTimersByTimeAsync(300));

describe('BarcodeScanner: ingreso a mano', () => {
  it('un código válido se normaliza y se entrega', () => {
    const onCode = vi.fn();
    render(<BarcodeScanner onCode={onCode} />);
    fireEvent.change(screen.getByLabelText('Código de barras'), {
      target: { value: '7790 001 000019' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar código' }));
    expect(onCode).toHaveBeenCalledWith(VALID);
  });

  it('un código inválido (dígito verificador, letras, vacío) muestra error y no se entrega', () => {
    const onCode = vi.fn();
    render(<BarcodeScanner onCode={onCode} />);
    for (const bad of ['7790001000011', 'abc', '']) {
      fireEvent.change(screen.getByLabelText('Código de barras'), { target: { value: bad } });
      fireEvent.click(screen.getByRole('button', { name: 'Buscar código' }));
      expect(screen.getByRole('alert').textContent).toContain('no es válido');
    }
    expect(onCode).not.toHaveBeenCalled();
  });

  it('el error se va al seguir escribiendo', () => {
    render(<BarcodeScanner onCode={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Buscar código' }));
    expect(screen.getByRole('alert')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Código de barras'), { target: { value: '7' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('mientras busca el producto deshabilita los botones', () => {
    render(<BarcodeScanner onCode={vi.fn()} busy />);
    expect(
      (screen.getByRole('button', { name: 'Abrir la cámara' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Buscar código' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

describe('BarcodeScanner: cámara', () => {
  it('permiso denegado explica cómo habilitarlo y deja el ingreso a mano', async () => {
    mockCamera(() => Promise.reject(new DOMException('no', 'NotAllowedError')));
    h.createDetector.mockResolvedValue({ detect: vi.fn() });
    render(<BarcodeScanner onCode={vi.fn()} />);
    start();
    await settle();
    expect(screen.getByText('Necesitamos permiso para usar la cámara')).toBeTruthy();
    expect(screen.getByLabelText('Código de barras')).toBeTruthy();
  });

  it('sin cámara en el dispositivo', async () => {
    mockCamera(() => Promise.reject(new DOMException('no', 'NotFoundError')));
    h.createDetector.mockResolvedValue({ detect: vi.fn() });
    render(<BarcodeScanner onCode={vi.fn()} />);
    start();
    await settle();
    expect(screen.getByRole('alert').textContent).toContain('No encontramos una cámara');
  });

  it('un error cualquiera de la cámara', async () => {
    mockCamera(() => Promise.reject(new Error('boom')));
    h.createDetector.mockResolvedValue({ detect: vi.fn() });
    render(<BarcodeScanner onCode={vi.fn()} />);
    start();
    await settle();
    expect(screen.getByRole('alert').textContent).toContain('No pudimos abrir la cámara');
  });

  it('sin getUserMedia (contexto no seguro) avisa que no hay soporte', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
    render(<BarcodeScanner onCode={vi.fn()} />);
    start();
    await settle();
    expect(screen.getByRole('alert').textContent).toContain('no puede leer códigos');
  });

  it('sin lector disponible apaga la cámara y avisa', async () => {
    const t = track();
    mockCamera(() => Promise.resolve({ getTracks: () => [t] }));
    h.createDetector.mockResolvedValue(null);
    render(<BarcodeScanner onCode={vi.fn()} />);
    start();
    await settle();
    expect(t.stop).toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('no puede leer códigos');
  });

  it('lee un código, apaga la cámara y lo entrega una sola vez', async () => {
    const t = track();
    mockCamera(() => Promise.resolve({ getTracks: () => [t] }));
    const detect = vi.fn().mockResolvedValue([{ rawValue: VALID }]);
    h.createDetector.mockResolvedValue({ detect });
    const onCode = vi.fn();
    render(<BarcodeScanner onCode={onCode} />);
    start();
    await settle();
    const video = document.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'readyState', { value: 4 });
    await settle();
    await settle();
    await waitFor(() => expect(onCode).toHaveBeenCalledWith(VALID));
    expect(onCode).toHaveBeenCalledTimes(1);
    expect(t.stop).toHaveBeenCalled();
    expect(document.querySelector('video')).toBeNull();
  });

  it('ignora lecturas inválidas y errores de un cuadro, y sigue escaneando', async () => {
    const t = track();
    mockCamera(() => Promise.resolve({ getTracks: () => [t] }));
    const detect = vi
      .fn()
      .mockResolvedValueOnce([{ rawValue: '7790001000011' }])
      .mockRejectedValueOnce(new Error('frame'))
      .mockResolvedValue([{ rawValue: VALID }]);
    h.createDetector.mockResolvedValue({ detect });
    const onCode = vi.fn();
    render(<BarcodeScanner onCode={onCode} />);
    start();
    await settle();
    Object.defineProperty(document.querySelector('video')!, 'readyState', { value: 4 });
    for (let i = 0; i < 4; i++) await settle();
    await waitFor(() => expect(onCode).toHaveBeenCalledWith(VALID));
    expect(detect.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('"Cerrar la cámara" y desmontar apagan el stream', async () => {
    const t = track();
    mockCamera(() => Promise.resolve({ getTracks: () => [t] }));
    h.createDetector.mockResolvedValue({ detect: vi.fn().mockResolvedValue([]) });
    const { unmount } = render(<BarcodeScanner onCode={vi.fn()} />);
    start();
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar la cámara' }));
    expect(t.stop).toHaveBeenCalledTimes(1);

    start();
    await settle();
    unmount();
    expect(t.stop).toHaveBeenCalledTimes(2);
  });
});
