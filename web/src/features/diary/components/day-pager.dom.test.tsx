// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: h.push }) }));

const { DayPager } = await import('./day-pager');

const TODAY = '2026-03-15';

const renderPager = (day: string) =>
  render(
    <DayPager day={day} today={TODAY}>
      <p>contenido</p>
    </DayPager>,
  );

const swipe = (from: [number, number], to: [number, number]) => {
  const target = screen.getByText('contenido');
  fireEvent.touchStart(target, { touches: [{ clientX: from[0], clientY: from[1] }] });
  fireEvent.touchEnd(target, { changedTouches: [{ clientX: to[0], clientY: to[1] }] });
};

beforeEach(() => h.push.mockReset());
afterEach(cleanup);

describe('DayPager', () => {
  it('hoy: el título dice "Hoy" y no se puede ir al día siguiente', () => {
    renderPager(TODAY);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Hoy');
    expect(
      (screen.getByRole('button', { name: 'Día siguiente' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.queryByRole('button', { name: 'Volver a hoy' })).toBeNull();
  });

  it('"Día anterior" navega a la fecha de ayer con ?date=', () => {
    renderPager(TODAY);
    fireEvent.click(screen.getByRole('button', { name: 'Día anterior' }));
    expect(h.push).toHaveBeenCalledWith('/?date=2026-03-14');
  });

  it('cruza el cambio de mes y de año sin saltear días', () => {
    renderPager('2026-03-01');
    fireEvent.click(screen.getByRole('button', { name: 'Día anterior' }));
    expect(h.push).toHaveBeenLastCalledWith('/?date=2026-02-28');
    cleanup();
    renderPager('2026-01-01');
    fireEvent.click(screen.getByRole('button', { name: 'Día anterior' }));
    expect(h.push).toHaveBeenLastCalledWith('/?date=2025-12-31');
  });

  it('ayer se titula "Ayer" y otro día con fecha completa; siguiente vuelve hacia hoy', () => {
    renderPager('2026-03-14');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Ayer');
    fireEvent.click(screen.getByRole('button', { name: 'Día siguiente' }));
    expect(h.push).toHaveBeenCalledWith('/'); // hoy es la raíz, sin parámetro
    cleanup();
    renderPager('2026-03-10');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('martes, 10 de marzo');
  });

  it('en otro día ofrece volver a hoy', () => {
    renderPager('2026-03-10');
    fireEvent.click(screen.getByRole('button', { name: 'Volver a hoy' }));
    expect(h.push).toHaveBeenCalledWith('/');
  });

  it('deslizar a la derecha va al día anterior; a la izquierda, al siguiente', () => {
    renderPager('2026-03-10');
    swipe([50, 300], [200, 310]);
    expect(h.push).toHaveBeenLastCalledWith('/?date=2026-03-09');
    swipe([250, 300], [100, 295]);
    expect(h.push).toHaveBeenLastCalledWith('/?date=2026-03-11');
  });

  it('deslizar a la izquierda estando en hoy no hace nada (no hay futuro)', () => {
    renderPager(TODAY);
    swipe([250, 300], [100, 300]);
    expect(h.push).not.toHaveBeenCalled();
  });

  it('un gesto vertical (scroll) no cambia de día', () => {
    renderPager('2026-03-10');
    swipe([100, 100], [130, 400]);
    expect(h.push).not.toHaveBeenCalled();
  });

  it('el selector de fecha no admite días futuros y navega al elegido', () => {
    renderPager(TODAY);
    const picker = screen.getByLabelText('Elegir fecha') as HTMLInputElement;
    expect(picker.max).toBe(TODAY);
    fireEvent.change(picker, { target: { value: '2026-03-01' } });
    expect(h.push).toHaveBeenCalledWith('/?date=2026-03-01');
    h.push.mockReset();
    fireEvent.change(picker, { target: { value: '2026-03-20' } });
    fireEvent.change(picker, { target: { value: '' } });
    expect(h.push).not.toHaveBeenCalled();
  });
});
