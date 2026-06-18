import { Hono } from 'hono';
import type { AppBindings, Variables } from '../types';
import * as db from '../services/db';
import { authMiddleware, ensureAdmin, hashPassword } from '../auth';

const admin = new Hono<{ Bindings: AppBindings; Variables: Variables }>();

// GET /admin/settings (protected)
admin.get('/settings', authMiddleware, async (c) => {
  const settings = await db.getAllSettings(c.env.DB);
  return c.json(settings);
});

// POST /admin/settings (admin only)
admin.post('/settings', authMiddleware, ensureAdmin, async (c) => {
  const body = await c.req.json<Record<string, string>>();
  for (const [key, value] of Object.entries(body)) {
    await db.setSetting(c.env.DB, key, value);
  }
  return c.json({ success: true });
});

// GET /admin/users (admin only)
admin.get('/users', authMiddleware, ensureAdmin, async (c) => {
  const users = await db.listUsers(c.env.DB);
  return c.json(users);
});

// POST /admin/users (admin only)
admin.post('/users', authMiddleware, ensureAdmin, async (c) => {
  const { username, password, role } = await c.req.json<{ username: string; password: string; role?: string }>();
  if (!username || !password) {
    return c.json({ error: 'Username and password required' }, 400);
  }

  const existing = await db.getUserByUsername(c.env.DB, username);
  if (existing) {
    return c.json({ error: 'Username already exists' }, 409);
  }

  const password_hash = await hashPassword(password);
  await db.createUser(c.env.DB, username, password_hash, role || 'user');

  return c.json({ success: true });
});

// DELETE /admin/users/:id (admin only)
admin.delete('/users/:id', authMiddleware, ensureAdmin, async (c) => {
  const id = parseInt(c.req.param('id') || '0');
  if (isNaN(id)) return c.json({ error: 'Invalid user ID' }, 400);

  const currentUserId = c.get('userId');
  if (id === currentUserId) {
    return c.json({ error: 'Cannot delete yourself' }, 400);
  }

  await db.deleteUser(c.env.DB, id);
  return c.json({ success: true });
});

// POST /admin/change-password (protected)
admin.post('/change-password', authMiddleware, async (c) => {
  const { currentPassword, newPassword } = await c.req.json<{ currentPassword: string; newPassword: string }>();
  if (!currentPassword || !newPassword) {
    return c.json({ error: 'Current and new password required' }, 400);
  }

  const userId = c.get('userId');
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<{ password_hash: string }>();
  if (!user) return c.json({ error: 'User not found' }, 404);

  const { verifyPassword } = await import('../auth');
  if (!(await verifyPassword(currentPassword, user.password_hash))) {
    return c.json({ error: 'Current password incorrect' }, 401);
  }

  const newHash = await hashPassword(newPassword);
  await db.updateUserPassword(c.env.DB, userId, newHash);

  return c.json({ success: true });
});

// GET /admin/stats (protected) — storage statistics
admin.get('/stats', authMiddleware, async (c) => {
  const bucket = c.env.R2_BUCKET;
  
  // Iterate all objects to compute stats
  const fileTypes: Record<string, { count: number; size: number }> = {
    image: { count: 0, size: 0 },
    video: { count: 0, size: 0 },
    audio: { count: 0, size: 0 },
    document: { count: 0, size: 0 },
    other: { count: 0, size: 0 },
  };
  const dirSizes: Record<string, { count: number; size: number }> = {};
  const recentUploads: { path: string; size: number; mtime: number }[] = [];
  
  let totalFiles = 0;
  let totalSize = 0;
  let cursor: string | undefined;
  
  do {
    const listing = await bucket.list({ limit: 1000, ...(cursor ? { cursor } : {}) });
    for (const obj of listing.objects) {
      if (!obj.key || obj.key.endsWith('/')) continue;
      totalFiles++;
      totalSize += obj.size;
      
      // Classify by type
      const ext = obj.key.split('.').pop()?.toLowerCase() || '';
      const mimeMap: Record<string, string> = {
        jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image', svg: 'image', bmp: 'image',
        mp4: 'video', webm: 'video', avi: 'video', mov: 'video', mkv: 'video',
        mp3: 'audio', wav: 'audio', ogg: 'audio', flac: 'audio', aac: 'audio', m4a: 'audio',
        pdf: 'document', doc: 'document', docx: 'document', xls: 'document', xlsx: 'document',
        ppt: 'document', pptx: 'document', txt: 'document', md: 'document', csv: 'document',
      };
      const category = mimeMap[ext] || 'other';
      fileTypes[category].count++;
      fileTypes[category].size += obj.size;
      
      // Top directories
      const dir = obj.key.includes('/') ? obj.key.split('/').slice(0, -1).join('/') : '/';
      if (!dirSizes[dir]) dirSizes[dir] = { count: 0, size: 0 };
      dirSizes[dir].count++;
      dirSizes[dir].size += obj.size;
      
      // Recent uploads (keep top 20, sort later)
      recentUploads.push({ path: obj.key, size: obj.size, mtime: obj.uploaded ? Math.floor(new Date(obj.uploaded).getTime() / 1000) : 0 });
    }
    cursor = listing.truncated ? listing.cursor : undefined;
  } while (cursor);
  
  // Sort and limit
  const topDirs = Object.entries(dirSizes)
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 10)
    .map(([dir, stats]) => ({ dir, ...stats }));
  
  recentUploads.sort((a, b) => b.mtime - a.mtime);
  
  return c.json({
    totalFiles,
    totalSize,
    fileTypes,
    topDirs,
    recentUploads: recentUploads.slice(0, 10),
  });
});

// POST /admin/clean-cache (admin only) — clean expired cache entries
admin.post('/clean-cache', authMiddleware, ensureAdmin, async (c) => {
  const database = c.env.DB;
  const bucket = c.env.R2_BUCKET;

  // Get clean_cache_interval setting (default 7 days)
  const intervalSetting = await db.getSetting(database, 'clean_cache_interval');
  const intervalDays = parseInt(intervalSetting || '7', 10) || 7;

  if (intervalDays <= 0) {
    return c.json({ success: true, deleted: 0, message: '缓存清理已禁用' });
  }

  const cutoff = Math.floor(Date.now() / 1000) - (intervalDays * 24 * 60 * 60);

  // Clean old thumbnail cache files in R2 (_thumbs/ prefix)
  let thumbDeleted = 0;
  let cursor: string | undefined;
  do {
    const listing = await bucket.list({ prefix: '_thumbs/', limit: 1000, ...(cursor ? { cursor } : {}) });
    for (const obj of listing.objects) {
      if (obj.uploaded && Math.floor(obj.uploaded.getTime() / 1000) < cutoff) {
        await bucket.delete(obj.key);
        thumbDeleted++;
      }
    }
    cursor = listing.truncated ? listing.cursor : undefined;
  } while (cursor);

  // Clean old file_metadata entries
  const metaResult = await database.prepare(
    "DELETE FROM file_metadata WHERE mtime < ? AND mime != 'directory'"
  ).bind(cutoff).run();

  return c.json({
    success: true,
    thumbsDeleted: thumbDeleted,
    metadataDeleted: metaResult.meta?.changes || 0,
    intervalDays,
  });
});

// GET /admin/diagnostics (admin only) — system diagnostics
admin.get('/diagnostics', authMiddleware, ensureAdmin, async (c) => {
  const database = c.env.DB;
  const bucket = c.env.R2_BUCKET;

  // Get counts
  const userCount = await database.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>();
  const fileCount = await database.prepare('SELECT COUNT(*) as count FROM file_metadata').first<{ count: number }>();
  const settingsCount = await database.prepare('SELECT COUNT(*) as count FROM settings').first<{ count: number }>();

  // Get settings
  const settings = await db.getAllSettings(database);

  // Get R2 bucket info
  let r2ObjectCount = 0;
  let r2TotalSize = 0;
  let cursor: string | undefined;
  do {
    const listing = await bucket.list({ limit: 1000, ...(cursor ? { cursor } : {}) });
    r2ObjectCount += listing.objects.length;
    for (const obj of listing.objects) {
      r2TotalSize += obj.size;
    }
    cursor = listing.truncated ? listing.cursor : undefined;
  } while (cursor);

  return c.json({
    database: {
      users: userCount?.count || 0,
      files: fileCount?.count || 0,
      settings: settingsCount?.count || 0,
    },
    r2: {
      objects: r2ObjectCount,
      totalSize: r2TotalSize,
    },
    settings,
    environment: {
      nodeVersion: 'Cloudflare Workers',
      typescript: true,
    },
  });
});

export default admin;
