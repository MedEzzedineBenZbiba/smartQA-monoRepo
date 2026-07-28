export interface NormalizedError {
    name: string;
    code: string | undefined;
    method: string | undefined;
    url: string | undefined;
    status: number | null;
    statusText: string | null;
    message: string;
    cause?: string;
    responseData?: any
  }
  
  export function normalizeError(error): NormalizedError {
    return {
      name: error.name,
      code: error.code,
      method: error.config?.method?.toUpperCase(),
      url: error.config?.url,
      status: error.response?.status ?? null,
      statusText: error.response?.statusText ?? null,
      message: error.message,
      cause: error.cause?.toString(),
      responseData: error.response?.data
    };
  }