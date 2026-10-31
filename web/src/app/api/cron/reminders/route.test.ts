import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ run: vi.fn(), sender: { send: vi.fn() }, vapid: true }));
vi.mock('server-only', () => ({}));
vi.mock('@/features/reminders/run', () => ({ runReminders: h.run }));
vi.mock('@/features/reminders/sender', () => ({
  vapidFromEnv: () =>
    h.vapid ? { publicKey: 'p', privateKey: 'q', subject: 'mailto:a@b.c' } : null,
  createWebPushSender: () => h.sender,
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ admin: true }) }));

const { GET, POST } = await import('./route');

const SECRET = 'un-secreto-largo-y-aleatorio';
const request = (authorization?: string, method = 'GET') =>
  new NextRequest('http://localhost/api/cron/reminders', {
    method,
    ...(authorization ? { headers: { authorization } } : {}),
  });

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', SECRET);
  h.vapid = true;
  h.run.mockReset();
  h.run.mockResolvedValue({
    considered: 2,
    due: 1,
    alreadyLogged: 0,
    sent: 1,
    failed: 0,
    removed: 0,
  });
});
afterEach(() => vi.unstubAllEnvs());

describe('GET/POST /api/cron/reminders', () => {
  it('con el secreto correcto corre los recordatorios y devuelve el resumen', async () => {
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ considered: 2, sent: 1 });
    expect(h.run).toHaveBeenCalledWith({ admin: { admin: true }, sender: h.sender });
    expect((await POST(request(`Bearer ${SECRET}`, 'POST'))).status).toBe(200);
  });

  it('sin secreto, con uno equivocado o de otro largo responde 401 y no corre nada', async () => {
    for (const header of [
      undefined,
      'Bearer otro',
      `Bearer ${SECRET}x`,
      SECRET.slice(1),
      'Basic abc',
      '',
    ]) {
      const response = await GET(request(header));
      expect(response.status, String(header)).toBe(401);
    }
    expect(h.run).not.toHaveBeenCalled();
  });

  it('sin CRON_SECRET configurado queda cerrado (503), aunque mande cualquier cosa', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect((await GET(request('Bearer '))).status).toBe(503);
    expect((await GET(request())).status).toBe(503);
    expect(h.run).not.toHaveBeenCalled();
  });

  it('sin claves VAPID responde 503', async () => {
    h.vapid = false;
    expect((await GET(request(`Bearer ${SECRET}`))).status).toBe(503);
    expect(h.run).not.toHaveBeenCalled();
  });

  it('si falla responde 500 sin detalles', async () => {
    h.run.mockRejectedValue(new Error('conexión a postgres://user:clave@host'));
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toMatch(/postgres|clave/);
  });
});
