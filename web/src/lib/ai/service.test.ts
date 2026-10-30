import { describe, expect, it, vi } from 'vitest';
import { createAiService, QuotaExceededError } from './service';
import { AiError, type AiProvider } from './types';
import type { UsageTracker } from './usage';

const tracker = (reserve = true): UsageTracker => ({
  reserve: vi.fn().mockResolvedValue(reserve),
  release: vi.fn().mockResolvedValue(undefined),
  recordTokens: vi.fn().mockResolvedValue(undefined),
});

const reply = (raw: unknown) => ({ raw, usage: { inputTokens: 1000, outputTokens: 50 } });

const make = (provider: Partial<AiProvider>, usage = tracker()) => ({
  usage,
  service: createAiService({
    provider: { analyze: vi.fn(), ...provider } as AiProvider,
    usage,
    limits: { photo: 3, text: 9 },
  }),
});

const good = { items: [{ query: 'milanesa', confidence: 'high', est_grams: 200 }] };

describe('createAiService', () => {
  it('reserva con el límite del tipo, valida y registra los tokens', async () => {
    const analyze = vi.fn().mockResolvedValue(reply(good));
    const { service, usage } = make({ analyze });
    const items = await service.analyzePhoto('u1', '2026-03-15', Uint8Array.from([1, 2, 3]));
    expect(items).toEqual([{ query: 'milanesa', est_grams: 200, confidence: 'high' }]);
    expect(usage.reserve).toHaveBeenCalledWith('u1', '2026-03-15', 'photo', 3);
    expect(usage.recordTokens).toHaveBeenCalledWith('u1', '2026-03-15', 'photo', {
      inputTokens: 1000,
      outputTokens: 50,
    });
    expect(usage.release).not.toHaveBeenCalled();
    expect(analyze.mock.calls[0]![0]).toEqual({
      kind: 'photo',
      mediaType: 'image/jpeg',
      base64: 'AQID',
    });
  });

  it('el texto usa su propio límite y su prompt', async () => {
    const analyze = vi.fn().mockResolvedValue(reply({ items: [] }));
    const { service, usage } = make({ analyze });
    expect(await service.analyzeText('u1', '2026-03-15', '2 milanesas')).toEqual([]);
    expect(usage.reserve).toHaveBeenCalledWith('u1', '2026-03-15', 'text', 9);
    expect(analyze.mock.calls[0]![0]).toEqual({ kind: 'text', text: '2 milanesas' });
  });

  it('con el límite alcanzado no llama al proveedor', async () => {
    const analyze = vi.fn();
    const { service } = make({ analyze }, tracker(false));
    await expect(service.analyzePhoto('u1', 'd', Uint8Array.from([1]))).rejects.toMatchObject({
      name: 'QuotaExceededError',
      kind: 'photo',
      limit: 3,
    });
    await expect(service.analyzeText('u1', 'd', 'x')).rejects.toBeInstanceOf(QuotaExceededError);
    expect(analyze).not.toHaveBeenCalled();
  });

  it('si el proveedor falla, libera el cupo y propaga el error', async () => {
    const error = new AiError('unavailable', 'caído');
    const { service, usage } = make({ analyze: vi.fn().mockRejectedValue(error) });
    await expect(service.analyzeText('u1', 'd', 'x')).rejects.toBe(error);
    expect(usage.release).toHaveBeenCalledWith('u1', 'd', 'text');
    expect(usage.recordTokens).not.toHaveBeenCalled();
  });

  it('una respuesta inválida del modelo consume cupo y tokens (se gastaron) y falla', async () => {
    const { service, usage } = make({
      analyze: vi.fn().mockResolvedValue(reply({ items: [{ nombre: 'huevo' }] })),
    });
    await expect(service.analyzeText('u1', 'd', 'x')).rejects.toMatchObject({
      code: 'bad_response',
    });
    expect(usage.recordTokens).toHaveBeenCalled();
    expect(usage.release).not.toHaveBeenCalled();
  });

  it('si reservar falla (base caída) no llama al proveedor', async () => {
    const analyze = vi.fn();
    const usage = tracker();
    vi.mocked(usage.reserve).mockRejectedValue(new Error('db'));
    const { service } = make({ analyze }, usage);
    await expect(service.analyzeText('u1', 'd', 'x')).rejects.toThrow('db');
    expect(analyze).not.toHaveBeenCalled();
  });
});
