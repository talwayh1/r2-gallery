import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppBindings, Variables } from './types';
import { loginHandler, hashPassword, telegramLoginHandler } from './auth';
import * as db from './services/db';
import filesRouter from './routes/files';
import uploadRouter from './routes/upload';
import adminRouter from './routes/admin';
import metadataRouter from './routes/metadata';
import sharesRouter from './routes/shares';

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

// Public config (for frontend)
app.get('/api/config', (c) => {
  return c.json({
    telegramBotUsername: c.env.TELEGRAM_BOT_USERNAME || null,
  });
});

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

// Telegram Login
app.post('/api/auth/telegram', telegramLoginHandler);

// === Public metadata endpoints ===
app.route('/api', metadataRouter);

// === Protected routes ===
app.route('/api', filesRouter);
app.route('/api', uploadRouter);

// === Public share routes (BEFORE admin which has global auth) ===
app.get('/api/share/:id', async (c) => {
  const id = c.req.param('id');
  const share = await c.env.DB.prepare(
    'SELECT id, path, password_hash, expires_at, created_at FROM shares WHERE id = ?'
  ).bind(id).first<any>();
  if (!share) return c.json({ error: 'Share not found' }, 404);
  if (share.expires_at && share.expires_at < Math.floor(Date.now() / 1000)) {
    return c.json({ error: 'Share link has expired' }, 410);
  }
  return c.json({ id: share.id, path: share.path, needsPassword: !!share.password_hash, expiresAt: share.expires_at });
});

app.get('/api/share/:id/file', async (c) => {
  const id = c.req.param('id');
  const password = c.req.query('password');
  const share = await c.env.DB.prepare('SELECT * FROM shares WHERE id = ?').bind(id).first<any>();
  if (!share) return c.json({ error: 'Share not found' }, 404);
  if (share.expires_at && share.expires_at < Math.floor(Date.now() / 1000)) return c.json({ error: 'Expired' }, 410);
  if (share.password_hash) {
    if (!password) return c.json({ error: 'Password required' }, 401);
    const { verifyPassword } = await import('./auth');
    if (!(await verifyPassword(password, share.password_hash))) return c.json({ error: 'Invalid password' }, 401);
  }
  const bucket = c.env.R2_BUCKET;
  const obj = await bucket.get(share.path);
  if (!obj) return c.json({ error: 'File not found' }, 404);
  const mime = (obj as any).httpMetadata?.contentType || 'application/octet-stream';
  return new Response((obj as any).body, { headers: { 'Content-Type': mime, 'Content-Length': String(obj.size) } });
});

app.post('/api/share/:id/verify', async (c) => {
  const id = c.req.param('id');
  const { password } = await c.req.json<{ password?: string }>();
  const share = await c.env.DB.prepare('SELECT * FROM shares WHERE id = ?').bind(id).first<any>();
  if (!share) return c.json({ error: 'Share not found' }, 404);
  if (share.expires_at && share.expires_at < Math.floor(Date.now() / 1000)) return c.json({ error: 'Expired' }, 410);
  if (share.password_hash) {
    if (!password) return c.json({ error: 'Password required' }, 401);
    const { verifyPassword } = await import('./auth');
    if (!(await verifyPassword(password, share.password_hash))) return c.json({ error: 'Invalid password' }, 401);
  }
  return c.json({ success: true, path: share.path });
});

// Protected share management
app.route('/api', sharesRouter);
app.route('/api', adminRouter);

// === OG (Open Graph) support for social sharing ===

/** Detect social media bots/crawlers by User-Agent */
function isBot(userAgent: string): boolean {
  return /bot|crawler|spider|facebookexternalhit|Twitterbot|Slackbot|TelegramBot|WhatsApp|LinkedInBot|Pinterest|SkypeUriPreview|Googlebot|bingbot|Applebot|Baiduspider|YandexBot|Sogou|DuckDuckBot|Discordbot|redditbot|Embedly|Quora|showyoubot|outbrain|pinterest|slack|vkShare|W3C_Validator|whatsapp|flipboard|tumblr|bitly|skype|microsoft|teams/i.test(userAgent);
}

/** HTML-escape a string for safe embedding in meta tags */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Get MIME type for OG image:type meta tag (images only) */
function getOGImageMime(filename: string): string | null {
  const ext = filename.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    bmp: 'image/bmp', ico: 'image/x-icon',
  };
  return map[ext || ''] || null;
}

/** Serve SSR HTML with OG meta tags for bots, SPA for users */
function serveSPA(c: any): Response | null {
  // @ts-ignore — Cloudflare Workers static assets binding
  const ASSETS = (globalThis as any).__STATIC_CONTENT;
  if (ASSETS) {
    // @ts-ignore
    const manifest: string | Record<string, string> | undefined = (globalThis as any).__STATIC_CONTENT_MANIFEST;
    if (manifest) {
      const parsedManifest = typeof manifest === 'string' ? JSON.parse(manifest) : manifest;
      const indexEntry = parsedManifest['/index.html'];
      if (indexEntry) {
        const asset = ASSETS.get(indexEntry);
        if (asset) {
          return new Response(asset, {
            headers: { 'Content-Type': 'text/html', 'Cache-Control': 'public, max-age=3600' },
          });
        }
      }
    }
  }
  return null;
}

// /view/* — Social sharing URLs with OG tags for bots
app.get('/view/*', async (c) => {
  const userAgent = c.req.header('User-Agent') || '';
  const filePath = decodeURIComponent(c.req.path.slice(6)); // Remove '/view/'

  if (isBot(userAgent) && filePath) {
    const host = c.req.header('Host') || 'tu.zhangyubi.cn';
    const scheme = c.req.header('X-Forwarded-Proto') || 'https';
    const base = `${scheme}://${host}`;
    const imageUrl = `${base}/api/file?path=${encodeURIComponent(filePath)}`;
    const pageUrl = `${base}/view/${encodeURIComponent(filePath)}`;
    const fileName = filePath.split('/').pop() || filePath;
    const ogMime = getOGImageMime(fileName);

    return c.html(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(fileName)} — R2 Gallery</title>
  <meta property="og:title" content="${esc(fileName)}">
  <meta property="og:description" content="查看图片 — R2 Gallery">
  <meta property="og:image" content="${esc(imageUrl)}">
  ${ogMime ? `<meta property="og:image:type" content="${esc(ogMime)}">` : ''}
  <meta property="og:url" content="${esc(pageUrl)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="R2 Gallery">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(fileName)} — R2 Gallery">
  <meta name="twitter:image" content="${esc(imageUrl)}">
  <meta name="theme-color" content="#0f172a">
</head>
<body style="background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
  <div style="text-align:center;max-width:90vw">
    <h1 style="font-size:1.5rem;margin-bottom:1rem">${esc(fileName)}</h1>
    <img src="${esc(imageUrl)}" alt="${esc(fileName)}" style="max-width:90vw;max-height:75vh;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.4)">
    <p style="margin-top:1rem"><a href="${esc(pageUrl)}" style="color:#60a5fa;text-decoration:none">在 R2 Gallery 中查看 →</a></p>
  </div>
</body>
</html>`, 200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    });
  }

  // Non-bot users: serve the SPA
  const spaResponse = serveSPA(c);
  if (spaResponse) return spaResponse;
  return c.html(getFallbackHTML());
});

// === Static frontend (SPA fallback) ===
app.get('*', async (c) => {
  const spaResponse = serveSPA(c);
  if (spaResponse) return spaResponse;
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
