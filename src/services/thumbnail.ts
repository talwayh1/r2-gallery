/**
 * Thumbnail Generation Service
 * Generates 300x300 WebP thumbnails using @jsquash WASM libraries.
 * Works in Cloudflare Workers environment.
 *
 * Supported: JPEG, PNG, WebP, AVIF, GIF (first frame), SVG (passthrough)
 */

import { decode as decodeJpeg } from '@jsquash/jpeg';
import { decode as decodePng } from '@jsquash/png';
import { decode as decodeWebp } from '@jsquash/webp';
import { decode as decodeAvif } from '@jsquash/avif';
import { decode as decodeGif } from '@discourse/gif';
import { encode as encodeWebp } from '@jsquash/webp';
import resize from '@jsquash/resize';

const THUMB_SIZE = 300;
const WEBP_QUALITY = 75;

/** Image MIME types supported for WASM thumbnail generation */
const WASM_SUPPORTED_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
]);

/** SVG gets special passthrough handling (no WASM decode) */
export function isSvg(mime: string): boolean {
  return mime === 'image/svg+xml';
}

/** Check if a MIME type is supported for thumbnail generation */
export function isSupportedImageType(mime: string): boolean {
  return WASM_SUPPORTED_TYPES.has(mime.toLowerCase()) || isSvg(mime);
}

/** Get the thumbnail R2 key for a given path */
export function getThumbKey(path: string): string {
  return `_thumbs/${path}.webp`;
}

/**
 * Generate a 300x300 WebP thumbnail from an image buffer.
 * Returns null if the image type is not supported or processing fails.
 */
export async function generateThumbnail(
  buffer: ArrayBuffer,
  mime: string
): Promise<ArrayBuffer | null> {
  try {
    // SVG: return original buffer (browser renders it natively)
    if (isSvg(mime)) {
      return buffer;
    }

    if (!WASM_SUPPORTED_TYPES.has(mime.toLowerCase())) {
      return null;
    }

    // Decode image to raw RGBA pixels
    let imageData: { data: Uint8ClampedArray; width: number; height: number };

    switch (mime) {
      case 'image/jpeg':
      case 'image/jpg':
        imageData = await decodeJpeg(buffer);
        break;
      case 'image/png':
        imageData = await decodePng(buffer);
        break;
      case 'image/webp':
        imageData = await decodeWebp(buffer);
        break;
      case 'image/avif':
        imageData = await decodeAvif(buffer);
        break;
      case 'image/gif':
        imageData = await decodeGif(buffer);
        break;
      default:
        return null;
    }

    // Resize to 300x300 with center-crop (contain mode crops to target aspect ratio)
    const resized = await resize(imageData, {
      width: THUMB_SIZE,
      height: THUMB_SIZE,
      fitMethod: 'contain',
    });

    // Encode to WebP
    const webpBuffer = await encodeWebp(resized, { quality: WEBP_QUALITY });

    // webpBuffer is a Uint8Array, convert to ArrayBuffer
    if (webpBuffer instanceof ArrayBuffer) {
      return webpBuffer;
    }
    // Uint8Array -> ArrayBuffer
    return new Uint8Array(webpBuffer).buffer;
  } catch (err) {
    console.error('Thumbnail generation failed:', err);
    return null;
  }
}
