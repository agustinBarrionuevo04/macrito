import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { InstallBanner } from '@/components/pwa/install-banner';
import { BottomNav } from './bottom-nav';
import { Button } from './button';
import { Dialog } from './dialog';
import { MacroBar } from './macro-bar';
import { NumberInput } from './number-input';
import { ProgressRing } from './progress-ring';
import { Skeleton } from './skeleton';

const nav = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));

const html = (element: React.ReactElement) => renderToStaticMarkup(element);

describe('Button', () => {
  it('por defecto es type="button" para no enviar formularios sin querer', () => {
    expect(html(<Button>Guardar</Button>)).toContain('type="button"');
    expect(html(<Button type="submit">Guardar</Button>)).toContain('type="submit"');
  });

  it('loading bloquea el botón y lo marca como ocupado', () => {
    const markup = html(<Button loading>Guardar</Button>);
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('animate-spin');
  });

  it('sin loading no es aria-busy y respeta disabled', () => {
    expect(html(<Button>Ok</Button>)).not.toContain('aria-busy');
    expect(html(<Button disabled>Ok</Button>)).toContain('disabled=""');
  });

  it('aplica variante y tamaño con alto táctil mínimo', () => {
    expect(html(<Button variant="danger">x</Button>)).toContain('bg-danger');
    expect(html(<Button size="md">x</Button>)).toContain('min-h-11');
    expect(html(<Button className="extra">x</Button>)).toContain('extra');
  });
});

describe('ProgressRing', () => {
  it('expone el progreso a lectores de pantalla', () => {
    const markup = html(
      <ProgressRing value={1200} max={2000} label="1.200 de 2.000 kcal">
        <span>800</span>
      </ProgressRing>,
    );
    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain('aria-label="1.200 de 2.000 kcal"');
    expect(markup).toContain('aria-valuenow="1200"');
    expect(markup).toContain('aria-valuemax="2000"');
    expect(markup).toContain('<span>800</span>');
    expect(markup).toContain('stroke-primary');
  });

  it('dibuja la fracción correcta del trazo', () => {
    const markup = html(
      <ProgressRing value={50} max={100} size={120} strokeWidth={10} label="x" />,
    );
    const circumference = 2 * Math.PI * 55;
    expect(markup).toContain(`stroke-dasharray="${circumference}"`);
    expect(markup).toContain(`stroke-dashoffset="${circumference / 2}"`);
  });

  it('pasa a color de alerta al superar la meta', () => {
    const markup = html(<ProgressRing value={2500} max={2000} label="x" />);
    expect(markup).toContain('stroke-danger');
    expect(markup).not.toContain('stroke-primary');
  });

  it('con meta 0 no revienta ni marca excedido', () => {
    const markup = html(<ProgressRing value={10} max={0} label="x" />);
    expect(markup).toContain('aria-valuemax="0"');
    expect(markup).toContain('stroke-primary');
  });
});

describe('MacroBar', () => {
  it('muestra "valor / meta unidad" con formato argentino y el ancho de la barra', () => {
    const markup = html(<MacroBar label="Proteínas" value={96} target={160} kind="protein" />);
    expect(markup).toContain('Proteínas');
    expect(markup).toContain('96 / 160 g');
    expect(markup).toContain('width:60%');
    expect(markup).toContain('bg-protein');
    expect(markup).toContain('aria-valuenow="96"');
  });

  it('se tiñe de alerta y llena la barra al pasarse', () => {
    const markup = html(<MacroBar label="Grasas" value={90} target={60} kind="fat" />);
    expect(markup).toContain('width:100%');
    expect(markup).toContain('bg-danger');
    expect(markup).toContain('text-danger');
    expect(markup).not.toContain('bg-fat');
  });

  it('separador de miles de es-AR', () => {
    expect(html(<MacroBar label="Calorías" value={1200} target={2000} unit="kcal" />)).toContain(
      '1.200 / 2.000 kcal',
    );
  });
});

describe('Skeleton', () => {
  it('es decorativo para lectores de pantalla', () => {
    expect(html(<Skeleton className="h-4 w-20" />)).toContain('aria-hidden="true"');
  });
});

describe('NumberInput', () => {
  it('asocia la etiqueta al campo y pide teclado decimal', () => {
    const markup = html(
      <NumberInput label="Peso" unit="kg" value={70} onChange={() => undefined} />,
    );
    expect(markup).toMatch(/<label for="([^"]+)"[^>]*>Peso<\/label>/);
    const id = /<label for="([^"]+)"/.exec(markup)?.[1];
    expect(markup).toContain(`id="${id}"`);
    expect(markup).toContain('inputMode="decimal"');
    expect(markup).toContain('>kg<');
  });

  it('muestra el valor con coma decimal y vacío si es null', () => {
    expect(html(<NumberInput label="Peso" value={62.5} onChange={() => undefined} />)).toContain(
      'value="62,5"',
    );
    expect(html(<NumberInput label="Peso" value={null} onChange={() => undefined} />)).toContain(
      'value=""',
    );
  });

  it('el error se anuncia y se asocia al campo', () => {
    const markup = html(
      <NumberInput label="Peso" value={1} error="Valor inválido" onChange={() => undefined} />,
    );
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('Valor inválido');
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toMatch(/aria-describedby="[^"]+"/);
  });
});

describe('Dialog', () => {
  it('tiene nombre accesible, descripción y botón de cerrar', () => {
    const markup = html(
      <Dialog
        open={false}
        onClose={() => undefined}
        title="Elegí la porción"
        description="En gramos"
      >
        <p>contenido</p>
      </Dialog>,
    );
    expect(markup).toMatch(/<dialog[^>]*aria-labelledby="[^"]+"/);
    expect(markup).toMatch(/<dialog[^>]*aria-describedby="[^"]+"/);
    expect(markup).toContain('Elegí la porción');
    expect(markup).toContain('En gramos');
    expect(markup).toContain('aria-label="Cerrar"');
    expect(markup).toContain('contenido');
  });

  it('cerrado no lleva el atributo open (lo maneja showModal en el cliente)', () => {
    expect(html(<Dialog open={false} onClose={() => undefined} title="t" />)).not.toMatch(
      /<dialog[^>]*\sopen/,
    );
  });

  it('la variante sheet se ancla abajo', () => {
    expect(
      html(<Dialog open={false} onClose={() => undefined} title="t" variant="sheet" />),
    ).toContain('rounded-b-none');
  });
});

describe('BottomNav', () => {
  it('lista las cuatro pestañas con sus rutas', () => {
    nav.pathname = '/';
    const markup = html(<BottomNav />);
    expect(markup).toContain('aria-label="Navegación principal"');
    for (const [href, label] of [
      ['/', 'Hoy'],
      ['/add', 'Agregar'],
      ['/progress', 'Progreso'],
      ['/profile', 'Perfil'],
    ] as const) {
      expect(markup).toMatch(new RegExp(`href="${href}"[^>]*>.*${label}`));
    }
  });

  it('marca como actual solo la pestaña de la ruta', () => {
    nav.pathname = '/add/barcode';
    const markup = html(<BottomNav />);
    expect(markup.match(/aria-current="page"/g)).toHaveLength(1);
    expect(markup).toMatch(
      /href="\/add"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/add"/,
    );
  });
});

describe('InstallBanner', () => {
  it('no renderiza nada en el servidor: decide en el navegador', () => {
    expect(html(<InstallBanner />)).toBe('');
  });
});
