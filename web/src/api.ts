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

export interface ListFilesParams {
  dir?: string;
  sort?: 'name' | 'size' | 'mtime' | 'kind' | 'shuffle';
  order?: 'asc' | 'desc';
  type?: 'image' | 'video' | 'audio' | 'document' | 'all';
  cursor?: string;
  limit?: number;
  files_include?: string;
  files_exclude?: string;
  dirs_include?: string;
  dirs_exclude?: string;
}

export async function listFiles(dir: string = '', params?: ListFilesParams) {
  const qs = new URLSearchParams({ dir });
  if (params?.sort) qs.set('sort', params.sort);
  if (params?.order) qs.set('order', params.order);
  if (params?.type && params.type !== 'all') qs.set('type', params.type);
  if (params?.cursor) qs.set('cursor', params.cursor);
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.files_include) qs.set('files_include', params.files_include);
  if (params?.files_exclude) qs.set('files_exclude', params.files_exclude);
  if (params?.dirs_include) qs.set('dirs_include', params.dirs_include);
  if (params?.dirs_exclude) qs.set('dirs_exclude', params.dirs_exclude);
  const res = await request(`/files?${qs.toString()}`);
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

export function getThumbUrl(path: string) {
  const token = localStorage.getItem('token');
  const base = `${API_BASE}/thumb?path=${encodeURIComponent(path)}`;
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

export async function moveItem(from: string, to: string) {
  const res = await request('/move', {
    method: 'POST',
    body: JSON.stringify({ from, to }),
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

export async function getConfig() {
  const res = await fetch(`${API_BASE}/config`);
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

export async function telegramLogin(authData: Record<string, string>) {
  const res = await request('/auth/telegram', {
    method: 'POST',
    body: JSON.stringify(authData),
  });
  const data = await res.json();
  if (data.token) localStorage.setItem('token', data.token);
  return data;
}

export interface ExifData {
  camera?: string;
  lens?: string;
  focalLength?: string;
  aperture?: string;
  shutterSpeed?: string;
  iso?: number;
  dateTaken?: string;
  width?: number;
  height?: number;
  gps?: { lat: number; lng: number };
  software?: string;
  orientation?: number;
}

export async function getExif(path: string): Promise<{ exif: ExifData | null; message?: string }> {
  const res = await fetch(`${API_BASE}/exif?path=${encodeURIComponent(path)}`);
  return res.json();
}

export async function getThumbnail(dir: string): Promise<{ path: string | null; url: string | null }> {
  const res = await fetch(`${API_BASE}/thumbnail?dir=${encodeURIComponent(dir)}`);
  return res.json();
}

// --- Global Search ---
export interface SearchResult {
  path: string;
  name: string;
  mime: string;
  size: number;
  mtime: number;
  dir: string;
}

export async function searchFiles(query: string, limit?: number): Promise<{ results: SearchResult[]; query: string; total: number }> {
  const params = new URLSearchParams({ q: query });
  if (limit) params.set('limit', String(limit));
  const res = await fetch(`${API_BASE}/search?${params}`);
  return res.json();
}

// --- Discover ---
export interface DiscoverFile {
  path: string;
  name: string;
  mime: string;
  size: number;
  mtime: number;
  dir: string;
}

export async function discoverMedia(limit?: number, offset?: number): Promise<{ files: DiscoverFile[]; total: number; hasMore: boolean }> {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (offset) params.set('offset', String(offset));
  const res = await fetch(`${API_BASE}/discover?${params}`);
  return res.json();
}

// --- Stats ---
export interface Stats {
  totalFiles: number;
  totalSize: number;
  fileTypes: Record<string, { count: number; size: number }>;
  topDirs: { dir: string; count: number; size: number }[];
  recentUploads: { path: string; size: number; mtime: number }[];
}

export async function getStats(): Promise<Stats> {
  const res = await request('/admin/stats');
  return res.json();
}

// --- Batch Rename ---
export async function batchRename(items: { oldPath: string; newName: string }[]): Promise<{ success: number; failed: number }> {
  const res = await request('/batch-rename', {
    method: 'POST',
    body: JSON.stringify({ items }),
  });
  return res.json();
}

// --- File Copy ---
export async function copyFile(source: string, target: string): Promise<{ success: boolean; newPath: string }> {
  const res = await request('/copy', {
    method: 'POST',
    body: JSON.stringify({ source, target }),
  });
  return res.json();
}

// --- File Duplicate ---
export async function duplicateFile(path: string): Promise<{ success: boolean; newPath: string }> {
  const res = await request('/duplicate', {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
  return res.json();
}

// --- Share ---
export interface Share {
  id: string;
  path: string;
  password_hash?: string;
  expires_at?: number;
  created_by: number;
  created_at: string;
}

export async function createShare(path: string, password?: string, expiresIn?: number): Promise<Share> {
  const res = await request('/shares', {
    method: 'POST',
    body: JSON.stringify({ path, password, expires_in: expiresIn }),
  });
  return res.json();
}

export async function listShares(): Promise<Share[]> {
  const res = await request('/shares');
  return res.json();
}

export async function deleteShare(id: string): Promise<{ success: boolean }> {
  const res = await request(`/shares/${id}`, { method: 'DELETE' });
  return res.json();
}

// --- Admin ---
export async function getSettings(): Promise<Record<string, string>> {
  const res = await request('/admin/settings');
  return res.json();
}

export async function saveSettings(settings: Record<string, string>): Promise<{ success: boolean }> {
  const res = await request('/admin/settings', {
    method: 'POST',
    body: JSON.stringify(settings),
  });
  return res.json();
}

export async function getUsers(): Promise<{ id: number; username: string; role: string }[]> {
  const res = await request('/admin/users');
  return res.json();
}

export async function createUser(username: string, password: string, role?: string): Promise<{ success: boolean }> {
  const res = await request('/admin/users', {
    method: 'POST',
    body: JSON.stringify({ username, password, role }),
  });
  return res.json();
}

export async function deleteUser(id: number): Promise<{ success: boolean }> {
  const res = await request(`/admin/users/${id}`, { method: 'DELETE' });
  return res.json();
}

export async function cleanCache(): Promise<{ success: boolean; deleted: number }> {
  const res = await request('/admin/clean-cache', { method: 'POST' });
  return res.json();
}

export async function getDiagnostics(): Promise<any> {
  const res = await request('/admin/diagnostics');
  return res.json();
}
