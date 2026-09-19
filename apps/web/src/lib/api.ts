import type { Dashboard } from '../types/dashboard';

async function json<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || body?.message || `HTTP ${response.status}`);
  return body as T;
}
export const api = {
  dashboard: () => fetch('/api/dashboard').then(json<Dashboard>),
  pcifStatus: () => fetch('/api/integrations/pcif/status').then(json<any>),
  syncPcif: (uais: string[]) => fetch('/api/integrations/pcif/sync', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({uais}) }).then(json<any>),
  establishments: () => fetch('/api/establishments').then(json<any>),
  createEstablishment: (body:any) => fetch('/api/establishments',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(json<any>),
  updateEstablishment: (id:number,body:any) => fetch(`/api/establishments/${id}`,{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(body)}).then(json<any>),
  deleteEstablishment: (id:number) => fetch(`/api/establishments/${id}`,{method:'DELETE'}).then(json<any>),
  restoreEstablishment: (id:number) => fetch(`/api/establishments/${id}/restore`,{method:'POST'}).then(json<any>),
  importOpale: (form: FormData, ets?: string) => fetch(`/api/import/opale${ets?`?ets=${encodeURIComponent(ets)}`:''}`, { method: 'POST', body: form }).then(json<any>),
};
