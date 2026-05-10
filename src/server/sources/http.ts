import type { FetchFn } from './types';

export const SOURCE_FETCH_TIMEOUT_MS = 10 * 60 * 1000;

export async function fetchWithTimeout(
  fetchFn: FetchFn,
  url: string,
  opts: { timeoutMs?: number } = {},
): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? SOURCE_FETCH_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchFn(url, { signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`fetch timeout after ${timeoutMs}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
