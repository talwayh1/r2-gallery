import type { DirTreeNode, FileMetadata, User } from '../types';

export async function initDatabase(db: D1Database): Promise<void> {
  await db.prepare(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    telegram_id TEXT
  )`).run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS file_metadata (
    path TEXT PRIMARY KEY,
    size INTEGER NOT NULL DEFAULT 0,
    mime TEXT NOT NULL DEFAULT 'application/octet-stream',
    mtime INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();

  await db.prepare(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`).run();

  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_file_metadata_path ON file_metadata(path)`).run();
  await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id)`).run();
}

export async function getUserByUsername(db: D1Database, username: string): Promise<User | null> {
  return db.prepare('SELECT * FROM users WHERE username = ?').bind(username).first<User>();
}

export async function getUserByTelegramId(db: D1Database, telegramId: string): Promise<User | null> {
  return db.prepare('SELECT * FROM users WHERE telegram_id = ?').bind(telegramId).first<User>();
}

export async function createTelegramUser(db: D1Database, telegramId: string, displayName: string): Promise<User> {
  const username = `tg_${telegramId}`;
  const password_hash = 'telegram_auth_no_password';
  await db.prepare(
    'INSERT INTO users (username, password_hash, role, telegram_id) VALUES (?, ?, ?, ?)'
  ).bind(username, password_hash, 'user', telegramId).run();
  return db.prepare('SELECT * FROM users WHERE telegram_id = ?').bind(telegramId).first<User>() as Promise<User>;
}
export async function createUser(db: D1Database, username: string, password_hash: string, role: string = 'user'): Promise<void> {
  await db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').bind(username, password_hash, role).run();
}

export async function listUsers(db: D1Database): Promise<Omit<User, 'password_hash'>[]> {
  const result = await db.prepare('SELECT id, username, role, created_at FROM users').all<Omit<User, 'password_hash'>>();
  return result.results;
}

export async function deleteUser(db: D1Database, id: number): Promise<void> {
  await db.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
}

export async function updateUserPassword(db: D1Database, id: number, password_hash: string): Promise<void> {
  await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(password_hash, id).run();
}

export async function getFileMetadata(db: D1Database, path: string): Promise<FileMetadata | null> {
  return db.prepare('SELECT * FROM file_metadata WHERE path = ?').bind(path).first<FileMetadata>();
}

export async function listFileMetadata(db: D1Database, dir: string): Promise<FileMetadata[]> {
  const prefix = dir ? dir + '/' : '';
  const result = await db.prepare(
    "SELECT * FROM file_metadata WHERE path LIKE ? AND path NOT LIKE ?"
  ).bind(`${prefix}%`, `${prefix}%/%`).all<FileMetadata>();
  return result.results;
}

export async function upsertFileMetadata(db: D1Database, meta: FileMetadata): Promise<void> {
  await db.prepare(
    'INSERT INTO file_metadata (path, size, mime, mtime) VALUES (?, ?, ?, ?) ON CONFLICT(path) DO UPDATE SET size=excluded.size, mime=excluded.mime, mtime=excluded.mtime'
  ).bind(meta.path, meta.size, meta.mime, meta.mtime).run();
}

export async function deleteFileMetadata(db: D1Database, path: string): Promise<void> {
  await db.prepare('DELETE FROM file_metadata WHERE path = ?').bind(path).run();
}

export async function deleteFileMetadataByPrefix(db: D1Database, prefix: string): Promise<void> {
  await db.prepare('DELETE FROM file_metadata WHERE path LIKE ?').bind(`${prefix}%`).run();
}

export async function renameFileMetadata(db: D1Database, oldPath: string, newPath: string): Promise<void> {
  await db.prepare('UPDATE file_metadata SET path = ? WHERE path = ?').bind(newPath, oldPath).run();
}

/** Global search across all files matching a query (by filename) */
export async function searchFiles(db: D1Database, query: string, limit: number = 50, offset: number = 0, mimeFilter?: string): Promise<FileMetadata[]> {
  const pattern = `%${query}%`;
  let sql = "SELECT * FROM file_metadata WHERE mime != 'directory' AND path LIKE ?";
  const params: (string | number)[] = [pattern];
  if (mimeFilter) {
    sql += ' AND mime LIKE ?';
    params.push(mimeFilter);
  }
  sql += ' ORDER BY mtime DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  const result = await db.prepare(sql).bind(...params).all<FileMetadata>();
  return result.results;
}

/** Count total matching search results */
export async function searchFilesCount(db: D1Database, query: string, mimeFilter?: string): Promise<number> {
  const pattern = `%${query}%`;
  let sql = "SELECT COUNT(*) as cnt FROM file_metadata WHERE mime != 'directory' AND path LIKE ?";
  const params: (string | number)[] = [pattern];
  if (mimeFilter) {
    sql += ' AND mime LIKE ?';
    params.push(mimeFilter);
  }
  const result = await db.prepare(sql).bind(...params).first<{ cnt: number }>();
  return result?.cnt || 0;
}

/** Get recent image/video files across all directories for the discover feature */
export async function getRecentMedia(db: D1Database, limit: number = 30, offset: number = 0): Promise<FileMetadata[]> {
  const result = await db.prepare(
    "SELECT * FROM file_metadata WHERE mime LIKE 'image/%' OR mime LIKE 'video/%' ORDER BY mtime DESC LIMIT ? OFFSET ?"
  ).bind(limit, offset).all<FileMetadata>();
  return result.results;
}

/**
 * Get "On this day" memories — media files from the same month/day in previous years.
 * Uses mtime (file modification time) as proxy for photo date.
 * Inspired by Immich's memories feature.
 */
export async function getMemories(db: D1Database, month: number, day: number): Promise<FileMetadata[]> {
  // Query files where the month and day of mtime match, across all years
  // SQLite datetime(mtime, 'unixepoch') gives us the date
  const result = await db.prepare(
    `SELECT * FROM file_metadata
     WHERE (mime LIKE 'image/%' OR mime LIKE 'video/%')
       AND CAST(strftime('%m', mtime, 'unixepoch') AS INTEGER) = ?
       AND CAST(strftime('%d', mtime, 'unixepoch') AS INTEGER) = ?
     ORDER BY mtime DESC`
  ).bind(month, day).all<FileMetadata>();
  return result.results;
}

/** Get total count of media files */
export async function getMediaCount(db: D1Database): Promise<number> {
  const row = await db.prepare(
    "SELECT COUNT(*) as count FROM file_metadata WHERE mime LIKE 'image/%' OR mime LIKE 'video/%'"
  ).first<{ count: number }>();
  return row?.count ?? 0;
}

export async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{ value: string }>();
  return row?.value ?? null;
}

export async function setSetting(db: D1Database, key: string, value: string): Promise<void> {
  await db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key, value).run();
}

export async function getAllSettings(db: D1Database): Promise<Record<string, string>> {
  const rows = await db.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>();
  const result: Record<string, string> = {};
  for (const row of rows.results) {
    result[row.key] = row.value;
  }
  return result;
}

export async function getDirTree(db: D1Database): Promise<DirTreeNode[]> {
  const rows = await db.prepare("SELECT path FROM file_metadata WHERE mime = 'directory' ORDER BY path").all<{ path: string }>();
  return buildTree(rows.results.map(r => r.path));
}

function buildTree(paths: string[]): DirTreeNode[] {
  const root: DirTreeNode[] = [];
  const map = new Map<string, DirTreeNode>();

  const sorted = [...paths].sort();
  for (const p of sorted) {
    const parts = p.split('/');
    const name = parts[parts.length - 1] || p;
    const node: DirTreeNode = { name, path: p, children: [] };
    map.set(p, node);

    if (parts.length === 1) {
      root.push(node);
    } else {
      const parentPath = parts.slice(0, -1).join('/');
      const parent = map.get(parentPath);
      if (parent) {
        parent.children.push(node);
      } else {
        root.push(node);
      }
    }
  }

  return root;
}

// === Trash (soft delete) ===
export async function addToTrash(db: D1Database, item: { original_path: string; name: string; mime: string; size: number; is_dir: boolean; deleted_by?: string | number }): Promise<void> {
  await db.prepare('INSERT OR REPLACE INTO trash (original_path, name, mime, size, is_dir, deleted_by) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(item.original_path, item.name, item.mime, item.size, item.is_dir ? 1 : 0, item.deleted_by || null).run();
}

export async function listTrash(db: D1Database): Promise<any[]> {
  const result = await db.prepare('SELECT * FROM trash ORDER BY deleted_at DESC').all();
  return result.results;
}

export async function restoreFromTrash(db: D1Database, originalPath: string): Promise<boolean> {
  const row = await db.prepare('SELECT * FROM trash WHERE original_path = ?').bind(originalPath).first();
  if (!row) return false;
  await db.prepare('DELETE FROM trash WHERE original_path = ?').bind(originalPath).run();
  return true;
}

export async function purgeFromTrash(db: D1Database, originalPath: string): Promise<void> {
  await db.prepare('DELETE FROM trash WHERE original_path = ?').bind(originalPath).run();
}

export async function getTrashItem(db: D1Database, originalPath: string): Promise<any | null> {
  return db.prepare('SELECT * FROM trash WHERE original_path = ?').bind(originalPath).first();
}

export async function getTrashByPrefix(db: D1Database, prefix: string): Promise<any[]> {
  const result = await db.prepare('SELECT * FROM trash WHERE original_path LIKE ?').bind(`${prefix}%`).all();
  return result.results;
}

// === Activity Log ===
export async function logActivity(db: D1Database, action: string, path: string, user?: string | number, newPath?: string, details?: string): Promise<void> {
  await db.prepare('INSERT INTO activity_log (action, path, new_path, user, details) VALUES (?, ?, ?, ?, ?)')
    .bind(action, path, newPath || null, user || null, details || null).run();
}

export async function listActivity(db: D1Database, limit: number = 50, offset: number = 0): Promise<any[]> {
  const result = await db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .bind(limit, offset).all();
  return result.results;
}

export async function getActivityCount(db: D1Database): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) as count FROM activity_log').first<{ count: number }>();
  return row?.count ?? 0;
}

// === Traffic Stats ===
export async function logTraffic(db: D1Database, path: string, bytes: number, user?: string | number): Promise<void> {
  await db.prepare('INSERT INTO traffic_log (path, bytes, user) VALUES (?, ?, ?)')
    .bind(path, bytes, user || null).run();
}

export async function getTrafficStats(db: D1Database, days: number = 30): Promise<{ totalBytes: number; requestCount: number }> {
  const row = await db.prepare(
    "SELECT COALESCE(SUM(bytes), 0) as totalBytes, COUNT(*) as requestCount FROM traffic_log WHERE created_at >= datetime('now', ?)"
  ).bind(`-${days} days`).first<{ totalBytes: number; requestCount: number }>();
  return row ?? { totalBytes: 0, requestCount: 0 };
}

export async function getTrafficByDay(db: D1Database, days: number = 7): Promise<{ date: string; bytes: number; count: number }[]> {
  const result = await db.prepare(
    "SELECT DATE(created_at) as date, SUM(bytes) as bytes, COUNT(*) as count FROM traffic_log WHERE created_at >= datetime('now', ?) GROUP BY DATE(created_at) ORDER BY date DESC"
  ).bind(`-${days} days`).all();
  return result.results as any[];
}

// === Upload Drafts ===
export async function createDraft(db: D1Database, id: string, path: string, size: number, mime: string, user?: string | number): Promise<void> {
  await db.prepare('INSERT INTO upload_drafts (id, path, size, mime, status, created_by) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, path, size, mime, 'draft', user || null).run();
}

export async function confirmDraft(db: D1Database, id: string): Promise<boolean> {
  const result = await db.prepare("UPDATE upload_drafts SET status = 'confirmed' WHERE id = ? AND status = 'draft'").bind(id).run();
  return result.meta.changes > 0;
}

export async function cancelDraft(db: D1Database, id: string): Promise<void> {
  await db.prepare("UPDATE upload_drafts SET status = 'cancelled' WHERE id = ?").bind(id).run();
}

export async function getDraft(db: D1Database, id: string): Promise<any | null> {
  return db.prepare('SELECT * FROM upload_drafts WHERE id = ?').bind(id).first();
}

export async function cleanOldDrafts(db: D1Database, hoursOld: number = 24): Promise<number> {
  const result = await db.prepare("DELETE FROM upload_drafts WHERE status = 'draft' AND created_at < datetime('now', ?)")
    .bind(`-${hoursOld} hours`).run();
  return result.meta.changes;
}
