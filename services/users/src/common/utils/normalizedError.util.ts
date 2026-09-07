export interface NormalizedError {
  name: string;
  code: string | undefined;
  method: string | undefined;
  url: string | undefined;
  status: number | null;
  statusText: string | null;
  message: string;
  cause?: string;
  responseData?: unknown;
}

interface ErrorLike {
  name?: string;
  code?: string;
  message?: string;
  cause?: unknown;
  config?: {
    method?: string;
    url?: string;
  };
  response?: {
    status?: number;
    statusText?: string;
    data?: unknown;
  };
}

function stringifyCause(cause: unknown): string | undefined {
  if (cause === undefined) return undefined;
  if (typeof cause === 'string') return cause;
  if (typeof cause === 'number' || typeof cause === 'boolean') {
    return String(cause);
  }
  if (cause instanceof Error) return cause.message;
  try {
    return JSON.stringify(cause);
  } catch {
    return 'Unserializable cause';
  }
}

export function normalizeError(error: unknown): NormalizedError {
  const err = (error ?? {}) as ErrorLike;

  return {
    name: err.name ?? 'Error',
    code: err.code,
    method: err.config?.method?.toUpperCase(),
    url: err.config?.url,
    status: err.response?.status ?? null,
    statusText: err.response?.statusText ?? null,
    message: err.message ?? 'Unknown error',
    cause: stringifyCause(err.cause),
    responseData: err.response?.data,
  };
}
