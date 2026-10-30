// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Food } from '@/types';

const h = vi.hoisted(() => ({
  analyzePhoto: vi.fn(),
  analyzeText: vi.fn(),
  resizeToJpeg: vi.fn(),
  searchFoods: vi.fn(),
  show: vi.fn(),
  createAiFood: vi.fn(),
}));
vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return { ...actual, analyzePhoto: h.analyzePhoto, analyzeText: h.analyzeText };
});
vi.mock('../resize', () => ({ resizeToJpeg: h.resizeToJpeg }));
vi.mock('@/features/add-food/api', () => ({ searchFoods: h.searchFoods }));
vi.mock('../actions', () => ({ createAiFood: h.createAiFood }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ show: h.show, dismiss: vi.fn() }) }));

const { AiAnalyzer } = await import('./ai-analyzer');
const { AiApiError } = await import('../api');

const milanesa: Food = {
  id: 'm1',
  source: 'ar_seed',
  name: 'Milanesa de carne',
  per100g: { kcal: 250, protein_g: 20, carbs_g: 15, fat_g: 12 },
  portions: [],
};

const setup = (mode: 'photo' | 'text', over: Record<string, unknown> = {}) => {
  const p = {
    initialMeal: 'dinner' as const,
    renderPicker: () => null,
    onAdd: vi.fn().mockResolvedValue({ ok: true, id: 'e' }),
    onViewDiary: vi.fn(),
    ...over,
  };
  render(<AiAnalyzer mode={mode} {...p} />);
  return p;
};

const photo = () => new File(['x'], 'comida.jpg', { type: 'image/jpeg' });
const choosePhoto = () =>
  fireEvent.change(screen.getByLabelText('Sacar o elegir una foto'), {
    target: { files: [photo()] },
  });

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  Object.values(h).forEach((fn) => fn.mockReset());
  h.resizeToJpeg.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }));
  h.searchFoods.mockResolvedValue({ foods: [milanesa], degraded: false });
});
afterEach(cleanup);

describe('AiAnalyzer: foto', () => {
  it('reduce la foto, la analiza, busca cada ítem en la base y muestra la revisión', async () => {
    h.analyzePhoto.mockResolvedValue([
      { query: 'milanesa', est_grams: 180, confidence: 'high' },
      {
        query: 'budín raro',
        est_grams: 100,
        confidence: 'low',
        per100g_guess: { kcal: 200, protein_g: 4, carbs_g: 30, fat_g: 7 },
      },
    ]);
    setup('photo');
    choosePhoto();
    await screen.findByText('Revisá lo que encontramos');
    expect(h.resizeToJpeg).toHaveBeenCalledTimes(1);
    expect(h.analyzePhoto.mock.calls[0]![0]).toBeInstanceOf(Blob);
    expect(screen.getByText('Milanesa de carne')).toBeTruthy(); // vino de la base
    expect(screen.getByText('budín raro')).toBeTruthy();
    expect(screen.getByText('Sin verificar')).toBeTruthy();
    expect((screen.getByLabelText('Comida') as HTMLSelectElement).value).toBe('dinner');
  });

  it('confirmar agrega con origen ai_photo y se vuelve al inicio', async () => {
    h.analyzePhoto.mockResolvedValue([{ query: 'milanesa', est_grams: 180, confidence: 'high' }]);
    const p = setup('photo');
    choosePhoto();
    fireEvent.click(await screen.findByRole('button', { name: 'Agregar todo al diario' }));
    await waitFor(() =>
      expect(p.onAdd).toHaveBeenCalledWith({
        food: milanesa,
        quantity_g: 180,
        meal_type: 'dinner',
        origin: 'ai_photo',
        is_estimate: true,
      }),
    );
    await screen.findByRole('button', { name: 'Sacar o elegir una foto' });
  });

  it('una foto sin comida muestra el aviso y permite reintentar', async () => {
    h.analyzePhoto.mockResolvedValue([]);
    setup('photo');
    choosePhoto();
    await screen.findByText(/No encontramos comida/);
    fireEvent.click(screen.getByRole('button', { name: 'Analizar de nuevo' }));
    expect(screen.getByRole('button', { name: 'Sacar o elegir una foto' })).toBeTruthy();
  });

  it('una foto que no se puede leer avisa y no llama al servidor', async () => {
    h.resizeToJpeg.mockRejectedValue(new Error('formato raro'));
    setup('photo');
    choosePhoto();
    await screen.findByText('No pudimos leer esa foto. Probá con otra.');
    expect(h.analyzePhoto).not.toHaveBeenCalled();
  });

  it.each([
    ['quota_exceeded', 'Llegaste al límite de 20 análisis por día. Mañana se reinicia.'],
    ['ai_unavailable', 'El servicio de IA no está disponible ahora. Probá en un rato.'],
    ['ai_timeout', 'El análisis tardó demasiado. Probá de nuevo.'],
  ])('el error %s se muestra con su mensaje y deja reintentar', async (code, message) => {
    h.analyzePhoto.mockRejectedValue(new AiApiError(code, message));
    setup('photo');
    choosePhoto();
    expect((await screen.findByRole('alert')).textContent).toBe(message);
    expect(
      (screen.getByRole('button', { name: 'Sacar o elegir una foto' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it('un error inesperado (no de la API) da el mensaje genérico', async () => {
    h.analyzePhoto.mockRejectedValue(new Error('boom'));
    setup('photo');
    choosePhoto();
    expect((await screen.findByRole('alert')).textContent).toBe(
      'No pudimos analizar. Probá de nuevo.',
    );
  });

  it('si falla la búsqueda en la base, los renglones quedan para elegir a mano', async () => {
    h.searchFoods.mockRejectedValue(new Error('503'));
    h.analyzePhoto.mockResolvedValue([{ query: 'milanesa', est_grams: 180, confidence: 'high' }]);
    setup('photo');
    choosePhoto();
    await screen.findByText('Revisá lo que encontramos');
    expect(screen.getByText(/No lo encontramos en la base/)).toBeTruthy();
  });

  it('elegir sin archivo no hace nada', () => {
    setup('photo');
    fireEvent.change(screen.getByLabelText('Sacar o elegir una foto'), { target: { files: [] } });
    expect(h.resizeToJpeg).not.toHaveBeenCalled();
  });
});

describe('AiAnalyzer: texto', () => {
  const type = (value: string) =>
    fireEvent.change(screen.getByLabelText('Qué comiste'), { target: { value } });
  const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Analizar' }));

  it('analiza el texto recortado y arma la revisión con origen ai_text', async () => {
    h.analyzeText.mockResolvedValue([
      { query: 'milanesa', est_grams: 300, count: 2, confidence: 'med' },
    ]);
    const p = setup('text');
    type('  2 milanesas con puré ');
    submit();
    await screen.findByText('Revisá lo que encontramos');
    expect(h.analyzeText.mock.calls[0]![0]).toBe('2 milanesas con puré');
    fireEvent.click(screen.getByRole('button', { name: 'Agregar todo al diario' }));
    await waitFor(() =>
      expect(p.onAdd).toHaveBeenCalledWith(
        expect.objectContaining({ origin: 'ai_text', quantity_g: 300 }),
      ),
    );
  });

  it('un texto demasiado corto no llama al servidor', () => {
    setup('text');
    type(' a ');
    submit();
    expect(screen.getByRole('alert').textContent).toContain('al menos 2 letras');
    expect(h.analyzeText).not.toHaveBeenCalled();
  });

  it('el error se va al seguir escribiendo', () => {
    setup('text');
    submit();
    expect(screen.getByRole('alert')).toBeTruthy();
    type('milanesa');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('sin comida en el texto avisa distinto que con la foto', async () => {
    h.analyzeText.mockResolvedValue([]);
    setup('text');
    type('hola qué tal');
    submit();
    await screen.findByText('No encontramos comida en lo que escribiste.');
  });

  it('un error del servidor se muestra y el texto escrito se conserva', async () => {
    h.analyzeText.mockRejectedValue(
      new AiApiError(
        'ai_bad_response',
        'No pudimos entender la respuesta del análisis. Probá de nuevo.',
      ),
    );
    setup('text');
    type('milanesa');
    submit();
    expect((await screen.findByRole('alert')).textContent).toContain('entender la respuesta');
    expect((screen.getByLabelText('Qué comiste') as HTMLTextAreaElement).value).toBe('milanesa');
  });
});
