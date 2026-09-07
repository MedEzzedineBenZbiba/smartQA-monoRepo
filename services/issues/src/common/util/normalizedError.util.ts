export interface NormalizedError {
  name: string;
  code: string | undefined;
  method: string | undefined;
  url: string | undefined;
  status: number | null;
  statusText: string | null;
  message: string;
  cause?: string;
  responseData?: any;
}

// Define the expected error shape (Axios-like)
interface ErrorWithConfig {
  name?: string;
  code?: string;
  config?: {
    method?: string;
    url?: string;
  };
  response?: {
    status?: number;
    statusText?: string;
    data?: unknown;
  };
  message?: string;
  cause?: unknown;
}

// Type guard to check if the error has the expected shape
function isErrorWithConfig(error: unknown): error is ErrorWithConfig {
  return typeof error === 'object' && error !== null;
}

export function normalizeError(error: unknown): NormalizedError {
  // Default fallback values
  const fallback: NormalizedError = {
    name: '',
    code: undefined,
    method: undefined,
    url: undefined,
    status: null,
    statusText: null,
    message: '',
    cause: undefined,
    responseData: undefined,
  };

  if (!isErrorWithConfig(error)) {
    return fallback;
  }

  // Safely extract properties using optional chaining and nullish coalescing
  return {
    name: error.name ?? '',
    code: error.code,
    method: error.config?.method?.toUpperCase(),
    url: error.config?.url,
    status: error.response?.status ?? null,
    statusText: error.response?.statusText ?? null,
    message: error.message ?? '',
    cause: error.cause?.toString(),
    responseData: error.response?.data,
  };
}
