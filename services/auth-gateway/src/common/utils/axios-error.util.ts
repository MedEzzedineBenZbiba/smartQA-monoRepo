export interface NormalizedError {
  name: string;
  code: string | undefined;
  method: string | undefined;
  url: string | undefined;
  status: number | null;
  statusText: string | null;
  message: string;
  cause?: string;
  data?: unknown;
}

interface AxiosLikeError {
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

function isAxiosLikeError(error: unknown): error is AxiosLikeError {
  return typeof error === 'object' && error !== null;
}

function stringifyCause(cause: unknown): string | undefined {
  if (cause === undefined) return undefined;
  if (cause instanceof Error) return cause.message;
  if (typeof cause === 'string') return cause;
  try {
    return JSON.stringify(cause);
  } catch {
    return 'Unserializable cause';
  }
}

export function normalizeAxiosError(error: unknown): NormalizedError {
  if (!isAxiosLikeError(error)) {
    return {
      name: 'UnknownError',
      code: undefined,
      method: undefined,
      url: undefined,
      status: null,
      statusText: null,
      message: typeof error === 'string' ? error : 'Unknown error',
    };
  }

  return {
    name: error.name ?? 'Error',
    code: error.code,
    method: error.config?.method?.toUpperCase(),
    url: error.config?.url,
    status: error.response?.status ?? null,
    statusText: error.response?.statusText ?? null,
    message: error.message ?? 'Unknown error',
    cause: stringifyCause(error.cause),
    data: error.response?.data,
  };
}
