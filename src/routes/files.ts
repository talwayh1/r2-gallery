import { Hono } from 'hono';
import type { AppBindings, Variables, FileInfo, FileListResponse } from '../types';
import * as r2 from '../services/r2';
import * as db from '../services/db';
import { authMiddleware } from '../auth';

const files = new Hono<{ Bindings: AppBindings; Variables: Variables }>();

// Public: file browsing (GET /files, GET /file, GET /dirs)
// Protected: file management (POST /mkdir, /delete, /rename)

// GET /api/files?dir=path&sort=name|size|mtime&order=asc|desc&type=image|video|audio|all
files.get('/files', async (c) => {
  const dir = c.req.query('dir') || '';
  const sort = c.req.query('sort') || 'name';
  const order = c.req.query('order') || 'asc';
  const typeFilter = c.req.query('type') || 'all';
  const bucket = c.env.R2_BUCKET;
  const database = c.env.DB;

  const prefix = dir ? dir + '/' : '';
  const result = await r2.listObjects(bucket, prefix, '/');

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

  const dirs = result.directories.map(d => d.replace(prefix, '').replace(/\/$/, '')).filter(Boolean);

  // Sort files
  const sortedEntries = Object.entries(filesMap).sort(([, a], [, b]) => {
    // Directories always first
    if (a.type === 'directory' && b.type !== 'directory') return -1;
    if (a.type !== 'directory' && b.type === 'directory') return 1;

    let cmp = 0;
    if (sort === 'size') {
      cmp = a.size - b.size;
    } else if (sort === 'mtime') {
      cmp = a.mtime - b.mtime;
    } else {
      cmp = a.name.localeCompare(b.name, 'zh-CN');
    }
    return order === 'desc' ? -cmp : cmp;
  });

  const sortedFiles: Record<string, FileInfo> = {};
  for (const [key, val] of sortedEntries) {
    sortedFiles[key] = val;
  }

  return c.json({
    path: dir,
    files: sortedFiles,
    dirs,
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

  const headers = new Headers();
  headers.set('Content-Type', obj.httpMetadata?.contentType || getMimeType(path));
  headers.set('Content-Length', String(obj.size));
  headers.set('Cache-Control', 'public, max-age=3600');

  if (c.req.query('download') === '1') {
    headers.set('Content-Disposition', `attachment; filename="${path.split('/').pop()}"`);
  }

  return new Response((obj as any).body, { headers });
});

// POST /api/mkdir (protected)
files.post('/mkdir', authMiddleware, async (c) => {
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
files.post('/delete', authMiddleware, async (c) => {
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

// POST /api/rename (protected)
files.post('/rename', authMiddleware, async (c) => {
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
