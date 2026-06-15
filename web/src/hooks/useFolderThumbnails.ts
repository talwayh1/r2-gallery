import { useState, useEffect, useRef } from 'react';
import { getThumbnail } from '../api';

// Global cache to avoid re-fetching across components
const thumbnailCache = new Map<string, string | null>();
const pendingRequests = new Map<string, Promise<string | null>>();

async function fetchThumbnail(dir: string): Promise<string | null> {
  if (thumbnailCache.has(dir)) return thumbnailCache.get(dir)!;
  if (pendingRequests.has(dir)) return pendingRequests.get(dir)!;

  const promise = getThumbnail(dir)
    .then((data) => {
      const url = data.url;
      thumbnailCache.set(dir, url);
      pendingRequests.delete(dir);
      return url;
    })
    .catch(() => {
      thumbnailCache.set(dir, null);
      pendingRequests.delete(dir);
      return null;
    });

  pendingRequests.set(dir, promise);
  return promise;
}

/** Fetch thumbnails for a list of directories */
export function useFolderThumbnails(dirs: string[], currentDir: string) {
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const fetchedRef = useRef(new Set<string>());

  useEffect(() => {
    if (dirs.length === 0) return;

    let cancelled = false;

    // Build full paths for each directory
    const dirPaths = dirs.map((name) => (currentDir ? `${currentDir}/${name}` : name));

    // Fetch uncached directories
    const toFetch = dirPaths.filter((p) => !fetchedRef.current.has(p));
    if (toFetch.length === 0) return;

    toFetch.forEach((p) => fetchedRef.current.add(p));

    Promise.all(
      toFetch.map(async (dirPath) => {
        const url = await fetchThumbnail(dirPath);
        return { dirPath, url };
      })
    ).then((results) => {
      if (cancelled) return;
      const updates: Record<string, string> = {};
      for (const { dirPath, url } of results) {
        if (url) updates[dirPath] = url;
      }
      if (Object.keys(updates).length > 0) {
        setThumbnails((prev) => ({ ...prev, ...updates }));
      }
    });

    return () => { cancelled = true; };
  }, [dirs, currentDir]);

  return thumbnails;
}
