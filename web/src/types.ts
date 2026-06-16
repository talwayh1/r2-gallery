export interface FileItem {
  name: string;
  type: 'file' | 'directory';
  size: number;
  mime: string;
  mtime: number;
  path: string;
}

export interface FileListResponse {
  path: string;
  files: Record<string, FileItem>;
  dirs: string[];
  cursor?: string;
  hasMore?: boolean;
}

export type LayoutMode = 'grid' | 'rows';
export type ThemeMode = 'light' | 'dark' | 'system';
