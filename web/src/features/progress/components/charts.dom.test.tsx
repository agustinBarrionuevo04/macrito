// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CaloriesChart, type CalorieBar } from './calories-chart';
import { RangeTabs } from './range-tabs';
import { StatTile } from './stat-tile';
import { WeeksTable } from './weeks-table';
import { WeightChart } from './weight-chart';
import { lastDays } from '../stats';

afterEach(cleanup);

const days = lastDays('2026-03-15', 7);

describe('WeightChart', () => {
  const readings = [
    { day: '2026-03-10', weightKg: 80.4 },
    { day: '2026-03-12', weightKg: 79.6 },
    { day: '2026-03-15', weightKg: 79.2 },
  ];
  const average = [
    { day: '2026-03-12', weightKg: 80, samples: 2 },
    { day: '2026-03-15', weightKg: 79.73, samples: 3 },
  ];

  it('no dibuja nada sin lecturas', () => {
    const { container } = render(<WeightChart days={days} readings={[]} average={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('describe el gráfico para lectores de pantalla, con el rango de peso', () => {
    render(<WeightChart days={days} readings={readings} average={average} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe(
      'Gráfico de peso: 3 lecturas, de 80,4 kg a 79,2 kg (promedio de 7 días)',
    );
  });

  it('dibuja un punto por lectura, la línea del promedio y la leyenda', () => {
    const { container } = render(<WeightChart days={days} readings={readings} average={average} />);
    expect(container.querySelectorAll('circle')).toHaveLength(3 + 1); // lecturas + punto final del promedio
    expect(container.querySelectorAll('path')).toHaveLength(1);
    expect(screen.getByText('Lecturas')).toBeTruthy();
    expect(screen.getByText('Promedio de 7 días')).toBeTruthy();
    expect(screen.getByText('79,7 kg')).toBeTruthy(); // valor final rotulado directo
  });

  it('con un solo punto de promedio no dibuja línea', () => {
    const { container } = render(
      <WeightChart days={days} readings={readings} average={[average[0]!]} />,
    );
    expect(container.querySelectorAll('path')).toHaveLength(0);
  });

  it('tocar un punto muestra su detalle, con el promedio si lo hay', () => {
    render(<WeightChart days={days} readings={readings} average={average} />);
    expect(screen.getByText('Tocá un punto o una columna para ver el detalle.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '12/03/2026 · 79,6 kg' }));
    expect(screen.getByText('12/03/2026 · 79,6 kg (promedio 80 kg)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '10/03/2026 · 80,4 kg' }));
    expect(screen.getByText('10/03/2026 · 80,4 kg')).toBeTruthy(); // sin promedio ese día
  });

  it('también responde al foco (teclado)', () => {
    render(<WeightChart days={days} readings={readings} average={average} />);
    fireEvent.focus(screen.getByRole('button', { name: '15/03/2026 · 79,2 kg' }));
    expect(screen.getByText('15/03/2026 · 79,2 kg (promedio 79,7 kg)')).toBeTruthy();
  });

  it('la misma información está en una tabla, la más nueva primero', () => {
    render(<WeightChart days={days} readings={readings} average={average} />);
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]!).getByText('15/03/2026')).toBeTruthy();
    expect(within(rows[1]!).getByText('79,7')).toBeTruthy();
    expect(within(rows[3]!).getByText('—')).toBeTruthy(); // 10/3 todavía sin promedio
  });
});

describe('CaloriesChart', () => {
  const bar = (key: string, kcal: number | null): CalorieBar => ({
    key,
    axis: key.slice(8),
    full: `${key.slice(8)}/03/2026`,
    kcal,
  });
  const bars = [bar('2026-03-13', 1800), bar('2026-03-14', null), bar('2026-03-15', 2300)];

  it('sin ninguna columna con datos muestra un aviso en lugar de un gráfico vacío', () => {
    render(<CaloriesChart bars={[bar('2026-03-15', null)]} target={2000} weekly={false} />);
    expect(screen.getByText(/Todavía no hay calorías/)).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('dibuja solo las columnas con registros (un día sin registrar no es 0 kcal) y la meta rotulada', () => {
    const { container } = render(<CaloriesChart bars={bars} target={2000} weekly={false} />);
    expect(container.querySelectorAll('path')).toHaveLength(2);
    expect(screen.getByText('Meta 2.000')).toBeTruthy();
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe(
      'Gráfico de calorías: 2 columnas, meta 2.000 kcal',
    );
  });

  it('el detalle compara con la meta', () => {
    render(<CaloriesChart bars={bars} target={2000} weekly={false} />);
    fireEvent.click(screen.getByRole('button', { name: '15/03/2026 · 2.300 kcal' }));
    expect(screen.getByText('15/03/2026 · 2.300 kcal · meta 2.000')).toBeTruthy();
  });

  it('sin meta no dibuja la línea ni la menciona', () => {
    render(<CaloriesChart bars={bars} target={null} weekly={false} />);
    expect(screen.queryByText(/^Meta/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '13/03/2026 · 1.800 kcal' }));
    expect(screen.getByText('13/03/2026 · 1.800 kcal')).toBeTruthy();
  });

  it('la tabla lista solo los días con datos y cambia el título si son semanas', () => {
    const { rerender } = render(<CaloriesChart bars={bars} target={2000} weekly={false} />);
    expect(screen.getByRole('columnheader', { name: 'Día' })).toBeTruthy();
    expect(screen.getAllByRole('row')).toHaveLength(3); // encabezado + 2 días
    rerender(<CaloriesChart bars={bars} target={2000} weekly />);
    expect(screen.getByRole('columnheader', { name: 'Semana' })).toBeTruthy();
  });

  it('una meta mayor que todas las columnas igual entra en el eje', () => {
    const { container } = render(
      <CaloriesChart bars={[bar('2026-03-15', 500)]} target={3000} weekly={false} />,
    );
    const line = container.querySelector('line.stroke-foreground')!;
    expect(Number(line.getAttribute('y1'))).toBeGreaterThan(0);
  });
});

describe('RangeTabs', () => {
  it('links a cada período; el actual queda marcado y el de 30 es la raíz', () => {
    render(<RangeTabs current={7} />);
    expect(screen.getByRole('link', { name: '7 días' }).getAttribute('href')).toBe(
      '/progress?range=7',
    );
    expect(screen.getByRole('link', { name: '30 días' }).getAttribute('href')).toBe('/progress');
    expect(screen.getByRole('link', { name: '90 días' }).getAttribute('href')).toBe(
      '/progress?range=90',
    );
    expect(screen.getByRole('link', { name: '7 días' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: '30 días' }).getAttribute('aria-current')).toBeNull();
  });
});

describe('StatTile', () => {
  it('muestra la etiqueta, el valor y la pista opcional', () => {
    const { rerender } = render(<StatTile label="Racha" value="3 días" hint="seguidos" />);
    expect(screen.getByText('Racha')).toBeTruthy();
    expect(screen.getByText('3 días')).toBeTruthy();
    expect(screen.getByText('seguidos')).toBeTruthy();
    rerender(<StatTile label="Racha" value="3 días" />);
    expect(screen.queryByText('seguidos')).toBeNull();
  });
});

describe('WeeksTable', () => {
  it('muestra los promedios por semana y avisa las semanas sin registros', () => {
    render(
      <WeeksTable
        rows={[
          {
            from: '2026-03-09',
            to: '2026-03-15',
            loggedDays: 5,
            avg: { kcal: 1980, protein_g: 120, carbs_g: 210, fat_g: 55 },
          },
          { from: '2026-03-02', to: '2026-03-08', loggedDays: 0, avg: null },
        ]}
      />,
    );
    const first = screen.getAllByRole('row')[1]!;
    expect(within(first).getByText('9/3 al 15/3')).toBeTruthy();
    expect(within(first).getByText('1.980')).toBeTruthy();
    expect(within(first).getByText('5')).toBeTruthy();
    expect(screen.getByText('Sin registros esta semana')).toBeTruthy();
  });
});
