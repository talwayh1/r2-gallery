const API_BASE = '/api';

// CDN域名配置（从/api/config获取）
let cdnDomain: string | null = null;

export function setCdnDomain(domain: string | null) {
  cdnDomain = domain;
}

export function getCdnDomain() {
  return cdnDomain;
}

async function request(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (options.body && typeof options.body === 'string') {
    headers['Content-Type'] = 'application/json';
  }
  // Propagate signal to fetch — allows callers to cancel in-flight requests
  const { signal, ...fetchOptions } = options;
  const res = await fetch(`${API_BASE}${path}`, { ...fetchOptions, headers, signal });
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

export async function listFiles(dir: string = '', params?: ListFilesParams, signal?: AbortSignal) {
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
  const res = await request(`/files?${qs.toString()}`, { signal });
  return res.json();
}

export async function listDirs() {
  const res = await request('/dirs');
  return res.json();
}

export function getFileUrl(path: string) {
  // 如果有CDN域名，直接用CDN访问（公开文件，不需要token）
  if (cdnDomain) {
    return `${cdnDomain}/${path}`;
  }
  const token = localStorage.getItem('token');
  const base = `${API_BASE}/file?path=${encodeURIComponent(path)}`;
  return token ? `${base}&token=${encodeURIComponent(token)}` : base;
}

export function getThumbUrl(path: string) {
  // 缩略图始终走 Worker 端生成（300x300 WebP），不走 CDN（CDN 只缓存原图）
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

/**
 * Upload a file with XHR progress tracking and abort support.
 * Used by the upload queue for per-file progress reporting.
 */
export function uploadFileWithProgress(
  dir: string,
  file: File,
  relativePath: string | undefined,
  onProgress: (loaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append('file', file);
    form.append('dir', dir);
    if (relativePath) form.append('relativePath', relativePath);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(e.loaded, e.total);
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)); } catch { resolve(xhr.responseText); }
      } else {
        try {
          const data = JSON.parse(xhr.responseText);
          reject(new Error(data.error || `HTTP ${xhr.status}`));
        } catch {
          reject(new Error(`HTTP ${xhr.status}`));
        }
      }
    });

    xhr.addEventListener('error', () => reject(new Error('网络错误')));
    xhr.addEventListener('abort', () => {
      const err = new Error('上传已取消');
      err.name = 'AbortError';
      reject(err);
    });

    if (signal) {
      if (signal.aborted) { reject(new Error('上传已取消')); return; }
      signal.addEventListener('abort', () => xhr.abort());
    }

    const token = localStorage.getItem('token');
    xhr.open('POST', '/api/upload');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.send(form);
  });
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

export async function searchFiles(query: string, limit?: number, offset?: number): Promise<{ results: SearchResult[]; query: string; total: number }> {
  const params = new URLSearchParams({ q: query });
  if (limit) params.set('limit', String(limit));
  if (offset) params.set('offset', String(offset));
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

// --- Memories (On this day) ---
export interface MemoryYear {
  year: number;
  yearsAgo: number;
  files: DiscoverFile[];
}

export async function getMemories(month?: number, day?: number): Promise<{ date: string; memories: MemoryYear[]; total: number }> {
  const params = new URLSearchParams();
  if (month) params.set('month', String(month));
  if (day) params.set('day', String(day));
  const res = await fetch(`${API_BASE}/memories?${params}`);
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

// --- URL Content ---
export async function getUrlContent(path: string): Promise<{ url: string }> {
  const res = await fetch(`${API_BASE}/url-content?path=${encodeURIComponent(path)}`);
  return res.json();
}

// --- Create File ---
export async function createFile(path: string): Promise<{ success: boolean }> {
  const res = await request('/create-file', {
    method: 'POST', body: JSON.stringify({ path }),
  });
  return res.json();
}

// --- Create URL Shortcut ---
export async function createUrlShortcut(path: string, url: string): Promise<{ success: boolean }> {
  const res = await request('/create-url', {
    method: 'POST', body: JSON.stringify({ path, url }),
  });
  return res.json();
}

// --- Custom Thumbnail ---
export async function uploadCustomThumb(filePath: string, file: File): Promise<{ success: boolean }> {
  const form = new FormData();
  form.append('file', file);
  form.append('path', filePath);
  const res = await request('/custom-thumb', { method: 'POST', body: form });
  return res.json();
}

// --- Save File Content ---
export async function saveFile(path: string, content: string): Promise<{ success: boolean; path: string; size: number }> {
  const res = await request(`/file?path=${encodeURIComponent(path)}`, {
    method: 'PUT',
    body: content,
    headers: { 'Content-Type': 'text/plain' },
  });
  return res.json();
}

// --- Trash ---
export async function listTrash(): Promise<{ items: any[]; total: number }> {
  const res = await request('/trash');
  return res.json();
}

export async function restoreTrash(paths: string[]): Promise<{ success: boolean; restored: string[] }> {
  const res = await request('/trash/restore', { method: 'POST', body: JSON.stringify({ paths }) });
  return res.json();
}

export async function purgeTrash(paths: string[]): Promise<{ success: boolean; purged: string[] }> {
  const res = await request('/trash/purge', { method: 'POST', body: JSON.stringify({ paths }) });
  return res.json();
}

export async function emptyTrash(): Promise<{ success: boolean; purged: number }> {
  const res = await request('/trash/empty', { method: 'POST' });
  return res.json();
}

// --- Activity Log ---
export async function getActivity(limit?: number, offset?: number): Promise<{ items: any[]; total: number; hasMore: boolean }> {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (offset) params.set('offset', String(offset));
  const res = await request(`/activity?${params}`);
  return res.json();
}

export async function getTrafficStats(days?: number): Promise<{ totalBytes: number; requestCount: number; byDay: any[]; days: number }> {
  const params = new URLSearchParams();
  if (days) params.set('days', String(days));
  const res = await request(`/stats/traffic?${params}`);
  return res.json();
}

// --- ID3 Tags ---
export interface Id3Data {
  title?: string;
  artist?: string;
  album?: string;
  year?: string;
  genre?: string;
  track?: string;
  cover?: string;
}

export async function getId3(path: string): Promise<{ id3: Id3Data | null; message?: string }> {
  const res = await fetch(`${API_BASE}/id3?path=${encodeURIComponent(path)}`);
  return res.json();
}

// --- ZIP Download ---
export async function downloadZip(paths: string[]): Promise<void> {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_BASE}/zip-download`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ paths }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'download.zip';
  a.click();
  URL.revokeObjectURL(url);
}

// --- ZIP Create ---
export async function createZip(paths: string[], dir?: string): Promise<{ success: boolean; path: string }> {
  const res = await request('/zip-create', {
    method: 'POST',
    body: JSON.stringify({ paths, dir }),
  });
  return res.json();
}

// --- Unzip ---
export async function unzipFile(path: string, dir?: string): Promise<{ success: boolean; extracted: number; dir: string }> {
  const res = await request('/unzip', {
    method: 'POST',
    body: JSON.stringify({ path, dir }),
  });
  return res.json();
}
