import { useState, useCallback, useRef } from 'react';
import { uploadFile } from '../api';
import { toast } from '../hooks/useToast';

interface Props {
  dir: string;
  onUpload: () => void;
  children: React.ReactNode;
}

export default function UploadZone({ dir, onUpload, children }: Props) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: FileList) => {
    setUploading(true);
    setProgress({ done: 0, total: files.length });
    let done = 0;
    let errors = 0;
    for (const file of Array.from(files)) {
      try {
        await uploadFile(dir, file);
        done++;
        setProgress({ done, total: files.length });
      } catch (e) {
        console.error(`Failed to upload ${file.name}:`, e);
        errors++;
      }
    }
    setUploading(false);
    if (errors > 0) {
      toast('warning', `上传完成: ${done} 成功, ${errors} 失败`);
    } else {
      toast('success', `已上传 ${done} 个文件`);
    }
    onUpload();
  }, [dir, onUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  return (
    <div
      className="relative h-full"
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      {children}

      {/* Upload button */}
      <button
        onClick={() => inputRef.current?.click()}
        className="fixed bottom-6 right-6 w-14 h-14 bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center z-30 transition-transform hover:scale-110"
        title="Upload files"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />

      {/* Drag overlay */}
      {dragging && (
        <div className="absolute inset-0 bg-blue-500/20 border-2 border-dashed border-blue-500 rounded-xl flex items-center justify-center z-20">
          <div className="text-center">
            <svg className="w-12 h-12 mx-auto mb-2 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-lg font-medium text-blue-600">Drop files to upload</p>
          </div>
        </div>
      )}

      {/* Upload progress */}
      {uploading && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white dark:bg-gray-800 px-6 py-3 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 z-30">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500" />
            <span className="text-sm">Uploading {progress.done}/{progress.total}...</span>
          </div>
        </div>
      )}
    </div>
  );
}
