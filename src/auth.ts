import type { Context, Next } from 'hono';
import type { AppBindings, Variables, User } from './types';

// Base64url encode/decode
function base64url(data: Uint8Array | string): string {
  const str = typeof data === 'string' ? data : String.fromCharCode(...data);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str: string): Uint8Array {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const binary = atob(str);
  return new Uint8Array([...binary].map(c => c.charCodeAt(0)));
}

async function hmacSign(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return base64url(new Uint8Array(sig));
}

async function hmacVerify(secret: string, data: string, signature: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  return crypto.subtle.verify('HMAC', key, base64urlDecode(signature), new TextEncoder().encode(data));
}

async function hashPassword(password: string, salt?: string): Promise<string> {
  const saltBytes = salt ? base64urlDecode(salt) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  const hashB64 = base64url(new Uint8Array(hash));
  const saltB64 = base64url(saltBytes);
  return `${saltB64}:${hashB64}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':');
  const computed = await hashPassword(password, salt);
  return computed === stored;
}

interface JWTPayload {
  sub: number;
  role: string;
  username: string;
  exp: number;
  iat: number;
}

export async function createToken(secret: string, payload: Omit<JWTPayload, 'exp' | 'iat'>, expiresIn = 86400): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JWTPayload = { ...payload, iat: now, exp: now + expiresIn };
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(fullPayload));
  const signature = await hmacSign(secret, `${header}.${body}`);
  return `${header}.${body}.${signature}`;
}

async function verifyToken(secret: string, token: string): Promise<JWTPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  if (!(await hmacVerify(secret, `${header}.${body}`, signature))) return null;
  try {
    const payload: JWTPayload = JSON.parse(new TextDecoder().decode(base64urlDecode(body)));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function loginHandler(c: Context<{ Bindings: AppBindings; Variables: Variables }>) {
  const { username, password } = await c.req.json<{ username: string; password: string }>();
  if (!username || !password) {
    return c.json({ error: 'Username and password required' }, 400);
  }

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first<User>();
  if (!user) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  if (!(await verifyPassword(password, user.password_hash))) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const token = await createToken(c.env.JWT_SECRET, {
    sub: user.id,
    role: user.role,
    username: user.username,
  });

  return c.json({
    token,
    user: { id: user.id, username: user.username, role: user.role },
  });
}

export async function authMiddleware(c: Context<{ Bindings: AppBindings; Variables: Variables }>, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const token = authHeader.slice(7);
  const payload = await verifyToken(c.env.JWT_SECRET, token);
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
  c.set('userId', payload.sub);
  c.set('userRole', payload.role);
  c.set('username', payload.username);
  await next();
}

export async function ensureAdmin(c: Context<{ Bindings: AppBindings; Variables: Variables }>, next: Next) {
  const role = c.get('userRole');
  if (role !== 'admin') {
    return c.json({ error: 'Admin access required' }, 403);
  }
  await next();
}

export { hashPassword, verifyPassword };
