const API = (import.meta as any).env?.VITE_API_BASE || '/api';

/** Same-origin JSON client. */
export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(API + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {'Content-Type': 'application/json'},
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let d: any = {};
  try { d = await r.json(); } catch { /* non-JSON error page */ }
  if (!r.ok) {
    if (typeof window !== 'undefined' && ['DEMO_EXPIRED', 'ACCESS_REQUIRED'].includes(d.code)) {
      window.dispatchEvent(new CustomEvent('prism:access-required', {detail: d}));
    }
    throw Object.assign(new Error(d.error || `Request failed (${r.status}). Is the backend running?`), {status: r.status, code: d.code});
  }
  return d as T;
}
