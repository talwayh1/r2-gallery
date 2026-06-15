export interface AppBindings {
  R2_BUCKET: R2Bucket;
  DB: D1Database;
  JWT_SECRET: string;
  ADMIN_PASSWORD?: string;
}

export interface FileInfo {
  name: string;
  type: 'file' | 'directory';
  size: number;
  mime: string;
  mtime: number;
  path: string;
}

export interface FileListResponse {
  path: string;
  files: Record<string, FileInfo>;
  dirs: string[];
}

export interface DirTreeNode {
  name: string;
  path: string;
  children: DirTreeNode[];
}

export interface User {
  id: number;
  username: string;
  password_hash: string;
  role: 'admin' | 'user';
  created_at: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: {
    id: number;
    username: string;
    role: string;
  };
}

export interface MkdirRequest {
  path: string;
}

export interface DeleteRequest {
  items: string[];
}

export interface RenameRequest {
  path: string;
  name: string;
}

export interface Setting {
  key: string;
  value: string;
}

export interface FileMetadata {
  path: string;
  size: number;
  mime: string;
  mtime: number;
  created_at: string;
}

export type Variables = {
  userId: number;
  userRole: string;
  username: string;
};
