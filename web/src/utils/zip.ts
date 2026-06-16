import JSZip from 'jszip';
import { getFileUrl } from '../api';

export async function downloadAsZip(
  files: { name: string; path: string }[],
  zipName: string,
  onProgress?: (current: number, total: number) => void
) {
  const zip = new JSZip();
  const folder = zip.folder(zipName.replace('.zip', ''));

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.(i + 1, files.length);
    
    try {
      const response = await fetch(getFileUrl(file.path));
      if (!response.ok) throw new Error(`Failed to fetch ${file.name}`);
      const blob = await response.blob();
      folder?.file(file.name, blob);
    } catch (err) {
      console.error(`Failed to add ${file.name} to zip:`, err);
    }
  }

  const content = await zip.generateAsync({ type: 'blob' }, (metadata) => {
    onProgress?.(metadata.percent, 100);
  });

  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function downloadDirAsZip(
  dirPath: string,
  files: { name: string; path: string }[],
  onProgress?: (current: number, total: number) => void
) {
  const dirName = dirPath.split('/').pop() || 'folder';
  await downloadAsZip(files, `${dirName}.zip`, onProgress);
}
