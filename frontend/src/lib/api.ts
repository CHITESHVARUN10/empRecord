export type Conflict = {
  field: string;
  message: string;
};

export type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
    fields?: Record<string, string>;
    conflicts?: Conflict[];
  };
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;
  readonly conflicts?: Conflict[];

  constructor(
    status: number,
    code: string,
    message: string,
    fields?: Record<string, string>,
    conflicts?: Conflict[],
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.conflicts = conflicts;
  }
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

export function assetUrl(path: string): string {
  return `${API_BASE}${path}`;
}

async function readError(response: Response): Promise<ApiError> {
  let body: ApiErrorBody | null = null;
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    body = null;
  }

  return new ApiError(
    response.status,
    body?.error?.code ?? 'INTERNAL',
    body?.error?.message ??
      (response.status === 413
        ? 'The upload is too large.'
        : 'Something went wrong. Please try again.'),
    body?.error?.fields,
    body?.error?.conflicts,
  );
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await readError(response);
    if (
      error.status === 401 &&
      path !== '/api/auth/me' &&
      !path.startsWith('/api/auth/login')
    ) {
      window.dispatchEvent(new Event('bpi:unauthorized'));
    }
    throw error;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function apiFetchBlob(path: string): Promise<Blob> {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw await readError(response);
  }

  return response.blob();
}
