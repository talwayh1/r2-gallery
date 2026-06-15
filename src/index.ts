import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppBindings, Variables } from './types';
import { loginHandler, hashPassword } from './auth';
import * as db from './services/db';
import filesRouter from './routes/files';
import uploadRouter from './routes/upload';
import adminRouter from './routes/admin';

const app = new Hono<{ Bindings: AppBindings; Variables: Variables }>();

// Global error handler
app.onError((err, c) => {
  console.error('Worker error:', err);
  return c.json({ error: err.message, stack: err.stack }, 500);
});

// CORS
app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Initialize DB on first request
let dbInitialized = false;
app.use('*', async (c, next) => {
  if (!dbInitialized) {
    await db.initDatabase(c.env.DB);

    // Create default admin if no users exist
    const users = await db.listUsers(c.env.DB);
    if (users.length === 0) {
      const defaultPassword = c.env.ADMIN_PASSWORD || 'admin';
      const hash = await hashPassword(defaultPassword);
      await db.createUser(c.env.DB, 'admin', hash, 'admin');
    }

    dbInitialized = true;
  }
  await next();
});

// === Public endpoints (no auth) ===

// Health check
app.get('/api/health', (c) => c.json({ status: 'ok' }));

// Ping — check auth status
app.get('/api/ping', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ authenticated: false });
  }
  try {
    const token = authHeader.slice(7);
    const parts = token.split('.');
    if (parts.length !== 3) return c.json({ authenticated: false });
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp < Math.floor(Date.now() / 1000)) return c.json({ authenticated: false });
    return c.json({ authenticated: true, username: payload.username, role: payload.role });
  } catch {
    return c.json({ authenticated: false });
  }
});

// Login
app.post('/api/login', loginHandler);

// === Protected routes ===
app.route('/api', filesRouter);
app.route('/api', uploadRouter);
app.route('/api', adminRouter);

// === Static frontend (SPA) ===
app.get('*', async (c) => {
  // @ts-ignore — Cloudflare Workers static assets binding
  const ASSETS = (globalThis as any).__STATIC_CONTENT;
  if (ASSETS) {
    const url = new URL(c.req.url);
    let path = url.pathname;
    if (path === '/') path = '/index.html';

    // @ts-ignore
    const manifest: string | Record<string, string> | undefined = (globalThis as any).__STATIC_CONTENT_MANIFEST;
    if (manifest) {
      const parsedManifest = typeof manifest === 'string' ? JSON.parse(manifest) : manifest;
      const entry = parsedManifest[path] || parsedManifest[path + '/index.html'];
      if (entry) {
        const asset = ASSETS.get(entry);
        if (asset) {
          const contentType = getContentType(path);
          return new Response(asset, {
            headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=3600' },
          });
        }
      }
    }

    // SPA fallback
    const indexEntry = manifest ? (typeof manifest === 'string' ? JSON.parse(manifest) : manifest)['/index.html'] : null;
    if (indexEntry) {
      const asset = ASSETS.get(indexEntry);
      if (asset) {
        return new Response(asset, {
          headers: { 'Content-Type': 'text/html' },
        });
      }
    }
  }

  return c.html(getFallbackHTML());
});

function getContentType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const types: Record<string, string> = {
    html: 'text/html', css: 'text/css', js: 'application/javascript',
    json: 'application/json', png: 'image/png', jpg: 'image/jpeg',
    gif: 'image/gif', svg: 'image/svg+xml', ico: 'image/x-icon',
    woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf',
  };
  return types[ext] || 'application/octet-stream';
}

function getFallbackHTML(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>R2 Gallery</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #0f172a; color: #e2e8f0; }
    .container { text-align: center; }
    h1 { font-size: 2rem; margin-bottom: 1rem; }
    p { color: #94a3b8; }
  </style>
</head>
<body>
  <div class="container">
    <h1>R2 Gallery</h1>
    <p>前端未构建。运行 <code>cd web && npm run build</code> 然后重新部署。</p>
  </div>
</body>
</html>`;
}

export default app;
