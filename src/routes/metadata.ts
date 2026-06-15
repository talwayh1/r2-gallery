import { Hono } from 'hono';
import type { AppBindings, Variables } from '../types';
import * as r2 from '../services/r2';

const metadata = new Hono<{ Bindings: AppBindings; Variables: Variables }>();

/** Read entire R2 body into Uint8Array */
async function readBody(body: ReadableStream): Promise<Uint8Array> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalLen = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLen += value.length;
  }
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

// Fields we extract from EXIF
interface ExifData {
  camera?: string;
  lens?: string;
  focalLength?: string;
  aperture?: string;
  shutterSpeed?: string;
  iso?: number;
  dateTaken?: string;
  width?: number;
  height?: number;
  gps?: { lat: number; lng: number };
  software?: string;
  orientation?: number;
}

// GET /api/exif?path=photos/image.jpg
metadata.get('/exif', async (c) => {
  const path = c.req.query('path');
  if (!path) return c.json({ error: 'Path required' }, 400);

  // Only extract EXIF from image files
  const ext = path.split('.').pop()?.toLowerCase();
  const supportedExts = ['jpg', 'jpeg', 'tiff', 'tif', 'heic', 'heif', 'webp', 'png'];
  if (!ext || !supportedExts.includes(ext)) {
    return c.json({ exif: null, message: 'Not an image file' });
  }

  const bucket = c.env.R2_BUCKET;
  const obj = await r2.getObject(bucket, path);
  if (!obj) return c.json({ error: 'File not found' }, 404);

  try {
    // Read body as Uint8Array (Workers-compatible)
    const body = (obj as any).body as ReadableStream;
    const bytes = await readBody(body);

    // Dynamic import exifr
    const exifr = await import('exifr');

    const raw = await exifr.parse(bytes, {
      pick: [
        'Make', 'Model', 'LensModel', 'LensMake',
        'FocalLength', 'FNumber', 'ExposureTime', 'ISO',
        'DateTimeOriginal', 'CreateDate',
        'ImageWidth', 'ImageHeight', 'ExifImageWidth', 'ExifImageHeight',
        'GPSLatitude', 'GPSLongitude',
        'Software', 'Orientation',
      ],
      translateValues: true,
      reviveValues: true,
    });

    if (!raw) {
      return c.json({ exif: null, message: 'No EXIF data found' });
    }

    // Build clean response
    const exif: ExifData = {};

    // Camera
    if (raw.Make || raw.Model) {
      const make = String(raw.Make || '');
      const model = String(raw.Model || '');
      if (model.toLowerCase().includes(make.toLowerCase())) {
        exif.camera = model;
      } else {
        exif.camera = `${make} ${model}`.trim();
      }
    }

    // Lens
    if (raw.LensModel) {
      exif.lens = String(raw.LensModel);
    } else if (raw.LensMake) {
      exif.lens = String(raw.LensMake);
    }

    // Focal length
    if (raw.FocalLength != null) {
      const fl = typeof raw.FocalLength === 'number' ? raw.FocalLength : parseFloat(String(raw.FocalLength));
      if (!isNaN(fl)) exif.focalLength = `${fl}mm`;
    }

    // Aperture
    if (raw.FNumber != null) {
      const f = typeof raw.FNumber === 'number' ? raw.FNumber : parseFloat(String(raw.FNumber));
      if (!isNaN(f)) exif.aperture = `f/${f}`;
    }

    // Shutter speed
    if (raw.ExposureTime != null) {
      const et = typeof raw.ExposureTime === 'number' ? raw.ExposureTime : parseFloat(String(raw.ExposureTime));
      if (!isNaN(et)) {
        if (et >= 1) {
          exif.shutterSpeed = `${et}s`;
        } else {
          const denom = Math.round(1 / et);
          exif.shutterSpeed = `1/${denom}s`;
        }
      }
    }

    // ISO
    if (raw.ISO != null) {
      exif.iso = typeof raw.ISO === 'number' ? raw.ISO : parseInt(String(raw.ISO));
    }

    // Date taken
    if (raw.DateTimeOriginal) {
      exif.dateTaken = raw.DateTimeOriginal instanceof Date
        ? raw.DateTimeOriginal.toISOString()
        : String(raw.DateTimeOriginal);
    } else if (raw.CreateDate) {
      exif.dateTaken = raw.CreateDate instanceof Date
        ? raw.CreateDate.toISOString()
        : String(raw.CreateDate);
    }

    // Dimensions
    exif.width = (raw.ExifImageWidth as number) || (raw.ImageWidth as number) || undefined;
    exif.height = (raw.ExifImageHeight as number) || (raw.ImageHeight as number) || undefined;

    // GPS
    if (raw.GPSLatitude != null && raw.GPSLongitude != null) {
      exif.gps = {
        lat: typeof raw.GPSLatitude === 'number' ? raw.GPSLatitude : parseFloat(String(raw.GPSLatitude)),
        lng: typeof raw.GPSLongitude === 'number' ? raw.GPSLongitude : parseFloat(String(raw.GPSLongitude)),
      };
    }

    // Software
    if (raw.Software) {
      exif.software = String(raw.Software);
    }

    // Orientation
    if (raw.Orientation) {
      exif.orientation = Number(raw.Orientation);
    }

    return c.json({ exif });
  } catch (err: any) {
    console.error('EXIF parse error:', err);
    return c.json({ exif: null, message: 'Failed to parse EXIF data' });
  }
});

// GET /api/thumbnail?dir=photos
// Returns the URL of the first image in a directory (for folder thumbnails)
metadata.get('/thumbnail', async (c) => {
  const dir = c.req.query('dir') || '';
  const bucket = c.env.R2_BUCKET;

  const prefix = dir ? dir + '/' : '';
  const result = await r2.listObjects(bucket, prefix, '/', { limit: 100 });

  // Find the first image file
  for (const obj of result.files) {
    if (!obj.key || obj.key.endsWith('/')) continue;
    const name = obj.key.replace(prefix, '');
    if (name.includes('/')) continue;

    const ext = name.split('.').pop()?.toLowerCase();
    if (ext && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) {
      return c.json({ path: obj.key, url: `/api/file?path=${encodeURIComponent(obj.key)}` });
    }
  }

  return c.json({ path: null, url: null });
});

export default metadata;
