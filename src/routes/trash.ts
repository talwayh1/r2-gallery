/**
 * Trash routes — soft delete, list, restore, purge.
 * Inspired by ZPan's trash system.
 */
import { Hono } from 'hono';
import type { AppBindings, Variables } from '../types';
import * as r2 from '../services/r2';
import * as db from '../services/db';
import { authMiddleware } from '../auth';

const trash = new Hono<{ Bindings: AppBindings; Variables: Variables }>();

// GET /api/trash — list all trashed items
trash.get('/trash', authMiddleware, async (c) => {
  const items = await db.listTrash(c.env.DB);
  return c.json({ items, total: items.length });
});

// POST /api/trash/restore — restore items from trash
trash.post('/trash/restore', authMiddleware, async (c) => {
  const { paths } = await c.req.json<{ paths: string[] }>();
  if (!paths?.length) return c.json({ error: 'No paths specified' }, 400);

  const bucket = c.env.R2_BUCKET;
  const database = c.env.DB;
  const restored: string[] = [];
  const errors: string[] = [];

  for (const originalPath of paths) {
    const item = await db.getTrashItem(database, originalPath);
    if (!item) { errors.push(`${originalPath}: not in trash`); continue; }

    // For directories, restore all children too
    const prefixItems = await db.getTrashByPrefix(database, originalPath + '/');
    const allItems = [item, ...prefixItems];

    for (const trashItem of allItems) {
      // The actual R2 objects are still in place (we only soft-deleted metadata)
      // Re-insert the metadata
      if (!trashItem.is_dir) {
        await db.upsertFileMetadata(database, {
          path: trashItem.original_path,
          size: trashItem.size,
          mime: trashItem.mime,
          mtime: Math.floor(Date.now() / 1000),
          created_at: new Date().toISOString(),
        });
      } else {
        await db.upsertFileMetadata(database, {
          path: trashItem.original_path,
          size: 0,
          mime: 'directory',
          mtime: Math.floor(Date.now() / 1000),
          created_at: new Date().toISOString(),
        });
      }
      await db.restoreFromTrash(database, trashItem.original_path);
    }
    restored.push(originalPath);
    await db.logActivity(database, 'restore', originalPath, c.get('userId'));
  }

  return c.json({ success: true, restored, errors });
});

// POST /api/trash/purge — permanently delete from trash
trash.post('/trash/purge', authMiddleware, async (c) => {
  const { paths } = await c.req.json<{ paths: string[] }>();
  if (!paths?.length) return c.json({ error: 'No paths specified' }, 400);

  const bucket = c.env.R2_BUCKET;
  const database = c.env.DB;
  const purged: string[] = [];

  for (const originalPath of paths) {
    const item = await db.getTrashItem(database, originalPath);
    if (!item) continue;

    // Delete actual R2 objects
    const prefixItems = await db.getTrashByPrefix(database, originalPath + '/');
    const allItems = [item, ...prefixItems];

    for (const trashItem of allItems) {
      if (!trashItem.is_dir) {
        try { await r2.deleteObject(bucket, trashItem.original_path); } catch {}
        // Also delete thumbnail
        try { await r2.deleteObject(bucket, `_thumbs/${trashItem.original_path}.webp`); } catch {}
      }
      await db.purgeFromTrash(database, trashItem.original_path);
    }
    purged.push(originalPath);
    await db.logActivity(database, 'purge', originalPath, c.get('userId'));
  }

  return c.json({ success: true, purged });
});

// POST /api/trash/empty — empty entire trash
trash.post('/trash/empty', authMiddleware, async (c) => {
  const items = await db.listTrash(c.env.DB);
  const bucket = c.env.R2_BUCKET;
  const database = c.env.DB;

  for (const item of items) {
    if (!item.is_dir) {
      try { await r2.deleteObject(bucket, item.original_path); } catch {}
      try { await r2.deleteObject(bucket, `_thumbs/${item.original_path}.webp`); } catch {}
    }
    await db.purgeFromTrash(database, item.original_path);
  }

  return c.json({ success: true, purged: items.length });
});

export default trash;
