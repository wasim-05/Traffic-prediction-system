import { createContext, useContext, useEffect, useState } from 'react';

const BASE = import.meta.env.VITE_API_URL || '/api';
export const token = () => localStorage.getItem('token');
export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);
export const settings = () => ({ weather: 'Clear', refresh: 30, ...JSON.parse(localStorage.getItem('settings') || '{}') });

export async function api(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: `Bearer ${token()}` } : {}) },
    body: opts.body && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body,
  });
  if (res.status === 401 && token()) {
    localStorage.removeItem('token'); localStorage.removeItem('user'); window.location.href = '/login';
  }
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || res.statusText); }
  return (res.headers.get('content-type') || '').includes('json') ? res.json() : res.blob();
}

// GET helper with optional auto-refresh (seconds) and manual reload via `tick`.
export function useFetch(path, refreshSec = 0, tick = 0) {
  const [s, setS] = useState({ data: null, loading: !!path, error: '' });
  useEffect(() => {
    if (!path) { setS({ data: null, loading: false, error: '' }); return; }
    let live = true;
    const run = () => api(path)
      .then(d => live && setS({ data: d, loading: false, error: '' }))
      .catch(e => live && setS(p => ({ ...p, loading: false, error: e.message })));
    setS(p => ({ ...p, loading: true }));
    run();
    const t = refreshSec ? setInterval(run, refreshSec * 1000) : null;
    return () => { live = false; if (t) clearInterval(t); };
  }, [path, refreshSec, tick]);
  return s;
}
