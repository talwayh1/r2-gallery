const API_BASE = '/api';

async function request(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (options.body && typeof options.body === 'string') {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    // Don't reload on public browsing — just clear stale token
    localStorage.removeItem('token');
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res;
}

export async function login(username: string, password: string) {
  const res = await request('/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json();
  if (data.token) localStorage.setItem('token', data.token);
  return data;
}

export async function listFiles(dir: string = '') {
  const res = await request(`/files?dir=${encodeURIComponent(dir)}`);
  return res.json();
}

export async function listDirs() {
  const res = await request('/dirs');
  return res.json();
}

export function getFileUrl(path: string) {
  const token = localStorage.getItem('token');
  const base = `${API_BASE}/file?path=${encodeURIComponent(path)}`;
  return token ? `${base}&token=${encodeURIComponent(token)}` : base;
}

export async function uploadFile(dir: string, file: File, relativePath?: string) {
  const form = new FormData();
  form.append('file', file);
  form.append('dir', dir);
  if (relativePath) form.append('relativePath', relativePath);
  const res = await request('/upload', { method: 'POST', body: form });
  return res.json();
}

export async function mkdir(path: string) {
  const res = await request('/mkdir', {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
  return res.json();
}

export async function deleteItems(items: string[]) {
  const res = await request('/delete', {
    method: 'POST',
    body: JSON.stringify({ items }),
  });
  return res.json();
}

export async function renameItem(path: string, name: string) {
  const res = await request('/rename', {
    method: 'POST',
    body: JSON.stringify({ path, name }),
  });
  return res.json();
}

export async function checkAuth() {
  try {
    const res = await request('/ping');
    return res.json();
  } catch {
    return null;
  }
}
