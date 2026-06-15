import { Hono } from 'hono';
import type { AppBindings, Variables } from '../types';
import * as r2 from '../services/r2';
import * as db from '../services/db';
import { authMiddleware } from '../auth';

const upload = new Hono<{ Bindings: AppBindings; Variables: Variables }>();

upload.use('*', authMiddleware);

// POST /api/upload
upload.post('/upload', async (c) => {
  const bucket = c.env.R2_BUCKET;
  const database = c.env.DB;

  const formData = await c.req.formData();
  const dir = (formData.get('dir') as string) || '';
  const files = formData.getAll('file').filter((f): f is File => f instanceof File);

  if (!files.length) {
    return c.json({ error: 'No files uploaded' }, 400);
  }

  const uploaded: { name: string; path: string; size: number }[] = [];

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

    uploaded.push({
      name: file.name,
      path: filePath,
      size: arrayBuffer.byteLength,
    });
  }

  return c.json({ success: true, uploaded });
});

export default upload;
