'use client';

/**
 * The browser-side fetch wrapper. Every call is same-origin with credentials,
 * which is what the CSRF check on the server expects (docs/09 §1).
 */
/** Field-level detail from a 422; the shape the API actually returns. */
export type ApiErrorDetail = { path?: string; message: string };

export type ApiError = { code: string; message: string; requestId?: string; details?: ApiErrorDetail[] };

export class ApiCallError extends Error {
  constructor(
    readonly status: number,
    readonly error: ApiError,
  ) {
    super(error.message);
    this.name = 'ApiCallError';
  }
}

export type ApiOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
};

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.idempotencyKey) headers['idempotency-key'] = options.idempotencyKey;

  const response = await fetch(`/api/v1${path}`, {
    method: options.method ?? 'GET',
    credentials: 'same-origin',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

  if (response.status === 204) return null as T;

  const payload = (await response.json().catch(() => null)) as { error?: ApiError } | T | null;

  if (!response.ok) {
    const error = (payload as { error?: ApiError } | null)?.error ?? {
      code: 'INTERNAL',
      message: 'Something went wrong',
    };
    throw new ApiCallError(response.status, error);
  }

  return payload as T;
}

/** A stable key per logical action, so a retry replays instead of duplicating. */
export function idempotencyKey(scope: string): string {
  return `${scope}:${crypto.randomUUID()}`;
}
