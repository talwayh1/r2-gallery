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

// GET /api/search?q=term
// Global search across all directories
metadata.get('/search', async (c) => {
  const query = c.req.query('q');
  if (!query || query.length < 2) {
    return c.json({ results: [], query: query || '' });
  }

  const database = c.env.DB;
  const limit = parseInt(c.req.query('limit') || '50');

  try {
    const { searchFiles } = await import('../services/db');
    const results = await searchFiles(database, query, Math.min(limit, 100));

    // Map to client-friendly format
    const files = results.map((r) => ({
      path: r.path,
      name: r.path.split('/').pop() || r.path,
      mime: r.mime,
      size: r.size,
      mtime: r.mtime,
      // Compute the parent directory
      dir: r.path.includes('/') ? r.path.substring(0, r.path.lastIndexOf('/')) : '',
    }));

    return c.json({ results: files, query, total: files.length });
  } catch (err: any) {
    console.error('Search error:', err);
    return c.json({ error: 'Search failed', results: [] }, 500);
  }
});

// GET /api/discover?limit=30&offset=0
// Returns recent media files across all directories for gallery browsing
metadata.get('/discover', async (c) => {
  const database = c.env.DB;
  const limit = Math.min(parseInt(c.req.query('limit') || '30'), 100);
  const offset = Math.max(parseInt(c.req.query('offset') || '0'), 0);

  try {
    const { getRecentMedia, getMediaCount } = await import('../services/db');
    const [results, total] = await Promise.all([
      getRecentMedia(database, limit, offset),
      getMediaCount(database),
    ]);

    const files = results.map((r) => ({
      path: r.path,
      name: r.path.split('/').pop() || r.path,
      mime: r.mime,
      size: r.size,
      mtime: r.mtime,
      dir: r.path.includes('/') ? r.path.substring(0, r.path.lastIndexOf('/')) : '',
    }));

    return c.json({
      files,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    });
  } catch (err: any) {
    console.error('Discover error:', err);
    return c.json({ error: 'Failed to load discover feed', files: [] }, 500);
  }
});

// GET /api/memories?month=6&day=16
// Returns "On this day" memories — media from the same month/day in previous years
metadata.get('/memories', async (c) => {
  const database = c.env.DB;
  const now = new Date();
  const month = parseInt(c.req.query('month') || String(now.getUTCMonth() + 1));
  const day = parseInt(c.req.query('day') || String(now.getUTCDate()));

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return c.json({ error: 'Invalid month/day' }, 400);
  }

  try {
    const { getMemories } = await import('../services/db');
    const results = await getMemories(database, month, day);

    // Group by year for display
    const grouped: Record<number, typeof results> = {};
    for (const r of results) {
      const d = new Date(r.mtime * 1000);
      const year = d.getFullYear();
      if (!grouped[year]) grouped[year] = [];
      grouped[year].push(r);
    }

    const memories = Object.entries(grouped)
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([year, files]) => ({
        year: Number(year),
        yearsAgo: now.getFullYear() - Number(year),
        files: files.map((r) => ({
          path: r.path,
          name: r.path.split('/').pop() || r.path,
          mime: r.mime,
          size: r.size,
          mtime: r.mtime,
          dir: r.path.includes('/') ? r.path.substring(0, r.path.lastIndexOf('/')) : '',
        })),
      }));

    return c.json({
      date: `${month}/${day}`,
      memories,
      total: results.length,
    });
  } catch (err: any) {
    console.error('Memories error:', err);
    return c.json({ error: 'Failed to load memories', memories: [] }, 500);
  }
});

// GET /api/id3?path=song.mp3
// Extracts ID3 tags from audio files
metadata.get('/id3', async (c) => {
  const path = c.req.query('path');
  if (!path) return c.json({ error: 'Path required' }, 400);

  const ext = path.split('.').pop()?.toLowerCase();
  const supportedExts = ['mp3', 'm4a', 'ogg', 'flac', 'wav', 'aac', 'wma'];
  if (!ext || !supportedExts.includes(ext)) {
    return c.json({ id3: null, message: 'Not an audio file' });
  }

  const bucket = c.env.R2_BUCKET;
  const obj = await r2.getObject(bucket, path);
  if (!obj) return c.json({ error: 'File not found' }, 404);

  try {
    const body = (obj as any).body as ReadableStream;
    const bytes = await readBody(body);

    // Dynamic import jsmediatags
    const jsmediatags = await import('jsmediatags');

    return new Promise<Response>((resolve) => {
      const reader = new jsmediatags.Reader(bytes.buffer);
      reader.read({
        onSuccess: (tag: any) => {
          const tags = tag.tags || {};
          const id3: Record<string, any> = {};

          if (tags.title) id3.title = tags.title;
          if (tags.artist) id3.artist = tags.artist;
          if (tags.album) id3.album = tags.album;
          if (tags.year) id3.year = tags.year;
          if (tags.genre) id3.genre = tags.genre;
          if (tags.track) id3.track = tags.track;
          if (tags.picture) {
            // Convert picture data to base64
            const pic = tags.picture;
            const base64 = btoa(
              new Uint8Array(pic.data).reduce((data, byte) => data + String.fromCharCode(byte), '')
            );
            id3.cover = `data:${pic.format};base64,${base64}`;
          }

          resolve(c.json({ id3 }));
        },
        onError: (error: any) => {
          console.error('ID3 parse error:', error);
          resolve(c.json({ id3: null, message: 'Failed to parse ID3 tags' }));
        },
      });
    });
  } catch (err: any) {
    console.error('ID3 error:', err);
    return c.json({ id3: null, message: 'Failed to read audio file' });
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
