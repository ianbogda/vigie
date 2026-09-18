import type { Dashboard } from '../types/dashboard';

async function json<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || body?.message || `HTTP ${response.status}`);
  return body as T;
}
export const api = {
  dashboard: () => fetch('/api/dashboard').then(json<Dashboard>),
  importOpale: (form: FormData) => fetch('/api/import/opale', { method: 'POST', body: form }).then(json<any>),
};
