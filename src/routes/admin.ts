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

export default admin;
