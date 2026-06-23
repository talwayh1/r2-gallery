/**
 * UploadDropzone — drag-and-drop + file/folder picker.
 * Supports folder upload via webkitdirectory and drag-drop folder detection.
 * Replaces Uppy-based UploadZone.
 *
 * Inspired by ZPan's upload-dropzone architecture.
 */

import { useCallback, useRef, useState, useEffect, type ReactNode, forwardRef, useImperativeHandle } from 'react';
import { useUploadQueue, type UploadRunnerContext } from '../hooks/useUploadQueue';
import { uploadFileWithProgress } from '../api';
import { toast } from '../hooks/useToast';

interface Props {
  dir: string;
  onUpload: () => void;
  children: ReactNode;
}

export interface UploadDropzoneHandle {
  openFileDialog: () => void;
  openDirectoryDialog: () => void;
}

interface WebKitEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath: string;
  file?: (cb: (file: File) => void) => void;
  createReader?: () => WebKitDirectoryReader;
}

interface WebKitDirectoryReader {
  readEntries: (cb: (entries: WebKitEntry[]) => void) => void;
}

/** Maximum files allowed in a single upload batch — prevents browser freeze with huge selections */
const MAX_BATCH_FILES = 500;
/** Human-readable file size formatter */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}
/** Summarize a batch of files for the drag overlay */
function summarizeFiles(files: { file: File; relativePath?: string }[]): { total: number; totalSize: string; note?: string } {
  const total = files.length;
  const totalBytes = files.reduce((s, f) => s + f.file.size, 0);
  let note: string | undefined;
  if (total > MAX_BATCH_FILES) {
    note = `超过单次上传上限 (${MAX_BATCH_FILES})`;
  }
  return { total, totalSize: formatFileSize(totalBytes), note };
}

/** Read all entries from a directory reader recursively */
async function readAllEntries(reader: WebKitDirectoryReader): Promise<WebKitEntry[]> {
  return new Promise((resolve) => {
    const all: WebKitEntry[] = [];
    const readBatch = () => {
      reader.readEntries((entries) => {
        if (entries.length === 0) {
          resolve(all);
        } else {
          all.push(...entries);
          readBatch();
        }
      });
    };
    readBatch();
  });
}

/** Recursively read a directory entry into an array of { file, relativePath } */
async function readDirectory(entry: WebKitEntry): Promise<{ file: File; relativePath: string }[]> {
  const results: { file: File; relativePath: string }[] = [];

  if (entry.isFile) {
    const file = await new Promise<File>((resolve) => entry.file!(resolve));
    results.push({ file, relativePath: entry.fullPath.startsWith('/') ? entry.fullPath.slice(1) : entry.fullPath });
  } else if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    const entries = await readAllEntries(reader);
    for (const child of entries) {
      const childResults = await readDirectory(child);
      results.push(...childResults);
    }
  }

  return results;
}

/** Check if any file in the list has a relative path (folder selection) */
function isFolderSelection(files: { file: File; relativePath?: string }[]): boolean {
  return files.some(f => f.relativePath && f.relativePath.includes('/'));
}

const UploadDropzone = forwardRef<UploadDropzoneHandle, Props>(function UploadDropzone({ dir, onUpload, children }, ref) {
  const { enqueue } = useUploadQueue();
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [dragFiles, setDragFiles] = useState<{ file: File; relativePath?: string }[] | null>(null);

  const handleUpload = useCallback((files: { file: File; relativePath?: string }[]) => {
    if (files.length === 0) return;

    // Validate batch size
    if (files.length > MAX_BATCH_FILES) {
      toast('warning', `单次最多上传 ${MAX_BATCH_FILES} 个文件，已跳过 ${files.length - MAX_BATCH_FILES} 个`);
      files = files.slice(0, MAX_BATCH_FILES);
    }

    // Generate preview URLs for image files
    const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/bmp', 'image/svg+xml'];

    enqueue(
      files.map(({ file, relativePath }) => {
        const previewUrl = imageTypes.includes(file.type) ? URL.createObjectURL(file) : undefined;

        return {
          file,
          relativePath,
          previewUrl,
          run: async (ctx: UploadRunnerContext) => {
            try {
              await uploadFileWithProgress(dir, file, relativePath, ctx.onProgress, ctx.signal);
            } catch (e) {
              // If upload fails, revoke the preview URL to free memory immediately
              if (previewUrl) try { URL.revokeObjectURL(previewUrl); } catch { /* noop */ }
              throw e;
            }
          },
        };
      }),
      (hadSuccess) => {
        if (hadSuccess) {
          toast('success', `已上传 ${files.length} 个文件`);
          onUpload();
        }
      }
    );
  }, [dir, enqueue, onUpload]);

  // Handle drag-and-drop (supports folders via DataTransferItem.webkitGetAsEntry)
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setShowOverlay(false);
    setDragFiles(null);

    const items = Array.from(e.dataTransfer.items);
    if (items.length === 0) return;

    // Try to read as filesystem entries (supports folders)
    const allFiles: { file: File; relativePath: string }[] = [];

    for (const item of items) {
      const entry = (item as any).webkitGetAsEntry?.() as WebKitEntry | null;
      if (entry) {
        const results = await readDirectory(entry);
        allFiles.push(...results);
      } else {
        // Fallback: regular file
        const file = item.getAsFile();
        if (file) allFiles.push({ file, relativePath: file.name });
      }
    }

    handleUpload(allFiles);
  }, [handleUpload]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    setShowOverlay(true);
    const items = Array.from(e.dataTransfer.items);
    // Build a preview of what's being dragged
    if (items.length > 0) {
      const hasFolder = items.some(item => {
        const entry = (item as any).webkitGetAsEntry?.() as WebKitEntry | null;
        return entry?.isDirectory;
      });
      // For drag preview we show count/mode; actual file names are resolved on drop
      const count = items.length;
      const preview = [];
      for (let i = 0; i < Math.min(count, 5); i++) {
        const item = items[i];
        const entry = (item as any).webkitGetAsEntry?.() as WebKitEntry | null;
        if (entry) {
          preview.push({ file: new File([], entry.name), relativePath: entry.fullPath });
        } else {
          const file = item.getAsFile();
          if (file) preview.push({ file, relativePath: file.name });
        }
      }
      setDragFiles(preview.length > 0 ? preview : null);
    } else {
      setDragFiles(null);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setShowOverlay(false);
      setDragFiles(null);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // Handle file input change
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList).map(f => {
      // webkitRelativePath is set when using folder picker
      const relativePath = (f as any).webkitRelativePath as string | undefined;
      return { file: f, relativePath: relativePath || f.name };
    });

    handleUpload(files);
    e.target.value = '';
  }, [handleUpload]);

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    openFileDialog: () => fileInputRef.current?.click(),
    openDirectoryDialog: () => folderInputRef.current?.click(),
  }), []);

  // Clipboard paste — extract images from clipboard and upload
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items || []);
      const imageItems = items.filter(item => item.type.startsWith('image/'));
      if (imageItems.length === 0) return;

      e.preventDefault();
      e.stopPropagation();

      const files: { file: File; relativePath?: string }[] = [];
      for (const item of imageItems) {
        const blob = item.getAsFile();
        if (blob) {
          // Derive a sensible filename
          const ext = blob.type.split('/')[1] || 'png';
          const name = `pasted_${Date.now()}.${ext}`;
          const file = new File([blob], name, { type: blob.type });
          files.push({ file, relativePath: name });
        }
      }

      if (files.length > 0) {
        toast('info', `检测到 ${files.length} 个剪贴板图片，开始上传`);
        handleUpload(files);
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handleUpload]);

  // Compute drag overlay summary
  const dropSummary = dragFiles ? summarizeFiles(dragFiles) : null;

  return (
    <div
      className="relative h-full"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}

      {/* Drag overlay — rendered via React state instead of imperative style.display */}
      {showOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-blue-500/10 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border-2 border-dashed border-blue-500">
            <svg className="w-16 h-16 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-lg font-medium text-gray-700 dark:text-gray-200">松开以上传文件</p>
            <p className="text-sm text-gray-400">支持文件和文件夹拖拽</p>
            {dropSummary && (
              <div className="flex flex-col items-center gap-1">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${
                  dropSummary.total > MAX_BATCH_FILES
                    ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400'
                    : 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                }`}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  {dragFiles!.length} 个项目
                  {dropSummary.totalSize !== '0 B' && (
                    <span className="text-xs opacity-75">({dropSummary.totalSize})</span>
                  )}
                </span>
                {dropSummary.note && (
                  <span className="text-xs text-amber-500">{dropSummary.note}</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        // @ts-ignore — webkitdirectory is non-standard but widely supported
        webkitdirectory=""
        directory=""
        onChange={handleFileInputChange}
      />
    </div>
  );
});

export default UploadDropzone;
