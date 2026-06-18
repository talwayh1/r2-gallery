/**
 * Presigned URL upload — browser uploads directly to R2, bypassing Worker bandwidth.
 * Inspired by ZPan's presigned upload architecture.
 *
 * Flow:
 * 1. Client requests presigned URL via POST /api/presign
 * 2. Server generates S3 presigned PUT URL
 * 3. Client uploads directly to R2 via PUT
 * 4. Client confirms via POST /api/presign/confirm
 */
import { Hono } from 'hono';
import type { AppBindings, Variables } from '../types';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as db from '../services/db';
import { authMiddleware } from '../auth';
import { getMimeType } from '../utils/mime';
import { nanoid } from '../utils/nanoid';

const presign = new Hono<{ Bindings: AppBindings; Variables: Variables }>();

/** Build S3 client from R2 credentials */
function getS3Client(c: any): S3Client | null {
  const accountId = c.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = c.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = c.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) return null;

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

// POST /api/presign — get a presigned upload URL
presign.post('/presign', authMiddleware, async (c) => {
  const { path, size, mime } = await c.req.json<{ path: string; size: number; mime?: string }>();
  if (!path) return c.json({ error: 'Path required' }, 400);

  const s3 = getS3Client(c);
  if (!s3) return c.json({ error: 'Presign not configured (missing R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY)' }, 501);

  const bucket = c.env.R2_BUCKET_NAME || 'r2-gallery';
  const contentType = mime || getMimeType(path);
  const draftId = nanoid(16);

  // Store draft in DB
  await db.createDraft(c.env.DB, draftId, path, size || 0, contentType, c.get('userId'));

  // Generate presigned PUT URL (valid for 1 hour)
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: path,
    ContentType: contentType,
    ContentLength: size,
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

  return c.json({ draftId, uploadUrl, path, contentType });
});

// POST /api/presign/confirm — confirm upload completed
presign.post('/presign/confirm', authMiddleware, async (c) => {
  const { draftId } = await c.req.json<{ draftId: string }>();
  if (!draftId) return c.json({ error: 'draftId required' }, 400);

  const database = c.env.DB;
  const draft = await db.getDraft(database, draftId);
  if (!draft) return c.json({ error: 'Draft not found' }, 404);

  // Confirm the draft
  await db.confirmDraft(database, draftId);

  // Upsert file metadata
  await db.upsertFileMetadata(database, {
    path: draft.path,
    size: draft.size,
    mime: draft.mime,
    mtime: Math.floor(Date.now() / 1000),
    created_at: new Date().toISOString(),
  });

  // Log activity
  try { await db.logActivity(database, 'upload', draft.path, c.get('userId')); } catch {}

  return c.json({ success: true, path: draft.path });
});

// POST /api/presign/cancel — cancel a draft
presign.post('/presign/cancel', authMiddleware, async (c) => {
  const { draftId } = await c.req.json<{ draftId: string }>();
  if (!draftId) return c.json({ error: 'draftId required' }, 400);
  await db.cancelDraft(c.env.DB, draftId);
  return c.json({ success: true });
});

export default presign;
