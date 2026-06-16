import { useState, useCallback, useRef } from 'react';
import { uploadFile } from '../api';
import { toast } from '../hooks/useToast';

interface Props {
  dir: string;
  onUpload: () => void;
  children: React.ReactNode;
}

async function compressImage(file: File, maxDim = 2000, quality = 0.8): Promise<File> {
  if (!file.type.startsWith('image/') || file.size < 500000) return file;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > maxDim || h > maxDim) {
        const ratio = Math.min(maxDim / w, maxDim / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      if (w === img.width && h === img.height) { resolve(file); return; }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => {
        if (blob && blob.size < file.size) {
          resolve(new File([blob], file.name, { type: 'image/jpeg' }));
        } else { resolve(file); }
      }, 'image/jpeg', quality);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

export default function UploadZone({ dir, onUpload, children }: Props) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [compress, setCompress] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: FileList) => {
    setUploading(true);
    setProgress({ done: 0, total: files.length });
    let done = 0;
    let errors = 0;
    for (const file of Array.from(files)) {
      try {
        const finalFile = compress ? await compressImage(file) : file;
        await uploadFile(dir, finalFile);
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
  }, [dir, onUpload, compress]);

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
      <div className="fixed bottom-6 right-6 z-30 flex flex-col items-end gap-2">
        <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 px-2 py-1 rounded-lg shadow border border-gray-200 dark:border-gray-700 cursor-pointer">
          <input type="checkbox" checked={compress} onChange={(e) => setCompress(e.target.checked)} className="w-3 h-3 rounded" />
          压缩图片
        </label>
        <button
          onClick={() => inputRef.current?.click()}
          className="w-14 h-14 bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-110"
          title="上传文件"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>
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
            <p className="text-lg font-medium text-blue-600">拖放文件到此处上传</p>
          </div>
        </div>
      )}

      {/* Upload progress */}
      {uploading && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white dark:bg-gray-800 px-6 py-3 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 z-30">
          <div className="flex items-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500" />
            <span className="text-sm">上传中 {progress.done}/{progress.total}...</span>
          </div>
        </div>
      )}
    </div>
  );
}
