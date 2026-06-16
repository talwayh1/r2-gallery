import { Hono } from 'hono';
import type { AppBindings, Variables } from '../types';
import * as r2 from '../services/r2';
import * as db from '../services/db';
import { authMiddleware } from '../auth';

const shares = new Hono<{ Bindings: AppBindings; Variables: Variables }>();

// Generate random share ID
function generateId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  for (const b of bytes) result += chars[b % chars.length];
  return result;
}

// POST /api/shares (protected) — create share link
shares.post('/shares', authMiddleware, async (c) => {
  const { path, password, expiresIn } = await c.req.json<{
    path: string;
    password?: string;
    expiresIn?: number; // seconds
  }>();

  if (!path) return c.json({ error: 'Path required' }, 400);

  const id = generateId();
  const userId = c.get('userId');
  const expiresAt = expiresIn ? Math.floor(Date.now() / 1000) + expiresIn : null;

  // Hash password if provided
  let passwordHash: string | null = null;
  if (password) {
    const { hashPassword } = await import('../auth');
    passwordHash = await hashPassword(password);
  }

  await c.env.DB.prepare(
    'INSERT INTO shares (id, path, password_hash, expires_at, created_by) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, path, passwordHash, expiresAt, userId).run();

  return c.json({ id, url: `/s/${id}`, path, expiresAt });
});

// GET /api/shares (protected) — list my shares
shares.get('/shares', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const result = await c.env.DB.prepare(
    'SELECT id, path, expires_at, created_at FROM shares WHERE created_by = ? ORDER BY created_at DESC'
  ).bind(userId).all();
  return c.json(result.results);
});

// DELETE /api/shares/:id (protected) — delete share
shares.delete('/shares/:id', authMiddleware, async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId');
  await c.env.DB.prepare('DELETE FROM shares WHERE id = ? AND created_by = ?').bind(id, userId).run();
  return c.json({ success: true });
});

// GET /api/share/:id (public) — get share info
shares.get('/share/:id', async (c) => {
  const id = c.req.param('id');
  const share = await c.env.DB.prepare(
    'SELECT id, path, password_hash, expires_at, created_at FROM shares WHERE id = ?'
  ).bind(id).first<any>();

  if (!share) return c.json({ error: 'Share not found' }, 404);

  // Check expiry
  if (share.expires_at && share.expires_at < Math.floor(Date.now() / 1000)) {
    return c.json({ error: 'Share link has expired' }, 410);
  }

  const needsPassword = !!share.password_hash;
  return c.json({
    id: share.id,
    path: share.path,
    needsPassword,
    expiresAt: share.expires_at,
  });
});

// POST /api/share/:id/verify (public) — verify password and get file
shares.post('/share/:id/verify', async (c) => {
  const id = c.req.param('id');
  const { password } = await c.req.json<{ password?: string }>();

  const share = await c.env.DB.prepare(
    'SELECT * FROM shares WHERE id = ?'
  ).bind(id).first<any>();

  if (!share) return c.json({ error: 'Share not found' }, 404);

  if (share.expires_at && share.expires_at < Math.floor(Date.now() / 1000)) {
    return c.json({ error: 'Share link has expired' }, 410);
  }

  // Verify password if required
  if (share.password_hash) {
    if (!password) return c.json({ error: 'Password required' }, 401);
    const { verifyPassword } = await import('../auth');
    if (!(await verifyPassword(password, share.password_hash))) {
      return c.json({ error: 'Invalid password' }, 401);
    }
  }

  return c.json({ success: true, path: share.path });
});

// GET /api/share/:id/file (public) — get shared file content
shares.get('/share/:id/file', async (c) => {
  const id = c.req.param('id');
  const password = c.req.query('password');

  const share = await c.env.DB.prepare(
    'SELECT * FROM shares WHERE id = ?'
  ).bind(id).first<any>();

  if (!share) return c.json({ error: 'Share not found' }, 404);

  if (share.expires_at && share.expires_at < Math.floor(Date.now() / 1000)) {
    return c.json({ error: 'Share link has expired' }, 410);
  }

  // Verify password if required
  if (share.password_hash) {
    if (!password) return c.json({ error: 'Password required' }, 401);
    const { verifyPassword } = await import('../auth');
    if (!(await verifyPassword(password, share.password_hash))) {
      return c.json({ error: 'Invalid password' }, 401);
    }
  }

  // Get file from R2
  const bucket = c.env.R2_BUCKET;
  const obj = await r2.getObject(bucket, share.path);
  if (!obj) return c.json({ error: 'File not found' }, 404);

  const mime = obj.httpMetadata?.contentType || 'application/octet-stream';
  const headers = new Headers();
  headers.set('Content-Type', mime);
  headers.set('Content-Length', String(obj.size));
  headers.set('Cache-Control', 'public, max-age=3600');

  return new Response((obj as any).body, { headers });
});

export default shares;
