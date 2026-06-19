/**
 * R2 Storage Service for Cloudflare Workers
 * Provides async wrappers around R2Bucket binding methods.
 */

import type { R2Object, R2Objects, R2Bucket, R2ListOptions, R2HTTPMetadata } from '@cloudflare/workers-types';

/** Result of listing objects: separated directories and files */
export interface ListResult {
  directories: string[];
  files: R2Object[];
  truncated: boolean;
  cursor?: string;
}

/**
 * List objects in a bucket with optional prefix and delimiter.
 * Returns separated directories (common prefixes) and file objects.
 */
export async function listObjects(
  bucket: R2Bucket,
  prefix?: string,
  delimiter?: string,
  options?: { limit?: number; cursor?: string }
): Promise<ListResult> {
  const listOptions: R2ListOptions = {
    ...(prefix ? { prefix } : {}),
    ...(delimiter ? { delimiter } : {}),
    ...(options?.limit ? { limit: options.limit } : {}),
    ...(options?.cursor ? { cursor: options.cursor } : {}),
  };

  const listed: R2Objects = await bucket.list(listOptions);

  const directories = listed.delimitedPrefixes ?? [];
  const files = listed.objects ?? [];

  return {
    directories,
    files,
    truncated: listed.truncated,
    cursor: listed.truncated ? listed.cursor : undefined,
  };
}

/**
 * Get an R2 object by key. Returns null if not found.
 */
export async function getObject(
  bucket: R2Bucket,
  key: string
): Promise<R2Object | null> {
  return bucket.get(key);
}

/**
 * Upload an object to R2.
 */
export async function putObject(
  bucket: R2Bucket,
  key: string,
  body: ReadableStream | ArrayBuffer | string | null,
  httpMetadata?: R2HTTPMetadata
): Promise<R2Object> {
  return bucket.put(key, body, {
    ...(httpMetadata ? { httpMetadata } : {}),
  });
}

/**
 * Delete a single object from R2.
 */
export async function deleteObject(
  bucket: R2Bucket,
  key: string
): Promise<void> {
  await bucket.delete(key);
}

/**
 * Batch delete multiple objects from R2.
 */
export async function deleteObjects(
  bucket: R2Bucket,
  keys: string[]
): Promise<void> {
  if (keys.length === 0) return;
  await bucket.delete(keys);
}

/**
 * Copy an object within the same bucket — pure copy (does NOT delete source).
 * Used for copy, duplicate, and paste operations.
 */
export async function copyObject(
  bucket: R2Bucket,
  source: string,
  dest: string
): Promise<R2Object | null> {
  const srcObj = await bucket.get(source);
  if (!srcObj) return null;

  const metadata: R2HTTPMetadata | undefined = srcObj.httpMetadata
    ? { ...srcObj.httpMetadata }
    : undefined;

  return bucket.put(dest, srcObj.body, {
    ...(metadata ? { httpMetadata: metadata } : {}),
    customMetadata: srcObj.customMetadata ?? undefined,
  });
}

/**
 * Move an object within the same bucket — copies then deletes source.
 * Used for rename, move, and directory relocation.
 */
export async function moveObject(
  bucket: R2Bucket,
  source: string,
  dest: string
): Promise<R2Object | null> {
  const result = await copyObject(bucket, source, dest);
  if (result) {
    await bucket.delete(source);
  }
  return result;
}
