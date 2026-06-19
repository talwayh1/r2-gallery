/**
 * UploadDropzone — drag-and-drop + file/folder picker.
 * Supports folder upload via webkitdirectory and drag-drop folder detection.
 * Replaces Uppy-based UploadZone.
 *
 * Inspired by ZPan's upload-dropzone architecture.
 */

import { useCallback, useRef, useEffect, type ReactNode, forwardRef, useImperativeHandle } from 'react';
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
  const overlayRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback((files: { file: File; relativePath?: string }[]) => {
    if (files.length === 0) return;

    enqueue(
      files.map(({ file, relativePath }) => ({
        file,
        relativePath,
        run: async (ctx: UploadRunnerContext) => {
          await uploadFileWithProgress(dir, file, relativePath, ctx.onProgress, ctx.signal);
        },
      })),
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
    if (overlayRef.current) overlayRef.current.style.display = 'none';

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
    if (overlayRef.current) overlayRef.current.style.display = 'flex';
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      if (overlayRef.current) overlayRef.current.style.display = 'none';
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

  return (
    <div
      className="relative h-full"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}

      {/* Drag overlay */}
      <div
        ref={overlayRef}
        className="fixed inset-0 z-50 hidden items-center justify-center bg-blue-500/10 backdrop-blur-sm"
        style={{ display: 'none' }}
      >
        <div className="flex flex-col items-center gap-4 p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border-2 border-dashed border-blue-500">
          <svg className="w-16 h-16 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-lg font-medium text-gray-700 dark:text-gray-200">松开以上传文件</p>
          <p className="text-sm text-gray-400">支持文件和文件夹拖拽</p>
        </div>
      </div>

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
        // @ts-ignore — webkitdirectory is non-standard but widely supported
        webkitdirectory=""
        directory=""
        className="hidden"
        onChange={handleFileInputChange}
      />
    </div>
  );
});

export default UploadDropzone;
