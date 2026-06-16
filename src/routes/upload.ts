import { Hono } from 'hono';
import type { AppBindings, Variables } from '../types';
import * as r2 from '../services/r2';
import * as db from '../services/db';
import { authMiddleware } from '../auth';
import { generateThumbnail, getThumbKey, isSupportedImageType } from '../services/thumbnail';

const upload = new Hono<{ Bindings: AppBindings; Variables: Variables }>();

// Demo mode check
const demoModeCheck = async (c: any, next: any) => {
  if (c.env.DEMO_MODE === 'true') {
    return c.json({ error: '上传在演示模式下被禁用' }, 403);
  }
  await next();
};

// POST /api/upload (protected)
upload.post('/upload', authMiddleware, demoModeCheck, async (c) => {
  const bucket = c.env.R2_BUCKET;
  const database = c.env.DB;

  const formData = await c.req.formData();
  const dir = (formData.get('dir') as string) || '';
  const files = formData.getAll('file').filter((f): f is File => f instanceof File);

  if (!files.length) {
    return c.json({ error: 'No files uploaded' }, 400);
  }

  const uploaded: { name: string; path: string; size: number; thumbGenerated?: boolean }[] = [];

  for (const file of files) {
    const relativePath = formData.get('relativePath') as string | null;
    let filePath: string;

    if (relativePath) {
      filePath = dir ? `${dir}/${relativePath}` : relativePath;
    } else {
      filePath = dir ? `${dir}/${file.name}` : file.name;
    }

    const arrayBuffer = await file.arrayBuffer();
    const mime = file.type || 'application/octet-stream';

    await r2.putObject(bucket, filePath, arrayBuffer, { contentType: mime });

    await db.upsertFileMetadata(database, {
      path: filePath,
      size: arrayBuffer.byteLength,
      mime,
      mtime: Math.floor(Date.now() / 1000),
      created_at: new Date().toISOString(),
    });

    // Generate thumbnail for supported image types
    let thumbGenerated = false;
    if (isSupportedImageType(mime)) {
      try {
        const thumbBuffer = await generateThumbnail(arrayBuffer, mime);
        if (thumbBuffer) {
          const thumbKey = getThumbKey(filePath);
          await r2.putObject(bucket, thumbKey, thumbBuffer, { contentType: 'image/webp' });
          thumbGenerated = true;
        }
      } catch (err) {
        console.error(`Thumbnail generation failed for ${filePath}:`, err);
        // Don't fail the upload if thumbnail generation fails
      }
    }

    uploaded.push({
      name: file.name,
      path: filePath,
      size: arrayBuffer.byteLength,
      thumbGenerated,
    });
  }

  return c.json({ success: true, uploaded });
});

export default upload;
