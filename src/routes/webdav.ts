/**
 * Basic WebDAV server — supports mounting from Finder/Explorer.
 * Implements: GET, PUT, DELETE, MKCOL, PROPFIND, MOVE, COPY
 * Inspired by ZPan's WebDAV implementation.
 */
import { Hono } from 'hono';
import type { AppBindings, Variables } from '../types';
import * as r2 from '../services/r2';
import * as db from '../services/db';
import { getMimeType } from '../utils/mime';

const webdav = new Hono<{ Bindings: AppBindings; Variables: Variables }>();

/** Parse Basic Auth from header */
function parseBasicAuth(authHeader: string | undefined): { username: string; password: string } | null {
  if (!authHeader?.startsWith('Basic ')) return null;
  try {
    const decoded = atob(authHeader.slice(6));
    const [username, password] = decoded.split(':');
    return { username, password };
  } catch { return null; }
}

/** WebDAV auth middleware */
const webdavAuth = async (c: any, next: any) => {
  const creds = parseBasicAuth(c.req.header('Authorization'));
  if (!creds) {
    c.header('WWW-Authenticate', 'Basic realm="R2 Gallery WebDAV"');
    return c.text('Unauthorized', 401);
  }
  // Verify credentials via login API
  try {
    const { verifyPassword } = await import('../auth');
    const user = await db.getUserByUsername(c.env.DB, creds.username);
    if (!user || !(await verifyPassword(creds.password, user.password_hash))) {
      c.header('WWW-Authenticate', 'Basic realm="R2 Gallery WebDAV"');
      return c.text('Unauthorized', 401);
    }
    c.set('userId', user.id);
  } catch {
    c.header('WWW-Authenticate', 'Basic realm="R2 Gallery WebDAV"');
    return c.text('Unauthorized', 401);
  }
  await next();
};

/** Extract path from URL (remove /webdav prefix) */
function getPath(c: any): string {
  const url = new URL(c.req.url);
  let path = decodeURIComponent(url.pathname);
  if (path.startsWith('/webdav')) path = path.slice(7);
  return path.replace(/^\/+/, '');
}

/** XML escape */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Build PROPFIND XML response for a single resource */
function propResponse(href: string, isDir: boolean, size: number, mtime: string): string {
  const now = new Date().toUTCString();
  return `<D:response>
  <D:href>${esc(href)}</D:href>
  <D:propstat>
    <D:prop>
      <D:resourcetype>${isDir ? '<D:collection/>' : ''}</D:resourcetype>
      <D:getcontentlength>${size}</D:getcontentlength>
      <D:getlastmodified>${mtime || now}</D:getlastmodified>
      <D:creationdate>${mtime || now}</D:creationdate>
      ${!isDir ? `<D:getcontenttype>${getMimeType(href)}</D:getcontenttype>` : ''}
    </D:prop>
    <D:status>HTTP/1.1 200 OK</D:status>
  </D:propstat>
</D:response>`;
}

// OPTIONS — WebDAV capabilities
webdav.options('/webdav/*', (c) => {
  c.header('DAV', '1, 2');
  c.header('Allow', 'OPTIONS, GET, HEAD, PUT, DELETE, MKCOL, PROPFIND, MOVE, COPY');
  c.header('MS-Author-Via', 'DAV');
  return c.text('', 200);
});

// PROPFIND — list directory or get file properties
webdav.on('PROPFIND', '/webdav/*', webdavAuth, async (c) => {
  const path = getPath(c);
  const bucket = c.env.R2_BUCKET;
  const database = c.env.DB;
  const depth = c.req.header('Depth') || 'infinity';
  const host = c.req.header('Host') || 'localhost';
  const scheme = c.req.header('X-Forwarded-Proto') || 'https';
  const base = `${scheme}://${host}/webdav`;

  // Root directory
  if (!path) {
    const dirs = await db.listFileMetadata(database, '');
    const responses: string[] = [propResponse(`${base}/`, true, 0, '')];
    for (const d of dirs) {
      const href = `${base}/${encodeURIComponent(d.path)}`;
      responses.push(propResponse(href, d.mime === 'directory', d.size, d.created_at));
    }
    return c.text(
      `<?xml version="1.0" encoding="utf-8"?><D:multistatus xmlns:D="DAV:">${responses.join('')}</D:multistatus>`,
      207, { 'Content-Type': 'application/xml' }
    );
  }

  // Check if it's a directory
  const dirMeta = await db.getFileMetadata(database, path);
  if (dirMeta?.mime === 'directory' || depth === '1') {
    const children = await db.listFileMetadata(database, path);
    const responses: string[] = [propResponse(`${base}/${encodeURIComponent(path)}/`, true, 0, '')];
    for (const child of children) {
      const href = `${base}/${encodeURIComponent(child.path)}`;
      responses.push(propResponse(href, child.mime === 'directory', child.size, child.created_at));
    }
    return c.text(
      `<?xml version="1.0" encoding="utf-8"?><D:multistatus xmlns:D="DAV:">${responses.join('')}</D:multistatus>`,
      207, { 'Content-Type': 'application/xml' }
    );
  }

  // Single file
  const obj = await r2.getObject(bucket, path);
  if (!obj) return c.text('Not Found', 404);
  return c.text(
    `<?xml version="1.0" encoding="utf-8"?><D:multistatus xmlns:D="DAV:">${propResponse(`${base}/${encodeURIComponent(path)}`, false, obj.size, '')}</D:multistatus>`,
    207, { 'Content-Type': 'application/xml' }
  );
});

// GET — download file
webdav.get('/webdav/*', webdavAuth, async (c) => {
  const path = getPath(c);
  if (!path) return c.text('OK', 200);

  const bucket = c.env.R2_BUCKET;
  const obj = await r2.getObject(bucket, path);
  if (!obj) return c.text('Not Found', 404);

  // Range support
  const rangeHeader = c.req.header('Range');
  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (match) {
      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : Math.min(start + 1024 * 1024 - 1, obj.size - 1);
      const rangeObj = await bucket.get(path, { range: { offset: start, length: end - start + 1 } });
      if (!rangeObj) return c.text('Range Not Satisfiable', 416);
      return new Response((rangeObj as any).body, {
        status: 206,
        headers: {
          'Content-Type': getMimeType(path),
          'Content-Range': `bytes ${start}-${end}/${obj.size}`,
          'Content-Length': String(end - start + 1),
        },
      });
    }
  }

  return new Response((obj as any).body, {
    headers: {
      'Content-Type': getMimeType(path),
      'Content-Length': String(obj.size),
    },
  });
});

// PUT — upload file
webdav.put('/webdav/*', webdavAuth, async (c) => {
  const path = getPath(c);
  if (!path) return c.text('Bad Request', 400);

  const bucket = c.env.R2_BUCKET;
  const database = c.env.DB;
  const body = await c.req.arrayBuffer();
  const mime = c.req.header('Content-Type') || getMimeType(path);

  await r2.putObject(bucket, path, body, { contentType: mime });
  await db.upsertFileMetadata(database, {
    path, size: body.byteLength, mime,
    mtime: Math.floor(Date.now() / 1000), created_at: new Date().toISOString(),
  });

  return c.text('Created', 201);
});

// DELETE — delete file
webdav.delete('/webdav/*', webdavAuth, async (c) => {
  const path = getPath(c);
  if (!path) return c.text('Bad Request', 400);

  const bucket = c.env.R2_BUCKET;
  const database = c.env.DB;

  // Soft delete to trash
  const obj = await r2.getObject(bucket, path);
  if (obj) {
    await db.addToTrash(database, {
      original_path: path, name: path.split('/').pop() || path,
      mime: getMimeType(path), size: obj.size, is_dir: false, deleted_by: String(c.get('userId')),
    });
    await db.deleteFileMetadata(database, path);
  }

  return c.body(null, 204);
});

// MKCOL — create directory
webdav.on('MKCOL', '/webdav/*', webdavAuth, async (c) => {
  const path = getPath(c);
  if (!path) return c.text('Bad Request', 400);

  const bucket = c.env.R2_BUCKET;
  const database = c.env.DB;

  await r2.putObject(bucket, path + '/', '', { contentType: 'directory' });
  await db.upsertFileMetadata(database, {
    path, size: 0, mime: 'directory',
    mtime: Math.floor(Date.now() / 1000), created_at: new Date().toISOString(),
  });

  return c.text('Created', 201);
});

// MOVE — move/rename file
webdav.on('MOVE', '/webdav/*', webdavAuth, async (c) => {
  const srcPath = getPath(c);
  const destHeader = c.req.header('Destination');
  if (!srcPath || !destHeader) return c.text('Bad Request', 400);

  const destUrl = new URL(destHeader);
  let destPath = decodeURIComponent(destUrl.pathname);
  if (destPath.startsWith('/webdav')) destPath = destPath.slice(7);
  destPath = destPath.replace(/^\/+/, '');

  const bucket = c.env.R2_BUCKET;
  const database = c.env.DB;

  await r2.moveObject(bucket, srcPath, destPath);
  await db.deleteFileMetadata(database, srcPath);
  await db.upsertFileMetadata(database, {
    path: destPath, size: 0, mime: getMimeType(destPath),
    mtime: Math.floor(Date.now() / 1000), created_at: new Date().toISOString(),
  });

  return c.text('Created', 201);
});

export default webdav;
