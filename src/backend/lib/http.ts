import {MAX_PROXY_BODY_CHARS} from '@shared/constants';
import type {ProxyResult} from '@shared/protocol';
import {reportHeaders} from './redact';

export class ConfigError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

/**
 * Runs a request and reports everything about the response. Never throws for
 * HTTP errors: a 401 from the CMS is a result worth showing, not a failure.
 */
export async function proxyFetch(
  url: string,
  init: RequestInit,
  authLabel: string
): Promise<ProxyResult> {
  const started = Date.now();
  const response = await fetch(url, {...init, signal: AbortSignal.timeout(25_000)});
  const text = await response.text();
  const truncated = text.length > MAX_PROXY_BODY_CHARS;
  const clipped = truncated ? text.slice(0, MAX_PROXY_BODY_CHARS) : text;

  let body: unknown = clipped;
  if (!truncated && (response.headers.get('content-type') ?? '').includes('json')) {
    try {
      body = JSON.parse(text);
    } catch {
      body = clipped;
    }
  }

  return {
    request: {method: init.method ?? 'GET', url, auth: authLabel},
    status: response.status,
    statusText: response.statusText,
    durationMs: Date.now() - started,
    headers: reportHeaders(headerPairs(response.headers)).headers,
    body,
    truncated
  };
}

function headerPairs(headers: Headers): string[][] {
  const pairs: string[][] = [];
  headers.forEach((value, name) => pairs.push([name, value]));
  return pairs;
}
