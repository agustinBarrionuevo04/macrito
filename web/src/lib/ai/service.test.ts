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
      analyze: vi.fn().mockResolvedValue(reply({ items: [{ producto_raro: 'huevo' }] })),
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

describe('createAiService: diagnóstico de respuestas inválidas', () => {
  const bad = { items: [{ producto_raro: 'huevo' }] };

  it('el error trae la forma de la respuesta que mandó el proveedor', async () => {
    const analyze = vi.fn().mockResolvedValue({
      raw: bad,
      usage: { inputTokens: 1, outputTokens: 1 },
      diagnostics: 'stop_reason=end_turn; origen=herramienta',
    });
    const { service } = make({ analyze });
    const error = await service.analyzeText('u1', 'd', 'x').catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'bad_response' });
    expect((error as Error).message).toContain('ningún ítem');
    expect((error as Error).message).toContain('stop_reason=end_turn');
  });

  it('con depuración activa registra la respuesta cruda (recortada); sin ella, no', async () => {
    const analyze = vi.fn().mockResolvedValue({
      raw: bad,
      usage: { inputTokens: 1, outputTokens: 1 },
      diagnostics: 'x',
    });
    const debug = vi.fn();
    const withDebug = createAiService({
      provider: { analyze },
      usage: tracker(),
      limits: { photo: 1, text: 1 },
      debug,
    });
    await expect(withDebug.analyzeText('u', 'd', 'x')).rejects.toBeDefined();
    expect(debug).toHaveBeenCalledWith(expect.stringContaining('producto_raro'));

    const quiet = make({ analyze });
    await expect(quiet.service.analyzeText('u', 'd', 'x')).rejects.toBeDefined();
    expect(debug).toHaveBeenCalledTimes(1);
  });
});
