import { Hono } from 'hono';
import type { AppBindings, Variables, FileInfo, FileListResponse } from '../types';
import * as r2 from '../services/r2';
import * as db from '../services/db';
import { authMiddleware } from '../auth';
import { generateThumbnail, getThumbKey, isSupportedImageType } from '../services/thumbnail';

const files = new Hono<{ Bindings: AppBindings; Variables: Variables }>();

// Demo mode middleware - blocks write operations
const demoModeCheck = async (c: any, next: any) => {
  if (c.env.DEMO_MODE === 'true') {
    return c.json({ error: '操作在演示模式下被禁用' }, 403);
  }
  await next();
};

// Public: file browsing (GET /files, GET /file, GET /dirs)
// Protected: file management (POST /mkdir, /delete, /rename)

// GET /api/files?dir=path&sort=name|size|mtime&order=asc|desc&type=image|video|audio|all&cursor=xxx&limit=100
files.get('/files', async (c) => {
  const dir = c.req.query('dir') || '';
  const sort = c.req.query('sort') || 'name';
  const order = c.req.query('order') || 'asc';
  const typeFilter = c.req.query('type') || 'all';
  const cursor = c.req.query('cursor') || undefined;
  const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : undefined;
  const bucket = c.env.R2_BUCKET;
  const database = c.env.DB;
  const prefix = dir ? dir + '/' : '';
  const result = await r2.listObjects(bucket, prefix, '/', { limit, cursor });

  const filesMap: Record<string, FileInfo> = {};

  // Add directories
  for (const d of result.directories) {
    const dirName = d.replace(prefix, '').replace(/\/$/, '');
    if (!dirName) continue;
    filesMap[dirName] = {
      name: dirName,
      type: 'directory',
      size: 0,
      mime: 'directory',
      mtime: 0,
      path: d.replace(/\/$/, ''),
    };
  }

  // Add files
  for (const obj of result.files) {
    const key = obj.key;
    if (!key || key.endsWith('/')) continue;
    const name = key.replace(prefix, '');
    if (name.includes('/')) continue; // Skip nested files

    const mimeType = getMimeType(name);

    // Apply type filter
    if (typeFilter !== 'all') {
      const prefixMap: Record<string, string[]> = {
        image: ['image/'],
        video: ['video/'],
        audio: ['audio/'],
        document: ['application/pdf', 'text/', 'application/msword',
          'application/vnd.openxmlformats', 'application/vnd.ms-'],
      };
      const prefixes = prefixMap[typeFilter];
      if (prefixes && !prefixes.some((p) => mimeType.startsWith(p))) continue;
    }

    filesMap[name] = {
      name,
      type: 'file',
      size: obj.size,
      mime: mimeType,
      mtime: Math.floor(obj.uploaded.getTime() / 1000),
      path: key,
    };
  }

  // Apply file/dir filters
  const filesInclude = c.req.query('files_include');
  const filesExclude = c.req.query('files_exclude');
  const dirsInclude = c.req.query('dirs_include');
  const dirsExclude = c.req.query('dirs_exclude');

  const matchRegex = (name: string, pattern: string): boolean => {
    try {
      return new RegExp(pattern, 'i').test(name);
    } catch {
      return true;
    }
  };

  // Filter files
  for (const [name, file] of Object.entries(filesMap)) {
    if (file.type === 'file') {
      if (filesInclude && !matchRegex(name, filesInclude)) { delete filesMap[name]; continue; }
      if (filesExclude && matchRegex(name, filesExclude)) { delete filesMap[name]; continue; }
    }
  }

  const dirs = result.directories
    .map(d => d.replace(prefix, '').replace(/\/$/, ''))
    .filter(Boolean)
    .filter(d => {
      if (dirsInclude && !matchRegex(d, dirsInclude)) return false;
      if (dirsExclude && matchRegex(d, dirsExclude)) return false;
      return true;
    });

  // Fisher-Yates shuffle
  const shuffleArray = <T>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // Sort files
  let sortedEntries = Object.entries(filesMap).sort(([, a], [, b]) => {
    // Directories always first
    if (a.type === 'directory' && b.type !== 'directory') return -1;
    if (a.type !== 'directory' && b.type === 'directory') return 1;

    let cmp = 0;
    if (sort === 'size') {
      cmp = a.size - b.size;
    } else if (sort === 'mtime') {
      cmp = a.mtime - b.mtime;
    } else if (sort === 'kind') {
      const extA = a.name.split('.').pop()?.toLowerCase() || '';
      const extB = b.name.split('.').pop()?.toLowerCase() || '';
      cmp = extA.localeCompare(extB) || a.name.localeCompare(b.name, 'zh-CN');
    } else {
      cmp = a.name.localeCompare(b.name, 'zh-CN');
    }
    return order === 'desc' ? -cmp : cmp;
  });

  if (sort === 'shuffle') {
    sortedEntries = shuffleArray(sortedEntries);
  }

  const sortedFiles: Record<string, FileInfo> = {};
  for (const [key, val] of sortedEntries) {
    sortedFiles[key] = val;
  }

  return c.json({
    path: dir,
    files: sortedFiles,
    dirs,
    cursor: result.cursor,
    hasMore: result.truncated,
  } as FileListResponse);
});

// GET /api/dirs
files.get('/dirs', async (c) => {
  const database = c.env.DB;
  const tree = await db.getDirTree(database);
  return c.json(tree);
});

// GET /api/file?path=photos/image.jpg
files.get('/file', async (c) => {
  const path = c.req.query('path');
  if (!path) return c.json({ error: 'Path required' }, 400);

  const bucket = c.env.R2_BUCKET;
  const obj = await r2.getObject(bucket, path);
  if (!obj) return c.json({ error: 'File not found' }, 404);

  // Always use our getMimeType for correct type detection
  const contentType = getMimeType(path);

  const headers = new Headers();
  headers.set('Content-Type', contentType);
  headers.set('Content-Length', String(obj.size));
  headers.set('Cache-Control', 'public, max-age=3600');

  if (c.req.query('download') === '1') {
    headers.set('Content-Disposition', `attachment; filename="${path.split('/').pop()}"`);
  }

  return new Response((obj as any).body, { headers });
});

// GET /api/thumb?path=photos/image.jpg
// Serves a 300x300 WebP thumbnail. Falls back to original if generation fails.
files.get('/thumb', async (c) => {
  const path = c.req.query('path');
  if (!path) return c.json({ error: 'Path required' }, 400);

  const bucket = c.env.R2_BUCKET;
  const thumbKey = getThumbKey(path);
  const customThumbKey = '_thumbs/' + path + '.webp';

  // Try custom thumbnail first
  try {
    const customThumb = await r2.getObject(bucket, customThumbKey);
    if (customThumb) {
      const headers = new Headers();
      headers.set('Content-Type', 'image/webp');
      headers.set('Content-Length', String(customThumb.size));
      headers.set('Cache-Control', 'public, max-age=604800');
      return new Response((customThumb as any).body, { headers });
    }
  } catch {}

  // Try cached thumbnail second
  try {
    const cachedThumb = await r2.getObject(bucket, thumbKey);
    if (cachedThumb) {
      const headers = new Headers();
      headers.set('Content-Type', 'image/webp');
      headers.set('Content-Length', String(cachedThumb.size));
      headers.set('Cache-Control', 'public, max-age=604800');
      return new Response((cachedThumb as any).body, { headers });
    }
  } catch {}

  // Get original and buffer it (body can only be read once)
  const original = await r2.getObject(bucket, path);
  if (!original) return c.json({ error: 'File not found' }, 404);

  const mime = getMimeType(path);
  const arrayBuffer = await (original as any).arrayBuffer();

  if (isSupportedImageType(mime)) {
    try {
      const thumbBuffer = await generateThumbnail(arrayBuffer, mime);
      if (thumbBuffer) {
        await r2.putObject(bucket, thumbKey, thumbBuffer, { contentType: 'image/webp' });
        return new Response(thumbBuffer, {
          headers: { 'Content-Type': 'image/webp', 'Content-Length': String(thumbBuffer.byteLength), 'Cache-Control': 'public, max-age=604800' },
        });
      }
    } catch (err) {
      console.error('Thumbnail generation failed, serving original:', err);
    }
  }

  // Fallback: serve original from buffer
  return new Response(arrayBuffer, {
    headers: { 'Content-Type': mime, 'Content-Length': String(arrayBuffer.byteLength), 'Cache-Control': 'public, max-age=3600' },
  });
});

// GET /api/url-content?path=file.url — read URL from .url files
files.get('/url-content', async (c) => {
  const path = c.req.query('path');
  if (!path) return c.json({ error: 'Path required' }, 400);
  const bucket = c.env.R2_BUCKET;
  const obj = await r2.getObject(bucket, path);
  if (!obj) return c.json({ error: 'File not found' }, 404);
  const text = await (obj as any).text();
  return c.json({ url: text.trim() });
});

// POST /api/create-file (protected) — create empty file
files.post('/create-file', authMiddleware, demoModeCheck, async (c) => {
  const { path: filePath } = await c.req.json<{ path: string }>();
  if (!filePath) return c.json({ error: 'Path required' }, 400);
  const bucket = c.env.R2_BUCKET;
  const database = c.env.DB;
  await r2.putObject(bucket, filePath, '', { contentType: 'application/octet-stream' });
  await db.upsertFileMetadata(database, {
    path: filePath, size: 0, mime: getMimeType(filePath),
    mtime: Math.floor(Date.now() / 1000), created_at: new Date().toISOString(),
  });
  return c.json({ success: true });
});

// POST /api/create-url (protected) — create .url shortcut file
files.post('/create-url', authMiddleware, demoModeCheck, async (c) => {
  const { path: filePath, url: linkUrl } = await c.req.json<{ path: string; url: string }>();
  if (!filePath || !linkUrl) return c.json({ error: 'Path and URL required' }, 400);
  const bucket = c.env.R2_BUCKET;
  const database = c.env.DB;
  const urlPath = filePath.endsWith('.url') ? filePath : filePath + '.url';
  await r2.putObject(bucket, urlPath, linkUrl, { contentType: 'text/plain' });
  await db.upsertFileMetadata(database, {
    path: urlPath, size: linkUrl.length, mime: 'text/plain',
    mtime: Math.floor(Date.now() / 1000), created_at: new Date().toISOString(),
  });
  return c.json({ success: true });
});

// POST /api/custom-thumb (protected) — upload custom thumbnail
files.post('/custom-thumb', authMiddleware, demoModeCheck, async (c) => {
  const formData = await c.req.formData();
  const filePath = formData.get('path') as string;
  const file = formData.get('file') as File;
  if (!filePath || !file) return c.json({ error: 'Path and file required' }, 400);
  const bucket = c.env.R2_BUCKET;
  const thumbKey = '_thumbs/' + filePath + '.webp';
  const arrayBuffer = await file.arrayBuffer();
  // Try to convert to webp thumbnail
  try {
    const thumbBuffer = await generateThumbnail(arrayBuffer, file.type || 'image/jpeg');
    if (thumbBuffer) {
      await r2.putObject(bucket, thumbKey, thumbBuffer, { contentType: 'image/webp' });
      return c.json({ success: true });
    }
  } catch {}
  // Fallback: store original
  await r2.putObject(bucket, thumbKey, arrayBuffer, { contentType: file.type || 'image/jpeg' });
  return c.json({ success: true });
});

// POST /api/mkdir (protected)
files.post('/mkdir', authMiddleware, demoModeCheck, async (c) => {
  const { path } = await c.req.json<{ path: string }>();
  if (!path) return c.json({ error: 'Path required' }, 400);

  const bucket = c.env.R2_BUCKET;
  const database = c.env.DB;

  // Create directory marker in R2
  await r2.putObject(bucket, path + '/', '', { contentType: 'directory' });

  // Store metadata in D1
  await db.upsertFileMetadata(database, {
    path,
    size: 0,
    mime: 'directory',
    mtime: Math.floor(Date.now() / 1000),
    created_at: new Date().toISOString(),
  });

  return c.json({ success: true });
});

// POST /api/delete (protected)
files.post('/delete', authMiddleware, demoModeCheck, async (c) => {
  const { items } = await c.req.json<{ items: string[] }>();
  if (!items?.length) return c.json({ error: 'No items specified' }, 400);

  const bucket = c.env.R2_BUCKET;
  const database = c.env.DB;

  for (const item of items) {
    // List all objects with this prefix
    const objects: string[] = [];
    const listResult = await r2.listObjects(bucket, item.endsWith('/') ? item : item + '/');
    for (const obj of listResult.files) {
      if (obj.key) objects.push(obj.key);
    }

    // Also include the item itself if it's a file
    const directObj = await r2.getObject(bucket, item);
    if (directObj) objects.push(item);

    // Delete from R2
    if (objects.length > 0) {
      await r2.deleteObjects(bucket, objects);
    }

    // Delete from D1
    await db.deleteFileMetadata(database, item);
    await db.deleteFileMetadataByPrefix(database, item + '/');
  }

  return c.json({ success: true });
});

// POST /api/move (protected) — move file/folder to a new location
files.post('/move', authMiddleware, demoModeCheck, async (c) => {
  const { from, to } = await c.req.json<{ from: string; to: string }>();
  if (!from || !to) return c.json({ error: 'from and to paths required' }, 400);

  const bucket = c.env.R2_BUCKET;
  const database = c.env.DB;

  // Check if source is a file
  const srcObj = await r2.getObject(bucket, from);
  if (srcObj) {
    // Single file move: compute destination path
    // "to" can be a directory (append filename) or a full path
    let destPath = to;
    const toDirCheck = await r2.getObject(bucket, to.endsWith('/') ? to : to + '/');
    if (toDirCheck) {
      // Moving into a directory
      const fileName = from.split('/').pop()!;
      destPath = to.endsWith('/') ? to + fileName : to + '/' + fileName;
    }

    // Copy to new location, delete old
    await r2.copyObject(bucket, from, destPath);

    // Update D1 metadata
    await db.deleteFileMetadata(database, from);
    await db.upsertFileMetadata(database, {
      path: destPath,
      size: srcObj.size,
      mime: srcObj.httpMetadata?.contentType || getMimeType(destPath),
      mtime: Math.floor(Date.now() / 1000),
      created_at: new Date().toISOString(),
    });

    // Also move thumbnail if exists
    const { getThumbKey } = await import('../services/thumbnail');
    const oldThumbKey = getThumbKey(from);
    const newThumbKey = getThumbKey(destPath);
    const thumbObj = await r2.getObject(bucket, oldThumbKey);
    if (thumbObj) {
      await r2.copyObject(bucket, oldThumbKey, newThumbKey);
    }

    return c.json({ success: true, newPath: destPath });
  }

  // Check if source is a directory
  const dirCheck = await r2.listObjects(bucket, from.endsWith('/') ? from : from + '/');
  if (dirCheck.files.length === 0 && dirCheck.directories.length === 0) {
    // Try as directory marker
    const dirMarker = await r2.getObject(bucket, from + '/');
    if (!dirMarker) return c.json({ error: 'Source not found' }, 404);
  }

  // Directory move: compute destination
  const dirName = from.split('/').pop()!;
  const destDir = to.endsWith('/') ? to + dirName : to + '/' + dirName;

  // List all objects in source directory
  const allObjects: string[] = [];
  let dirCursor: string | undefined;
  do {
    const listing = await r2.listObjects(bucket, from + '/', undefined, { cursor: dirCursor });
    for (const obj of listing.files) {
      if (obj.key) allObjects.push(obj.key);
    }
    dirCursor = listing.cursor;
  } while (dirCursor);

  // Copy each object to new location
  for (const key of allObjects) {
    const newKey = key.replace(from, destDir);
    const obj = await r2.getObject(bucket, key);
    if (obj) {
      await r2.copyObject(bucket, key, newKey);
    }
  }

  // Copy directory marker
  await r2.copyObject(bucket, from + '/', destDir + '/');

  // Update D1 metadata for all moved files
  await db.deleteFileMetadata(database, from);
  await db.deleteFileMetadataByPrefix(database, from + '/');
  await db.upsertFileMetadata(database, {
    path: destDir,
    size: 0,
    mime: 'directory',
    mtime: Math.floor(Date.now() / 1000),
    created_at: new Date().toISOString(),
  });

  // Re-insert metadata for files under the directory
  for (const key of allObjects) {
    const obj = await r2.getObject(bucket, key.replace(from, destDir));
    if (obj) {
      await db.upsertFileMetadata(database, {
        path: key.replace(from, destDir).replace(/\/$/, ''),
        size: obj.size,
        mime: (obj as any).httpMetadata?.contentType || getMimeType(key),
        mtime: Math.floor(Date.now() / 1000),
        created_at: new Date().toISOString(),
      });
    }
  }

  return c.json({ success: true, newPath: destDir });
});

// POST /api/rename (protected)
files.post('/rename', authMiddleware, demoModeCheck, async (c) => {
  const { path: oldPath, name: newName } = await c.req.json<{ path: string; name: string }>();
  if (!oldPath || !newName) return c.json({ error: 'Path and name required' }, 400);

  const bucket = c.env.R2_BUCKET;
  const database = c.env.DB;

  const parts = oldPath.split('/');
  parts[parts.length - 1] = newName;
  const newPath = parts.join('/');

  // Check if source exists
  const srcObj = await r2.getObject(bucket, oldPath);
  if (!srcObj) {
    // Might be a directory
    const dirResult = await r2.listObjects(bucket, oldPath + '/');
    if (dirResult.files.length === 0 && dirResult.directories.length === 0) {
      return c.json({ error: 'Source not found' }, 404);
    }

    // Rename directory: list all objects and copy
    const allObjects: string[] = [];
    let cursor: string | undefined;
    do {
      const listing = await r2.listObjects(bucket, oldPath + '/', undefined, { cursor });
      for (const obj of listing.files) {
        if (obj.key) allObjects.push(obj.key);
      }
      cursor = listing.cursor;
    } while (cursor);

    for (const key of allObjects) {
      const newKey = key.replace(oldPath, newPath);
      await r2.copyObject(bucket, key, newKey);
      await db.deleteFileMetadata(database, key);
      await db.upsertFileMetadata(database, {
        path: newKey.replace(/\/$/, ''),
        size: 0,
        mime: getMimeType(newKey),
        mtime: Math.floor(Date.now() / 1000),
        created_at: new Date().toISOString(),
      });
    }

    // Update directory metadata
    await db.deleteFileMetadata(database, oldPath);
    await db.upsertFileMetadata(database, {
      path: newPath,
      size: 0,
      mime: 'directory',
      mtime: Math.floor(Date.now() / 1000),
      created_at: new Date().toISOString(),
    });

    return c.json({ success: true, newPath });
  }

  // Rename single file
  await r2.copyObject(bucket, oldPath, newPath);
  await db.deleteFileMetadata(database, oldPath);
  await db.upsertFileMetadata(database, {
    path: newPath,
    size: srcObj.size,
    mime: srcObj.httpMetadata?.contentType || getMimeType(newName),
    mtime: Math.floor(Date.now() / 1000),
    created_at: new Date().toISOString(),
  });

  return c.json({ success: true, newPath });
});

// POST /api/batch-rename (protected) — batch rename multiple files
files.post('/batch-rename', authMiddleware, demoModeCheck, async (c) => {
  const { items } = await c.req.json<{ items: { oldPath: string; newName: string }[] }>();
  if (!items?.length) return c.json({ error: 'No items specified' }, 400);

  const bucket = c.env.R2_BUCKET;
  const database = c.env.DB;
  let success = 0;
  let failed = 0;

  for (const { oldPath, newName } of items) {
    try {
      const parts = oldPath.split('/');
      parts[parts.length - 1] = newName;
      const newPath = parts.join('/');

      const srcObj = await r2.getObject(bucket, oldPath);
      if (!srcObj) {
        failed++;
        continue;
      }

      // Copy to new key, delete old key
      await r2.copyObject(bucket, oldPath, newPath);

      // Update D1 metadata
      await db.deleteFileMetadata(database, oldPath);
      await db.upsertFileMetadata(database, {
        path: newPath,
        size: srcObj.size,
        mime: srcObj.httpMetadata?.contentType || getMimeType(newName),
        mtime: Math.floor(Date.now() / 1000),
        created_at: new Date().toISOString(),
      });

      // Also move thumbnail if exists
      const { getThumbKey } = await import('../services/thumbnail');
      const oldThumbKey = getThumbKey(oldPath);
      const newThumbKey = getThumbKey(newPath);
      const thumbObj = await r2.getObject(bucket, oldThumbKey);
      if (thumbObj) {
        await r2.copyObject(bucket, oldThumbKey, newThumbKey);
      }

      success++;
    } catch (err) {
      console.error(`Batch rename failed for ${oldPath}:`, err);
      failed++;
    }
  }

  return c.json({ success, failed });
});

// POST /api/copy (protected) — copy file/folder to a new location
files.post('/copy', authMiddleware, demoModeCheck, async (c) => {
  const { source, target } = await c.req.json<{ source: string; target: string }>();
  if (!source || !target) return c.json({ error: 'source and target paths required' }, 400);

  const bucket = c.env.R2_BUCKET;
  const database = c.env.DB;

  // Check if source is a file
  const srcObj = await r2.getObject(bucket, source);
  if (srcObj) {
    let destPath = target;
    const toDirCheck = await r2.getObject(bucket, target.endsWith('/') ? target : target + '/');
    if (toDirCheck) {
      const fileName = source.split('/').pop()!;
      destPath = target.endsWith('/') ? target + fileName : target + '/' + fileName;
    }

    await r2.copyObject(bucket, source, destPath);
    await db.upsertFileMetadata(database, {
      path: destPath,
      size: srcObj.size,
      mime: srcObj.httpMetadata?.contentType || getMimeType(destPath),
      mtime: Math.floor(Date.now() / 1000),
      created_at: new Date().toISOString(),
    });

    return c.json({ success: true, newPath: destPath });
  }

  return c.json({ error: 'Source not found' }, 404);
});

// POST /api/duplicate (protected) — duplicate file with auto-incremented name
files.post('/duplicate', authMiddleware, demoModeCheck, async (c) => {
  const { path: filePath } = await c.req.json<{ path: string }>();
  if (!filePath) return c.json({ error: 'Path required' }, 400);

  const bucket = c.env.R2_BUCKET;
  const database = c.env.DB;

  const srcObj = await r2.getObject(bucket, filePath);
  if (!srcObj) return c.json({ error: 'File not found' }, 404);

  // Generate unique name
  const parts = filePath.split('.');
  const ext = parts.length > 1 ? '.' + parts.pop() : '';
  const base = parts.join('.');
  let newPath = filePath;
  let counter = 2;

  while (await r2.getObject(bucket, newPath)) {
    const dashIdx = base.lastIndexOf('-');
    if (dashIdx > 0 && /^\d+$/.test(base.slice(dashIdx + 1))) {
      newPath = base.slice(0, dashIdx) + '-' + counter + ext;
    } else {
      newPath = base + '-' + counter + ext;
    }
    counter++;
  }

  await r2.copyObject(bucket, filePath, newPath);
  await db.upsertFileMetadata(database, {
    path: newPath,
    size: srcObj.size,
    mime: srcObj.httpMetadata?.contentType || getMimeType(newPath),
    mtime: Math.floor(Date.now() / 1000),
    created_at: new Date().toISOString(),
  });

  return c.json({ success: true, newPath });
});

function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon',
    mp4: 'video/mp4', webm: 'video/webm', avi: 'video/x-msvideo', mov: 'video/quicktime',
    mkv: 'video/x-matroska', flv: 'video/x-flv', wmv: 'video/x-ms-wmv',
    mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', flac: 'audio/flac',
    aac: 'audio/aac', m4a: 'audio/mp4',
    pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    zip: 'application/zip', '7z': 'application/x-7z-compressed', rar: 'application/vnd.rar',
    tar: 'application/x-tar', gz: 'application/gzip',
    txt: 'text/plain', html: 'text/html', css: 'text/css', js: 'application/javascript',
    json: 'application/json', xml: 'application/xml', csv: 'text/csv', md: 'text/markdown',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

export default files;
