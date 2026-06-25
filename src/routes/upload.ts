import { Hono } from 'hono';
import type { AppBindings, Variables } from '../types';
import * as r2 from '../services/r2';
import * as db from '../services/db';
import { authMiddleware } from '../auth';
import { generateThumbnail, getThumbKey, isSupportedImageType } from '../services/thumbnail';
import { getMimeType } from '../utils/mime';
import type { ExecutionContext } from '@cloudflare/workers-types';

const upload = new Hono<{ Bindings: AppBindings; Variables: Variables }>();

/** Max concurrent file uploads — balances throughput vs. Workers CPU limits */
const UPLOAD_CONCURRENCY = 4;

/**
 * Run async tasks with a concurrency limit.
 * Inline helper — avoids adding a dependency like p-limit in the Workers runtime.
 */
async function runWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  const executing = new Set<Promise<void>>();

  for (let i = 0; i < items.length; i++) {
    const p = (async () => {
      results[i] = await fn(items[i]);
    })();
    executing.add(p);
    const cleanup = () => executing.delete(p);
    p.then(cleanup, cleanup);
    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
  return results;
}

// Demo mode check
const demoModeCheck = async (c: any, next: any) => {
  if (c.env.DEMO_MODE === 'true') {
    return c.json({ error: '上传在演示模式下被禁用' }, 403);
  }
  await next();
};

/** Check if file type is allowed based on settings */
function isFileTypeAllowed(fileName: string, allowedTypes: string): boolean {
  if (!allowedTypes) return true;
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const mime = getMimeType(fileName);
  const types = allowedTypes.split(',').map(t => t.trim().toLowerCase());
  return types.some(t => {
    if (t.startsWith('.')) return ext === t.slice(1);
    if (t.includes('*')) return mime.startsWith(t.replace('*', ''));
    return ext === t || mime === t;
  });
}

/** Get unique filename with smart conflict resolution (ZPan-style) */
async function resolveConflict(bucket: R2Bucket, filePath: string, strategy: 'increment' | 'overwrite' | 'fail'): Promise<string> {
  if (strategy === 'overwrite') return filePath;
  const existing = await bucket.get(filePath);
  if (!existing) return filePath;
  if (strategy === 'fail') throw new Error(`文件已存在: ${filePath}`);

  // increment strategy: try "name (1).ext", "name (2).ext", etc.
  const lastDot = filePath.lastIndexOf('.');
  const base = lastDot > 0 ? filePath.slice(0, lastDot) : filePath;
  const ext = lastDot > 0 ? filePath.slice(lastDot) : '';
  for (let i = 1; i <= 999; i++) {
    const candidate = `${base} (${i})${ext}`;
    const exists = await bucket.get(candidate);
    if (!exists) return candidate;
  }
  return `${base}-${Date.now()}${ext}`;
}

// POST /api/upload (protected)
upload.post('/upload', authMiddleware, demoModeCheck, async (c) => {
  const bucket = c.env.R2_BUCKET;
  const database = c.env.DB;

  // Load upload settings
  const [allowedTypesSetting, maxSizeSetting, existsSetting] = await Promise.all([
    db.getSetting(database, 'upload_allowed_file_types'),
    db.getSetting(database, 'upload_max_filesize'),
    db.getSetting(database, 'upload_exists'),
  ]);
  const allowedTypes = allowedTypesSetting || '';
  const maxSize = parseInt(maxSizeSetting || '0', 10) || 0;
  const existsStrategy = (existsSetting || 'increment') as 'increment' | 'overwrite' | 'fail';

  const formData = await c.req.formData();
  const dir = (formData.get('dir') as string) || '';
  const allFiles = formData.getAll('file') as unknown as File[];
  const files = allFiles.filter((f: any) => f && typeof f === 'object' && 'arrayBuffer' in f) as File[];

  if (!files.length) {
    return c.json({ error: 'No files uploaded' }, 400);
  }

  const ctx = c.executionCtx as ExecutionContext | undefined;

  /**
   * Process a single file upload: validate, resolve conflict, store to R2,
   * record metadata in D1, log activity, and kick off async thumbnail generation.
   */
  async function processFile(file: File): Promise<{ name: string; path: string; size: number; thumbGenerated?: boolean } | { name: string; error: string }> {
    // Check file type restriction
    if (!isFileTypeAllowed(file.name, allowedTypes)) {
      return { name: file.name, error: `文件类型不允许 (允许: ${allowedTypes})` };
    }

    const arrayBuffer = await file.arrayBuffer();

    // Check file size restriction
    if (maxSize > 0 && arrayBuffer.byteLength > maxSize) {
      return { name: file.name, error: `文件大小超过限制 (最大: ${Math.round(maxSize / 1024 / 1024)}MB)` };
    }

    const relativePath = formData.get('relativePath') as string | null;
    let filePath: string;

    if (relativePath) {
      filePath = dir ? `${dir}/${relativePath}` : relativePath;
    } else {
      filePath = dir ? `${dir}/${file.name}` : file.name;
    }

    const mime = getMimeType(file.name) || file.type || 'application/octet-stream';

    // Smart conflict resolution (ZPan-style: fail/overwrite/increment)
    try {
      filePath = await resolveConflict(bucket, filePath, existsStrategy);
    } catch (err: any) {
      return { name: file.name, error: err.message };
    }

    await r2.putObject(bucket, filePath, arrayBuffer, { contentType: mime });

    await db.upsertFileMetadata(database, {
      path: filePath,
      size: arrayBuffer.byteLength,
      mime,
      mtime: Math.floor(Date.now() / 1000),
      created_at: new Date().toISOString(),
    });

    // Log activity
    try { await db.logActivity(database, 'upload', filePath, c.get('userId')); } catch {}

    // Async thumbnail generation — don't block the response (ZPan pattern)
    const thumbPromise = (async () => {
      if (!isSupportedImageType(mime)) return;
      try {
        const thumbBuffer = await generateThumbnail(arrayBuffer, mime);
        if (thumbBuffer) {
          await r2.putObject(bucket, getThumbKey(filePath), thumbBuffer, { contentType: 'image/webp' });
        }
      } catch (err) {
        console.error(`Thumbnail generation failed for ${filePath}:`, err);
      }
    })();

    // Use waitUntil if available (Workers), otherwise fire-and-forget
    if (ctx?.waitUntil) {
      ctx.waitUntil(thumbPromise);
    } else {
      thumbPromise.catch(() => {});
    }

    return { name: file.name, path: filePath, size: arrayBuffer.byteLength };
  }

  // Process files in parallel with a concurrency limit
  const results = await runWithLimit(files, UPLOAD_CONCURRENCY, processFile);

  const uploaded = results.filter((r): r is { name: string; path: string; size: number; thumbGenerated?: boolean } => !('error' in r));
  const errors = results.filter((r): r is { name: string; error: string } => 'error' in r);

  return c.json({ success: true, uploaded, errors });
});

export default upload;
