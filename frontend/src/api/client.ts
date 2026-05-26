import { fetchAuthSession } from '@aws-amplify/auth';
import { ApiError } from '@clos/shared-types';
import { getConfig } from '../config';

async function getToken(forceRefresh = false): Promise<string> {
  const session = await fetchAuthSession({ forceRefresh });
  const token = session.tokens?.idToken?.toString();
  if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Session expirée');
  return token;
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body = await response.json() as { error?: { code?: string; message?: string; details?: unknown } };
    const err = body.error ?? {};
    return new ApiError(
      response.status,
      err.code ?? 'INTERNAL_ERROR',
      err.message ?? 'Erreur inattendue',
      err.details,
    );
  } catch (_e: unknown) {
    return new ApiError(response.status, 'INTERNAL_ERROR', 'Erreur inattendue');
  }
}

interface RequestOptions {
  body?: unknown;
  extraHeaders?: Record<string, string>;
}

async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const { apiBaseUrl } = getConfig();
  const url = `${apiBaseUrl}${path}`;

  const headers: Record<string, string> = { ...options.extraHeaders };
  headers['Authorization'] = `Bearer ${await getToken()}`;

  const hasBody = options.body !== undefined && method !== 'GET' && method !== 'DELETE';
  if (hasBody) headers['Content-Type'] = 'application/json';

  const init: RequestInit = {
    method,
    headers,
    body: hasBody ? JSON.stringify(options.body) : undefined,
  };

  let response = await fetch(url, init);

  if (response.status === 401) {
    headers['Authorization'] = `Bearer ${await getToken(true)}`;
    response = await fetch(url, { ...init, headers });
  }

  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown, extraHeaders?: Record<string, string>) =>
    request<T>('POST', path, { body, extraHeaders }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body }),
  delete: <T>(path: string) => request<T>('DELETE', path),
  // Upload direct vers S3 via URL pré-signée (sans header Authorization)
  putExternal: (url: string, file: File) =>
    fetch(url, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file }),
};
