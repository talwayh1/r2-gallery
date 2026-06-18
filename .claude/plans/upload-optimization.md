# Upload System Rewrite — Inspired by ZPan

## Problem
Current upload uses Uppy (~243KB dependency) with no progress tracking, no concurrent uploads, no folder upload support, and no drag-and-drop for folders.

## Solution
Replace Uppy with a lightweight custom upload system inspired by ZPan's architecture.

## Architecture

### 1. Upload Queue (`web/src/hooks/useUploadQueue.tsx`)
- Context provider + hook (like ZPan's `upload-queue.tsx`)
- Max 3 concurrent uploads
- Per-file progress tracking (loaded/total/speed/ETA)
- Status lifecycle: queued → uploading → completed/failed/cancelled
- AbortController per task for cancellation
- `beforeunload` warning when uploads active
- `enqueue(files[])` to add files to queue

### 2. Upload Dropzone (`web/src/components/UploadDropzone.tsx`)
- Native HTML5 drag-and-drop (no react-dropzone dependency)
- Detects folder drops via `webkitGetAsEntry()` + recursive reading
- File input with both file and folder modes (`webkitdirectory` attribute)
- Exposes `openFileDialog()` and `openDirectoryDialog()` via ref
- Replaces UploadZone.tsx entirely

### 3. Upload Panel (`web/src/components/UploadPanel.tsx`)
- Collapsible panel showing all upload tasks
- Per-file: name, size, progress bar, speed, ETA, status
- Cancel individual / cancel all
- Auto-opens when upload starts
- Badge on trigger button showing active count

### 4. XHR Upload with Progress (`web/src/api.ts`)
- New `uploadFileWithProgress()` function using XMLHttpRequest
- Reports `{ loaded, total }` progress events
- Supports AbortSignal for cancellation
- Sends `relativePath` for folder uploads

### 5. Backend Changes (`src/routes/upload.ts`)
- Accept `relativePath` from FormData (already supported)
- No major changes needed — existing endpoint works

### 6. Remove Uppy
- Remove `@uppy/core`, `@uppy/dashboard`, `@uppy/xhr-upload`, `@uppy/image-editor`
- Remove Uppy CSS imports
- Remove UploadZone.tsx
- Net savings: ~243KB from UploadZone chunk + 74KB Uppy CSS

## Files to Create
- `web/src/hooks/useUploadQueue.tsx` — upload queue context + hook
- `web/src/components/UploadDropzone.tsx` — drag-and-drop + file/folder picker
- `web/src/components/UploadPanel.tsx` — upload progress UI

## Files to Modify
- `web/src/api.ts` — add `uploadFileWithProgress()`
- `web/src/App.tsx` — replace UploadZone with UploadDropzone + UploadPanel, wrap in UploadQueueProvider
- `web/package.json` — remove Uppy dependencies

## Files to Delete
- `web/src/components/UploadZone.tsx` — replaced by UploadDropzone

## Key Design Decisions
1. **No presigned URLs** — R2 binding doesn't support presign in Workers; upload through Worker proxy is fine for now
2. **No multipart/chunked** — R2 binding doesn't expose multipart API; single PUT with progress is sufficient for most files
3. **No new dependencies** — pure HTML5 drag-and-drop, native XHR for progress
4. **Folder upload** — `webkitGetAsEntry()` for drag-drop, `webkitdirectory` for file picker
