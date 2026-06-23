import { Hono } from 'hono';
import type { AppBindings, Variables, FileInfo, FileListResponse } from '../types';
import * as r2 from '../services/r2';
import * as db from '../services/db';
import { authMiddleware } from '../auth';
import { generateThumbnail, getThumbKey, isSupportedImageType, isSvg } from '../services/thumbnail';
import { getMimeType } from '../utils/mime';

const files = new Hono<{ Bindings: AppBindings; Variables: Variables }>();

// Short-term cache for R2 list results (avoids repeated list ops on quick navigation)
const listCache = new Map<string, { data: any; ts: number }>();
const LIST_CACHE_TTL = 10_000; // 10 seconds
const LIST_CACHE_MAX = 50; // max entries — prevents unbounded growth in long-lived Workers
function evictStaleListCache() {
  const now = Date.now();
  // Evict stale entries (past TTL)
  for (const [key, entry] of listCache) {
    if (now - entry.ts > LIST_CACHE_TTL) listCache.delete(key);
  }
  // Evict overflow (oldest entries first — Map preserves insertion/access order)
  while (listCache.size > LIST_CACHE_MAX) {
    const oldest = listCache.keys().next().value;
    if (oldest !== undefined) listCache.delete(oldest);
  }
}
/** Track access order for LRU: re-insert the entry so Map iteration order stays fresh */
function touchListCache(key: string): boolean {
  const entry = listCache.get(key);
  if (!entry) return false;
  listCache.delete(key);
  listCache.set(key, entry);
  return true;
}

// Demo mode middleware - blocks write operations
const demoModeCheck = async (c: any, next: any) => {
  if (c.env.DEMO_MODE === 'true') {
    return c.json({ error: '操作在演示模式下被禁用' }, 403);
  }
  await next();
  // Invalidate list cache after any successful write operation
  listCache.clear();
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

  // Check short-term cache (skip for paginated requests)
  const cacheKey = `${dir}:${sort}:${order}:${typeFilter}`;
  if (!cursor) {
    evictStaleListCache();
    if (touchListCache(cacheKey)) {
      const cached = listCache.get(cacheKey)!;
      return c.json(cached.data);
    }
  }

  const result = await r2.listObjects(bucket, prefix, '/', { limit, cursor });

  const filesMap: Record<string, FileInfo> = {};

  // Directories are returned separately in `dirs` array — don't add to filesMap

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

  // Query file counts and mtime per directory from D1 (fast, single query)
  let dirCounts: Record<string, number> = {};
  let dirMtimes: Record<string, number> = {};
  if (dirs.length > 0 && database) {
    try {
      // Get all files/subs at exactly one level deep under prefix
      const countResult = await database.prepare(
        "SELECT path, mtime FROM file_metadata WHERE path LIKE ? || '%' AND path != ? AND path NOT LIKE ? || '%/%/%' AND path LIKE ? || '%/%'"
      ).bind(prefix, prefix, prefix, prefix).all<{path: string; mtime: number}>();
      for (const d of dirs) { dirCounts[d] = 0; dirMtimes[d] = 0; }
      for (const row of countResult.results) {
        const rel = row.path.slice(prefix.length);
        const slashIdx = rel.indexOf('/');
        if (slashIdx > 0) {
          const dirName = rel.slice(0, slashIdx);
          if (dirCounts[dirName] !== undefined) {
            dirCounts[dirName]++;
            // Track max mtime for each directory (from its children metadata)
            if (row.mtime > dirMtimes[dirName]) dirMtimes[dirName] = row.mtime;
          }
        }
      }
    } catch (err) {
      console.error('Failed to query dir counts:', err);
    }
  }

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
      const kindOrder = (mime: string): number => {
        if (mime.startsWith('image/')) return 0;
        if (mime.startsWith('video/')) return 1;
        if (mime.startsWith('audio/')) return 2;
        if (mime === 'application/pdf' || mime.startsWith('text/') ||
            mime === 'application/json' || mime === 'application/xml' ||
            mime === 'application/javascript' || mime === 'application/x-yaml') return 3;
        return 4;
      };
      cmp = kindOrder(a.mime) - kindOrder(b.mime) || a.name.localeCompare(b.name, 'zh-CN');
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

  const responseData = {
    path: dir,
    files: sortedFiles,
    dirs,
    dirCounts: Object.keys(dirCounts).length > 0 ? dirCounts : undefined,
    dirMtimes: Object.keys(dirMtimes).length > 0 ? dirMtimes : undefined,
    cursor: result.cursor,
    hasMore: result.truncated,
  } as FileListResponse;

  // Cache result for quick navigation (only first page, no cursor)
  if (!cursor) {
    listCache.set(cacheKey, { data: responseData, ts: Date.now() });
  }

  return c.json(responseData);
});

// GET /api/dirs
files.get('/dirs', async (c) => {
  const database = c.env.DB;
  const tree = await db.getDirTree(database);
  const resp = c.json(tree);
  resp.headers.set('Cache-Control', 'no-cache, must-revalidate');
  return resp;
});

// GET /api/file?path=photos/image.jpg — supports Range requests for video seeking
files.get('/file', async (c) => {
  const path = c.req.query('path');
  if (!path) return c.json({ error: 'Path required' }, 400);

  const bucket = c.env.R2_BUCKET;
  const obj = await r2.getObject(bucket, path);
  if (!obj) return c.json({ error: 'File not found' }, 404);

  const totalSize = obj.size;
  const etag = `"${totalSize}-${(obj as any).uploaded?.getTime?.() || 0}"`;
  if (c.req.header('If-None-Match') === etag) return new Response(null, { status: 304 });

  const contentType = getMimeType(path);
  const isDownload = c.req.query('download') === '1';

  // Parse Range header for partial content (video seeking)
  const rangeHeader = c.req.header('Range');
  if (rangeHeader && !isDownload) {
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (match) {
      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : Math.min(start + 1024 * 1024 - 1, totalSize - 1); // 1MB chunks
      const length = end - start + 1;

      // Get the range from R2
      const rangeObj = await bucket.get(path, { range: { offset: start, length } });
      if (!rangeObj) return new Response(null, { status: 416 });

      const headers = new Headers();
      headers.set('Content-Type', contentType);
      headers.set('Content-Length', String(length));
      headers.set('Content-Range', `bytes ${start}-${end}/${totalSize}`);
      headers.set('Accept-Ranges', 'bytes');
      headers.set('Cache-Control', 'public, max-age=86400');
      headers.set('ETag', etag);
      headers.set('X-Content-Type-Options', 'nosniff');

      // Log traffic
      try { await db.logTraffic(c.env.DB, path, length, c.get('userId')); } catch {}

      return new Response((rangeObj as any).body, { status: 206, headers });
    }
  }

  // Full body response
  const headers = new Headers();
  headers.set('Content-Type', contentType);
  headers.set('Content-Length', String(totalSize));
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', 'public, max-age=86400');
  headers.set('ETag', etag);
  headers.set('X-Content-Type-Options', 'nosniff');

  if (isDownload) {
    headers.set('Content-Disposition', `attachment; filename="${path.split('/').pop()}"`);
  }

  // Log traffic
  try { await db.logTraffic(c.env.DB, path, totalSize, c.get('userId')); } catch {}

  return new Response((obj as any).body, { headers });
});

// GET /api/thumb?path=photos/image.jpg
// Serves a 300x300 WebP thumbnail. Falls back to original if generation fails.
files.get('/thumb', async (c) => {
  const path = c.req.query('path');
  if (!path) return c.json({ error: 'Path required' }, 400);

  const bucket = c.env.R2_BUCKET;
  const thumbKey = getThumbKey(path);

  // Try cached thumbnail
  try {
    const cachedThumb = await r2.getObject(bucket, thumbKey);
    if (cachedThumb) {
      const etag = `"${cachedThumb.size}-${(cachedThumb as any).uploaded?.getTime?.() || 0}"`;
      if (c.req.header('If-None-Match') === etag) return new Response(null, { status: 304 });
      const headers = new Headers();
      headers.set('Content-Type', 'image/webp');
      headers.set('Content-Length', String(cachedThumb.size));
      headers.set('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
      headers.set('ETag', etag);
      headers.set('X-Content-Type-Options', 'nosniff');
      return new Response((cachedThumb as any).body, { headers });
    }
  } catch {}

  // Get original and buffer it (body can only be read once)
  const original = await r2.getObject(bucket, path);
  if (!original) return c.json({ error: 'File not found' }, 404);

  // ETag from original object for conditional requests
  const origEtag = `"orig-${original.size}-${(original as any).uploaded?.getTime?.() || 0}"`;
  if (c.req.header('If-None-Match') === origEtag) return new Response(null, { status: 304 });

  const mime = getMimeType(path);
  const arrayBuffer = await (original as any).arrayBuffer();

  // SVG: serve directly (browser renders natively, no WASM decode needed)
  if (isSvg(mime)) {
    return new Response(arrayBuffer, {
      headers: { 'Content-Type': 'image/svg+xml', 'Content-Length': String(arrayBuffer.byteLength), 'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400', 'ETag': origEtag, 'X-Content-Type-Options': 'nosniff' },
    });
  }

  if (isSupportedImageType(mime)) {
    try {
      const thumbBuffer = await generateThumbnail(arrayBuffer, mime);
      if (thumbBuffer) {
        await r2.putObject(bucket, thumbKey, thumbBuffer, { contentType: 'image/webp' });
        const newEtag = `"thumb-${thumbBuffer.byteLength}"`;
        return new Response(thumbBuffer, {
          headers: { 'Content-Type': 'image/webp', 'Content-Length': String(thumbBuffer.byteLength), 'Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400', 'ETag': newEtag, 'X-Content-Type-Options': 'nosniff' },
        });
      }
    } catch (err) {
      console.error('Thumbnail generation failed, serving original:', err);
    }
  }

  // Fallback: serve original from buffer
  return new Response(arrayBuffer, {
    headers: { 'Content-Type': mime, 'Content-Length': String(arrayBuffer.byteLength), 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=86400', 'ETag': origEtag, 'X-Content-Type-Options': 'nosniff' },
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

// PUT /api/file (protected) — save/update file content
files.put('/file', authMiddleware, demoModeCheck, async (c) => {
  const path = c.req.query('path');
  if (!path) return c.json({ error: 'Path required' }, 400);

  const bucket = c.env.R2_BUCKET;
  const database = c.env.DB;

  // Read body as ArrayBuffer
  const arrayBuffer = await c.req.arrayBuffer();
  const mime = c.req.header('Content-Type') || getMimeType(path);

  await r2.putObject(bucket, path, arrayBuffer, { contentType: mime });

  await db.upsertFileMetadata(database, {
    path,
    size: arrayBuffer.byteLength,
    mime,
    mtime: Math.floor(Date.now() / 1000),
    created_at: new Date().toISOString(),
  });

  return c.json({ success: true, path, size: arrayBuffer.byteLength });
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

// POST /api/zip-download — download multiple files as ZIP (recursive for directories)
files.post('/zip-download', async (c) => {
  const { paths } = await c.req.json<{ paths: string[] }>();
  if (!paths?.length) return c.json({ error: 'No paths specified' }, 400);

  const bucket = c.env.R2_BUCKET;

  // Dynamic import JSZip
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  // Collect all files (recursive for directories)
  const allFiles: { key: string; zipPath: string }[] = [];

  for (const inputPath of paths) {
    // Check if it's a file
    const obj = await bucket.get(inputPath);
    if (obj) {
      allFiles.push({ key: inputPath, zipPath: inputPath.split('/').pop() || inputPath });
      continue;
    }

    // Check if it's a directory (list with prefix)
    const prefix = inputPath.endsWith('/') ? inputPath : inputPath + '/';
    let cursor: string | undefined;
    do {
      const listing = await bucket.list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) });
      for (const item of listing.objects) {
        if (item.key && !item.key.endsWith('/')) {
          // Preserve relative path structure
          const dirName = inputPath.split('/').pop() || inputPath;
          const relativePath = item.key.replace(prefix, '');
          allFiles.push({ key: item.key, zipPath: `${dirName}/${relativePath}` });
        }
      }
      cursor = listing.truncated ? listing.cursor : undefined;
    } while (cursor);
  }

  // Add each file to the ZIP
  for (const { key, zipPath } of allFiles) {
    try {
      const obj = await bucket.get(key);
      if (obj) {
        const arrayBuffer = await obj.arrayBuffer();
        zip.file(zipPath, arrayBuffer);
      }
    } catch (err) {
      console.error(`Failed to add ${key} to ZIP:`, err);
    }
  }

  const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' });

  return new Response(zipBuffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="download.zip"',
      'Content-Length': String(zipBuffer.byteLength),
    },
  });
});

// POST /api/zip-create (protected) — compress selected files into a ZIP in the current directory
files.post('/zip-create', authMiddleware, demoModeCheck, async (c) => {
  const { paths, dir } = await c.req.json<{ paths: string[]; dir?: string }>();
  if (!paths?.length) return c.json({ error: 'No paths specified' }, 400);

  const bucket = c.env.R2_BUCKET;
  const database = c.env.DB;
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  for (const inputPath of paths) {
    const obj = await bucket.get(inputPath);
    if (obj) {
      const name = inputPath.split('/').pop() || inputPath;
      const buf = await obj.arrayBuffer();
      zip.file(name, buf);
      continue;
    }
    const prefix = inputPath.endsWith('/') ? inputPath : inputPath + '/';
    let cursor: string | undefined;
    do {
      const listing = await bucket.list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) });
      for (const item of listing.objects) {
        if (item.key && !item.key.endsWith('/')) {
          const dirName = inputPath.split('/').pop() || inputPath;
          const relativePath = item.key.replace(prefix, '');
          const fileObj = await bucket.get(item.key);
          if (fileObj) zip.file(`${dirName}/${relativePath}`, await fileObj.arrayBuffer());
        }
      }
      cursor = listing.truncated ? listing.cursor : undefined;
    } while (cursor);
  }

  const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' });
  const zipName = `archive-${Date.now()}.zip`;
  const zipPath = dir ? `${dir}/${zipName}` : zipName;

  await r2.putObject(bucket, zipPath, zipBuffer, { contentType: 'application/zip' });
  await db.upsertFileMetadata(database, {
    path: zipPath, size: zipBuffer.byteLength, mime: 'application/zip',
    mtime: Math.floor(Date.now() / 1000), created_at: new Date().toISOString(),
  });

  return c.json({ success: true, path: zipPath });
});

// POST /api/unzip (protected) — extract ZIP file contents
files.post('/unzip', authMiddleware, demoModeCheck, async (c) => {
  const { path: zipPath, dir } = await c.req.json<{ path: string; dir?: string }>();
  if (!zipPath) return c.json({ error: 'Path required' }, 400);

  const bucket = c.env.R2_BUCKET;
  const database = c.env.DB;
  const JSZip = (await import('jszip')).default;

  const obj = await bucket.get(zipPath);
  if (!obj) return c.json({ error: 'File not found' }, 404);

  const arrayBuffer = await obj.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const extractDir = dir || zipPath.replace(/\.zip$/i, '').split('/').pop() || 'extracted';
  const results: string[] = [];

  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const content = await entry.async('arraybuffer');
    const targetPath = `${extractDir}/${name}`;
    await r2.putObject(bucket, targetPath, content, { contentType: getMimeType(name) });
    await db.upsertFileMetadata(database, {
      path: targetPath, size: content.byteLength, mime: getMimeType(name),
      mtime: Math.floor(Date.now() / 1000), created_at: new Date().toISOString(),
    });
    results.push(targetPath);
  }

  return c.json({ success: true, extracted: results.length, dir: extractDir });
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
  const file = formData.get('file') as unknown as File;
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

  await r2.putObject(bucket, path + '/', '', { contentType: 'directory' });
  await db.upsertFileMetadata(database, {
    path, size: 0, mime: 'directory',
    mtime: Math.floor(Date.now() / 1000), created_at: new Date().toISOString(),
  });

  try { await db.logActivity(database, 'mkdir', path, c.get('userId')); } catch {}
  return c.json({ success: true });
});

// POST /api/delete (protected) — soft delete to trash (ZPan pattern)
files.post('/delete', authMiddleware, demoModeCheck, async (c) => {
  const { items } = await c.req.json<{ items: string[] }>();
  if (!items?.length) return c.json({ error: 'No items specified' }, 400);

  const bucket = c.env.R2_BUCKET;
  const database = c.env.DB;
  const user = c.get('userId');

  for (const item of items) {
    // Check if it's a file
    const directObj = await r2.getObject(bucket, item);
    if (directObj) {
      // Soft delete: add to trash, remove metadata (keep R2 object)
      await db.addToTrash(database, {
        original_path: item,
        name: item.split('/').pop() || item,
        mime: (directObj as any).httpMetadata?.contentType || 'application/octet-stream',
        size: directObj.size,
        is_dir: false,
        deleted_by: user,
      });
      await db.deleteFileMetadata(database, item);
      try { await db.logActivity(database, 'delete', item, user); } catch {}
      continue;
    }

    // It's a directory — soft delete all children
    const listResult = await r2.listObjects(bucket, item.endsWith('/') ? item : item + '/');
    const allKeys = listResult.files.map(f => f.key).filter(Boolean) as string[];

    // Add directory to trash
    await db.addToTrash(database, {
      original_path: item,
      name: item.split('/').pop() || item,
      mime: 'directory',
      size: 0,
      is_dir: true,
      deleted_by: user,
    });

    // Add each child file to trash (R2 objects stay in place)
    for (const key of allKeys) {
      if (key.endsWith('/')) continue;
      const childObj = await r2.getObject(bucket, key);
      if (childObj) {
        await db.addToTrash(database, {
          original_path: key,
          name: key.split('/').pop() || key,
          mime: (childObj as any).httpMetadata?.contentType || 'application/octet-stream',
          size: childObj.size,
          is_dir: false,
          deleted_by: user,
        });
      }
    }

    // Remove metadata (but keep R2 objects for restore)
    await db.deleteFileMetadata(database, item);
    await db.deleteFileMetadataByPrefix(database, item + '/');
    try { await db.logActivity(database, 'delete', item, user); } catch {}
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
    await r2.moveObject(bucket, from, destPath);

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
      await r2.moveObject(bucket, oldThumbKey, newThumbKey);
    }

    try { await db.logActivity(database, 'move', from, c.get('userId'), destPath); } catch {}
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
      await r2.moveObject(bucket, key, newKey);
    }
  }

  // Copy directory marker
  await r2.moveObject(bucket, from + '/', destDir + '/');

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

  try { await db.logActivity(database, 'move', from, c.get('userId'), destDir); } catch {}
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
      await r2.moveObject(bucket, key, newKey);
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

    try { await db.logActivity(database, 'rename', oldPath, c.get('userId'), newPath); } catch {}
    return c.json({ success: true, newPath });
  }

  // Rename single file
  await r2.moveObject(bucket, oldPath, newPath);
  await db.deleteFileMetadata(database, oldPath);
  await db.upsertFileMetadata(database, {
    path: newPath,
    size: srcObj.size,
    mime: srcObj.httpMetadata?.contentType || getMimeType(newName),
    mtime: Math.floor(Date.now() / 1000),
    created_at: new Date().toISOString(),
  });

  try { await db.logActivity(database, 'rename', oldPath, c.get('userId'), newPath); } catch {}
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

      // Move to new key, delete old key
      await r2.moveObject(bucket, oldPath, newPath);

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
        await r2.moveObject(bucket, oldThumbKey, newThumbKey);
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

export default files;
