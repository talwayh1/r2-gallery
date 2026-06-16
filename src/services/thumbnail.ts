/**
 * Thumbnail Generation Service
 * Generates 300x300 WebP thumbnails using @jsquash WASM libraries.
 * Works in Cloudflare Workers environment.
 */

import { decode as decodeJpeg } from '@jsquash/jpeg';
import { decode as decodePng } from '@jsquash/png';
import { encode as encodeWebp } from '@jsquash/webp';
import resize from '@jsquash/resize';

const THUMB_SIZE = 300;
const WEBP_QUALITY = 75;

/** Supported image MIME types for thumbnail generation */
const SUPPORTED_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
]);

/** Check if a MIME type is supported for thumbnail generation */
export function isSupportedImageType(mime: string): boolean {
  return SUPPORTED_TYPES.has(mime.toLowerCase());
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
    if (!isSupportedImageType(mime)) {
      return null;
    }

    // Decode image to raw RGBA pixels
    let imageData: { data: Uint8ClampedArray; width: number; height: number };

    if (mime === 'image/jpeg' || mime === 'image/jpg') {
      imageData = await decodeJpeg(buffer);
    } else if (mime === 'image/png') {
      imageData = await decodePng(buffer);
    } else {
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
