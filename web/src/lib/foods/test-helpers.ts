import { vi } from 'vitest';
import type { FetchLike } from './http';

type Handler = (url: URL, init: RequestInit | undefined) => Response | Promise<Response>;

/** `fetch` falso: registra los pedidos y responde con lo que decida `handler`. */
export function fakeFetch(handler: Handler) {
  const calls: { url: URL; init: RequestInit | undefined }[] = [];
  const impl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input : input.url,
    );
    calls.push({ url, init });
    return handler(url, init);
  });
  return { fetchImpl: impl as unknown as FetchLike, calls };
}

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
