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
export async function searchFiles(db: D1Database, query: string, limit: number = 50): Promise<FileMetadata[]> {
  const pattern = `%${query}%`;
  const result = await db.prepare(
    "SELECT * FROM file_metadata WHERE mime != 'directory' AND path LIKE ? ORDER BY mtime DESC LIMIT ?"
  ).bind(pattern, limit).all<FileMetadata>();
  return result.results;
}

/** Get recent image/video files across all directories for the discover feature */
export async function getRecentMedia(db: D1Database, limit: number = 30, offset: number = 0): Promise<FileMetadata[]> {
  const result = await db.prepare(
    "SELECT * FROM file_metadata WHERE mime LIKE 'image/%' OR mime LIKE 'video/%' ORDER BY mtime DESC LIMIT ? OFFSET ?"
  ).bind(limit, offset).all<FileMetadata>();
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
