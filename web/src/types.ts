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
  dirCounts?: Record<string, number>;
  cursor?: string;
  hasMore?: boolean;
}

export type SortMode = 'name' | 'size' | 'mtime' | 'kind' | 'shuffle';
export type LayoutMode = 'grid' | 'rows' | 'list' | 'imagelist' | 'blocks' | 'columns';
export type ThemeMode = 'light' | 'dark' | 'system' | 'contrast';
