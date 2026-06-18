# files.gallery 功能对齐实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 复刻 files.gallery 全部功能到 r2-gallery，实现 Cloudflare Workers + R2 + D1 + React 的完整文件管理画廊

**Architecture:** 后端 Hono Worker 提供 API，前端 React SPA 提供 UI。R2 存储文件，D1 存储元数据。使用 WASM 库处理图片缩略图，Plyr 作为媒体播放器，CodeMirror 作为编辑器。

**Tech Stack:** TypeScript, Hono, React 18, Vite, Tailwind CSS, Plyr.js, CodeMirror 6, JSZip, @jsquash/*, exifr

---

## Task 1: 布局系统扩展 — imagelist 布局

**Covers:** 布局系统 (files.gallery 6种布局中的第3种)

**Files:**
- Create: `web/src/components/FileImageList.tsx`
- Modify: `web/src/components/Header.tsx:1-50` (添加布局选项)
- Modify: `web/src/App.tsx` (导入新组件)

- [ ] **Step 1: 创建 FileImageList 组件**

```tsx
// web/src/components/FileImageList.tsx
import React from 'react';
import { FileItem } from '../types';

interface FileImageListProps {
  files: FileItem[];
  onFileClick: (file: FileItem) => void;
  onFolderClick: (path: string) => void;
  selectedFiles: Set<string>;
  onToggleSelect: (path: string) => void;
  onRename: (file: FileItem) => void;
  onDelete: (file: FileItem) => void;
  onMove: (file: FileItem, target: string) => void;
}

export default function FileImageList({
  files,
  onFileClick,
  onFolderClick,
  selectedFiles,
  onToggleSelect,
  onRename,
  onDelete,
  onMove,
}: FileImageListProps) {
  return (
    <div className="space-y-2">
      {files.map((file) => (
        <div
          key={file.path}
          className={`flex items-center gap-4 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer ${
            selectedFiles.has(file.path) ? 'bg-blue-50 dark:bg-blue-900/30' : ''
          }`}
          onClick={() => file.is_dir ? onFolderClick(file.path) : onFileClick(file)}
        >
          <input
            type="checkbox"
            checked={selectedFiles.has(file.path)}
            onChange={(e) => { e.stopPropagation(); onToggleSelect(file.path); }}
            className="w-4 h-4"
          />
          <div className="w-16 h-16 flex-shrink-0 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
            {file.thumbnail_url ? (
              <img src={file.thumbnail_url} alt="" className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                {file.is_dir ? '📁' : '📄'}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{file.name}</div>
            <div className="text-sm text-gray-500">
              {file.is_dir ? `${file.file_count || 0} items` : formatSize(file.size)}
            </div>
          </div>
          <div className="text-sm text-gray-400">
            {new Date(file.mtime * 1000).toLocaleDateString()}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
```

- [ ] **Step 2: 在 Header 中添加 imagelist 布局选项**

修改 `web/src/components/Header.tsx`，在布局切换按钮中添加 'imagelist' 选项。

- [ ] **Step 3: 在 App.tsx 中导入并使用 FileImageList**

修改 `web/src/App.tsx`，根据 `layout` 状态条件渲染 FileImageList。

- [ ] **Step 4: 验证构建**

Run: `cd web && npm run build`
Expected: TypeScript 编译成功，无错误

---

## Task 2: 布局系统扩展 — blocks 布局

**Covers:** 布局系统 (files.gallery 6种布局中的第4种)

**Files:**
- Create: `web/src/components/FileBlocks.tsx`
- Modify: `web/src/components/Header.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: 创建 FileBlocks 组件**

```tsx
// web/src/components/FileBlocks.tsx
import React from 'react';
import { FileItem } from '../types';

interface FileBlocksProps {
  files: FileItem[];
  onFileClick: (file: FileItem) => void;
  onFolderClick: (path: string) => void;
  selectedFiles: Set<string>;
  onToggleSelect: (path: string) => void;
}

export default function FileBlocks({
  files,
  onFileClick,
  onFolderClick,
  selectedFiles,
  onToggleSelect,
}: FileBlocksProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {files.map((file) => (
        <div
          key={file.path}
          className={`group relative rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 cursor-pointer ${
            selectedFiles.has(file.path) ? 'ring-2 ring-blue-500' : ''
          }`}
          onClick={() => file.is_dir ? onFolderClick(file.path) : onFileClick(file)}
        >
          <div className="aspect-square">
            {file.thumbnail_url ? (
              <img src={file.thumbnail_url} alt="" className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-4xl text-gray-400">
                {file.is_dir ? '📁' : '📄'}
              </div>
            )}
          </div>
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
            <div className="text-white text-sm font-medium truncate">{file.name}</div>
          </div>
          <input
            type="checkbox"
            checked={selectedFiles.has(file.path)}
            onChange={(e) => { e.stopPropagation(); onToggleSelect(file.path); }}
            className="absolute top-2 left-2 w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity"
          />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 在 Header 中添加 blocks 布局选项**

- [ ] **Step 3: 在 App.tsx 中导入并使用 FileBlocks**

- [ ] **Step 4: 验证构建**

Run: `cd web && npm run build`
Expected: 成功

---

## Task 3: 布局系统扩展 — columns 布局

**Covers:** 布局系统 (files.gallery 6种布局中的第5种)

**Files:**
- Create: `web/src/components/FileColumns.tsx`
- Modify: `web/src/components/Header.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: 创建 FileColumns 组件**

```tsx
// web/src/components/FileColumns.tsx
import React from 'react';
import { FileItem } from '../types';

interface FileColumnsProps {
  files: FileItem[];
  onFileClick: (file: FileItem) => void;
  onFolderClick: (path: string) => void;
  selectedFiles: Set<string>;
  onToggleSelect: (path: string) => void;
}

export default function FileColumns({
  files,
  onFileClick,
  onFolderClick,
  selectedFiles,
  onToggleSelect,
}: FileColumnsProps) {
  return (
    <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 gap-4 space-y-4">
      {files.map((file) => (
        <div
          key={file.path}
          className={`break-inside-avoid rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 cursor-pointer ${
            selectedFiles.has(file.path) ? 'ring-2 ring-blue-500' : ''
          }`}
          onClick={() => file.is_dir ? onFolderClick(file.path) : onFileClick(file)}
        >
          {file.thumbnail_url ? (
            <img src={file.thumbnail_url} alt="" className="w-full" loading="lazy" />
          ) : (
            <div className="aspect-square flex items-center justify-center text-4xl text-gray-400">
              {file.is_dir ? '📁' : '📄'}
            </div>
          )}
          <div className="p-2">
            <div className="text-sm font-medium truncate">{file.name}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 在 Header 中添加 columns 布局选项**

- [ ] **Step 3: 在 App.tsx 中导入并使用 FileColumns**

- [ ] **Step 4: 验证构建**

Run: `cd web && npm run build`
Expected: 成功

---

## Task 4: 排序增强 — kind 排序和 shuffle

**Covers:** 排序系统

**Files:**
- Modify: `src/routes/files.ts` (后端排序)
- Modify: `web/src/api.ts` (前端排序参数)
- Modify: `web/src/App.tsx` (排序状态)
- Modify: `web/src/components/Header.tsx` (排序UI)

- [ ] **Step 1: 后端添加 kind 排序支持**

修改 `src/routes/files.ts`，在排序逻辑中添加 'kind' 排序，按文件扩展名分组。

- [ ] **Step 2: 后端添加 shuffle 排序**

修改 `src/routes/files.ts`，添加 'shuffle' 排序，使用 Fisher-Yates 洗牌算法。

- [ ] **Step 3: 前端 API 添加排序参数**

修改 `web/src/api.ts`，确保 listFiles 支持 sort=kind 和 sort=shuffle。

- [ ] **Step 4: 前端排序 UI 更新**

修改 `web/src/components/Header.tsx`，在排序下拉菜单中添加 'kind' 和 'shuffle' 选项。

- [ ] **Step 5: 验证构建**

Run: `cd web && npm run build && npm run dev`
Expected: 排序功能正常工作

---

## Task 5: 文件/目录过滤系统

**Covers:** 过滤系统 (files.gallery 的 files_include/exclude + dirs_include/exclude)

**Files:**
- Modify: `src/routes/files.ts` (后端过滤)
- Modify: `src/services/db.ts` (D1 查询过滤)
- Create: `web/src/components/FilterBar.tsx` (过滤 UI)
- Modify: `web/src/App.tsx` (过滤状态)

- [ ] **Step 1: 后端添加文件过滤参数**

修改 `src/routes/files.ts`，接受 `files_include`、`files_exclude`、`dirs_include`、`dirs_exclude` 查询参数，使用正则表达式过滤。

- [ ] **Step 2: 创建 FilterBar 组件**

```tsx
// web/src/components/FilterBar.tsx
import React, { useState } from 'react';

interface FilterBarProps {
  onFilter: (filter: { files?: string; dirs?: string }) => void;
}

export default function FilterBar({ onFilter }: FilterBarProps) {
  const [filesFilter, setFilesFilter] = useState('');
  const [dirsFilter, setDirsFilter] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleApply = () => {
    onFilter({
      files: filesFilter || undefined,
      dirs: dirsFilter || undefined,
    });
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        placeholder="过滤文件..."
        value={filesFilter}
        onChange={(e) => setFilesFilter(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleApply()}
        className="px-3 py-1 text-sm border rounded dark:bg-gray-800 dark:border-gray-600"
      />
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="text-sm text-gray-500 hover:text-gray-700"
      >
        高级
      </button>
      {showAdvanced && (
        <input
          type="text"
          placeholder="过滤目录..."
          value={dirsFilter}
          onChange={(e) => setDirsFilter(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleApply()}
          className="px-3 py-1 text-sm border rounded dark:bg-gray-800 dark:border-gray-600"
        />
      )}
      <button onClick={handleApply} className="px-3 py-1 text-sm bg-blue-500 text-white rounded">
        应用
      </button>
    </div>
  );
}
```

- [ ] **Step 3: 在 App.tsx 中集成过滤状态**

- [ ] **Step 4: 验证构建**

Run: `cd web && npm run build`
Expected: 成功

---

## Task 6: 主题系统增强 — contrast 主题

**Covers:** 主题系统 (files.gallery 的 contrast 主题)

**Files:**
- Modify: `web/src/styles/global.css` (添加 contrast 主题样式)
- Modify: `web/src/hooks/useTheme.ts` (支持 contrast 主题)

- [ ] **Step 1: 在 global.css 中添加 contrast 主题**

```css
/* 在 global.css 末尾添加 */
[data-theme="contrast"] {
  --bg-primary: #000000;
  --bg-secondary: #1a1a1a;
  --text-primary: #ffffff;
  --text-secondary: #cccccc;
  --border-color: #333333;
  --accent-color: #4dabf7;
}

[data-theme="contrast"] body {
  background-color: var(--bg-primary);
  color: var(--text-primary);
}
```

- [ ] **Step 2: 修改 useTheme.ts 支持 contrast**

修改 `web/src/hooks/useTheme.ts`，在 themes 数组中添加 'contrast'。

- [ ] **Step 3: 验证构建**

Run: `cd web && npm run build`
Expected: 主题切换包含 contrast

---

## Task 7: 侧边栏增强

**Covers:** 侧边栏菜单系统

**Files:**
- Modify: `web/src/components/Sidebar.tsx` (深度控制、排序、状态持久化)

- [ ] **Step 1: 添加最大深度控制**

修改 `web/src/components/Sidebar.tsx`，根据配置限制递归深度。

- [ ] **Step 2: 添加排序选项**

在侧边栏添加排序按钮，支持 name/date, asc/desc。

- [ ] **Step 3: localStorage 状态持久化**

使用 localStorage 保存菜单展开/折叠状态。

- [ ] **Step 4: 验证构建**

Run: `cd web && npm run build`
Expected: 侧边栏功能增强

---

## Task 8: 文件复制功能

**Covers:** 文件管理操作

**Files:**
- Modify: `src/routes/files.ts` (添加复制 API)
- Modify: `src/services/r2.ts` (R2 复制操作)
- Modify: `web/src/api.ts` (前端 API)
- Modify: `web/src/components/BulkActions.tsx` (批量操作按钮)

- [ ] **Step 1: 后端添加复制 API**

修改 `src/routes/files.ts`，添加 `POST /api/copy` 端点，接受 source 和 target 参数。

- [ ] **Step 2: R2 复制操作**

修改 `src/services/r2.ts`，改进 copyObject 方法，确保原子性。

- [ ] **Step 3: 前端 API 函数**

修改 `web/src/api.ts`，添加 copyFile 函数。

- [ ] **Step 4: 批量操作按钮**

修改 `web/src/components/BulkActions.tsx`，添加复制按钮。

- [ ] **Step 5: 验证构建**

Run: `cd web && npm run build`
Expected: 复制功能可用

---

## Task 9: 文件重复功能

**Covers:** 文件管理操作

**Files:**
- Modify: `src/routes/files.ts` (添加重复 API)
- Modify: `web/src/api.ts` (前端 API)
- Modify: `web/src/components/BulkActions.tsx` (批量操作按钮)

- [ ] **Step 1: 后端添加重复 API**

修改 `src/routes/files.ts`，添加 `POST /api/duplicate` 端点，复制文件并自动重命名。

- [ ] **Step 2: 前端 API 函数**

修改 `web/src/api.ts`，添加 duplicateFile 函数。

- [ ] **Step 3: 批量操作按钮**

修改 `web/src/components/BulkActions.tsx`，添加重复按钮。

- [ ] **Step 4: 验证构建**

Run: `cd web && npm run build`
Expected: 重复功能可用

---

## Task 10: 文件夹 ZIP 下载

**Covers:** 下载功能

**Files:**
- Create: `web/src/utils/zip.ts` (JSZip 工具)
- Modify: `web/src/components/BulkActions.tsx` (ZIP 下载按钮)

- [ ] **Step 1: 安装 JSZip**

Run: `cd web && npm install jszip`
Expected: JSZip 安装成功

- [ ] **Step 2: 创建 ZIP 工具函数**

```typescript
// web/src/utils/zip.ts
import JSZip from 'jszip';

export async function downloadAsZip(files: { name: string; url: string }[], zipName: string) {
  const zip = new JSZip();
  
  for (const file of files) {
    const response = await fetch(file.url);
    const blob = await response.blob();
    zip.file(file.name, blob);
  }
  
  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = zipName;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 3: 在 BulkActions 中添加 ZIP 下载按钮**

- [ ] **Step 4: 验证构建**

Run: `cd web && npm run build`
Expected: ZIP 下载功能可用

---

## Task 11: Plyr 播放器集成

**Covers:** 媒体播放器系统

**Files:**
- Modify: `web/src/components/Lightbox.tsx` (替换原生播放器)
- Modify: `web/package.json` (添加 Plyr 依赖)

- [ ] **Step 1: 安装 Plyr**

Run: `cd web && npm install plyr`
Expected: Plyr 安装成功

- [ ] **Step 2: 修改 Lightbox 使用 Plyr**

修改 `web/src/components/Lightbox.tsx`，将原生 HTML5 播放器替换为 Plyr。

- [ ] **Step 3: 配置 Plyr 主题**

在 global.css 中添加 Plyr 样式覆盖，匹配应用主题。

- [ ] **Step 4: 验证构建**

Run: `cd web && npm run build`
Expected: Plyr 播放器正常工作

---

## Task 12: 独立音频播放器

**Covers:** 音频播放系统

**Files:**
- Create: `web/src/components/AudioPlayer.tsx`
- Modify: `web/src/App.tsx` (集成播放器)

- [ ] **Step 1: 创建 AudioPlayer 组件**

```tsx
// web/src/components/AudioPlayer.tsx
import React, { useState, useRef, useEffect } from 'react';
import Plyr from 'plyr';

interface AudioTrack {
  name: string;
  url: string;
  artist?: string;
  album?: string;
  cover?: string;
}

interface AudioPlayerProps {
  tracks: AudioTrack[];
  currentIndex: number;
  onTrackChange: (index: number) => void;
}

export default function AudioPlayer({ tracks, currentIndex, onTrackChange }: AudioPlayerProps) {
  const playerRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (playerRef.current) {
      const player = new Plyr(playerRef.current, {
        controls: ['play-progress', 'current-time', 'duration'],
        keyboard: { focused: true, global: true },
      });
      
      player.on('timeupdate', () => setCurrentTime(player.currentTime));
      player.on('loadedmetadata', () => setDuration(player.duration));
      player.on('play', () => setIsPlaying(true));
      player.on('pause', () => setIsPlaying(false));
      player.on('ended', () => {
        if (currentIndex < tracks.length - 1) {
          onTrackChange(currentIndex + 1);
        }
      });
      
      return () => player.destroy();
    }
  }, [currentIndex, tracks.length]);

  const track = tracks[currentIndex];
  if (!track) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-900 text-white p-4 z-50">
      <div className="max-w-4xl mx-auto flex items-center gap-4">
        {track.cover && (
          <img src={track.cover} alt="" className="w-12 h-12 rounded" />
        )}
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{track.name}</div>
          <div className="text-sm text-gray-400">{track.artist || 'Unknown'}</div>
        </div>
        <audio ref={playerRef} src={track.url} />
        <div className="flex items-center gap-2">
          <button
            onClick={() => onTrackChange(Math.max(0, currentIndex - 1))}
            disabled={currentIndex === 0}
            className="p-2 hover:bg-gray-700 rounded disabled:opacity-50"
          >
            ⏮
          </button>
          <button
            onClick={() => isPlaying ? playerRef.current?.pause() : playerRef.current?.play()}
            className="p-2 hover:bg-gray-700 rounded"
          >
            {isPlaying ? '⏸' : '▶️'}
          </button>
          <button
            onClick={() => onTrackChange(Math.min(tracks.length - 1, currentIndex + 1))}
            disabled={currentIndex === tracks.length - 1}
            className="p-2 hover:bg-gray-700 rounded disabled:opacity-50"
          >
            ⏭
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 在 App.tsx 中集成 AudioPlayer**

- [ ] **Step 3: 验证构建**

Run: `cd web && npm run build`
Expected: 音频播放器正常工作

---

## Task 13: Markdown 编辑器

**Covers:** 在线编辑功能

**Files:**
- Create: `web/src/components/MarkdownEditor.tsx`
- Modify: `web/package.json` (添加 marked 依赖)

- [ ] **Step 1: 安装依赖**

Run: `cd web && npm install marked @types/marked`
Expected: 依赖安装成功

- [ ] **Step 2: 创建 MarkdownEditor 组件**

```tsx
// web/src/components/MarkdownEditor.tsx
import React, { useState, useEffect } from 'react';
import { marked } from 'marked';

interface MarkdownEditorProps {
  content: string;
  onSave: (content: string) => void;
  onClose: () => void;
}

export default function MarkdownEditor({ content, onSave, onClose }: MarkdownEditorProps) {
  const [text, setText] = useState(content);
  const [mode, setMode] = useState<'edit' | 'preview' | 'split'>('split');

  const html = marked.parse(text) as string;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg w-full max-w-6xl h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-medium">Markdown 编辑器</h3>
          <div className="flex gap-2">
            <button
              onClick={() => setMode('edit')}
              className={`px-3 py-1 text-sm rounded ${mode === 'edit' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
            >
              编辑
            </button>
            <button
              onClick={() => setMode('preview')}
              className={`px-3 py-1 text-sm rounded ${mode === 'preview' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
            >
              预览
            </button>
            <button
              onClick={() => setMode('split')}
              className={`px-3 py-1 text-sm rounded ${mode === 'split' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
            >
              分屏
            </button>
          </div>
        </div>
        <div className="flex-1 flex overflow-hidden">
          {(mode === 'edit' || mode === 'split') && (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="flex-1 p-4 resize-none font-mono text-sm dark:bg-gray-800"
            />
          )}
          {(mode === 'preview' || mode === 'split') && (
            <div
              className="flex-1 p-4 overflow-auto prose dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
        </div>
        <div className="flex justify-end gap-2 p-4 border-t">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">
            取消
          </button>
          <button onClick={() => onSave(text)} className="px-4 py-2 bg-blue-500 text-white rounded">
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 在 Lightbox 中集成 Markdown 编辑器**

- [ ] **Step 4: 验证构建**

Run: `cd web && npm run build`
Expected: Markdown 编辑器正常工作

---

## Task 14: 代码/文本编辑器

**Covers:** 在线编辑功能

**Files:**
- Create: `web/src/components/CodeEditor.tsx`
- Modify: `web/package.json` (添加 @codemirror/* 依赖)

- [ ] **Step 1: 安装 CodeMirror**

Run: `cd web && npm install @codemirror/state @codemirror/view @codemirror/lang-javascript @codemirror/lang-python @codemirror/lang-markdown`
Expected: CodeMirror 安装成功

- [ ] **Step 2: 创建 CodeEditor 组件**

```tsx
// web/src/components/CodeEditor.tsx
import React, { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, basicSetup } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { markdown } from '@codemirror/lang-markdown';

interface CodeEditorProps {
  content: string;
  language: string;
  onSave: (content: string) => void;
  onClose: () => void;
}

const getLanguageExtension = (lang: string) => {
  switch (lang.toLowerCase()) {
    case 'js':
    case 'javascript':
    case 'ts':
    case 'typescript':
      return javascript();
    case 'py':
    case 'python':
      return python();
    case 'md':
    case 'markdown':
      return markdown();
    default:
      return javascript();
  }
};

export default function CodeEditor({ content, language, onSave, onClose }: CodeEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView>();

  useEffect(() => {
    if (editorRef.current) {
      const state = EditorState.create({
        doc: content,
        extensions: [
          basicSetup,
          getLanguageExtension(language),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              // 可以在这里添加实时保存逻辑
            }
          }),
        ],
      });
      
      viewRef.current = new EditorView({
        state,
        parent: editorRef.current,
      });
      
      return () => viewRef.current?.destroy();
    }
  }, [content, language]);

  const handleSave = () => {
    if (viewRef.current) {
      onSave(viewRef.current.state.doc.toString());
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg w-full max-w-6xl h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-medium">代码编辑器 - {language}</h3>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">
              取消
            </button>
            <button onClick={handleSave} className="px-4 py-2 bg-blue-500 text-white rounded">
              保存
            </button>
          </div>
        </div>
        <div ref={editorRef} className="flex-1 overflow-hidden" />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 在 Lightbox 中集成 CodeEditor**

- [ ] **Step 4: 验证构建**

Run: `cd web && npm run build`
Expected: 代码编辑器正常工作

---

## Task 15: 设置面板 UI

**Covers:** 管理界面

**Files:**
- Create: `web/src/components/SettingsPanel.tsx`
- Modify: `web/src/App.tsx` (路由)

- [ ] **Step 1: 创建 SettingsPanel 组件**

```tsx
// web/src/components/SettingsPanel.tsx
import React, { useState, useEffect } from 'react';
import { getSettings, saveSettings, getUsers, createUser, deleteUser } from '../api';

interface SettingsPanelProps {
  onClose: () => void;
}

export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [users, setUsers] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'settings' | 'users'>('settings');

  useEffect(() => {
    loadSettings();
    loadUsers();
  }, []);

  const loadSettings = async () => {
    const data = await getSettings();
    setSettings(data);
  };

  const loadUsers = async () => {
    const data = await getUsers();
    setUsers(data);
  };

  const handleSaveSettings = async () => {
    await saveSettings(settings);
    alert('设置已保存');
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg w-full max-w-4xl h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-medium">设置</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2 ${activeTab === 'settings' ? 'border-b-2 border-blue-500' : ''}`}
          >
            配置
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 ${activeTab === 'users' ? 'border-b-2 border-blue-500' : ''}`}
          >
            用户管理
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {activeTab === 'settings' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">根目录</label>
                <input
                  type="text"
                  value={settings.root || ''}
                  onChange={(e) => setSettings({ ...settings, root: e.target.value })}
                  className="w-full px-3 py-2 border rounded dark:bg-gray-800"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">默认布局</label>
                <select
                  value={settings.layout || 'grid'}
                  onChange={(e) => setSettings({ ...settings, layout: e.target.value })}
                  className="w-full px-3 py-2 border rounded dark:bg-gray-800"
                >
                  <option value="grid">网格</option>
                  <option value="list">列表</option>
                  <option value="rows">行</option>
                  <option value="columns">列</option>
                </select>
              </div>
              <button onClick={handleSaveSettings} className="px-4 py-2 bg-blue-500 text-white rounded">
                保存设置
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h4 className="font-medium">用户列表</h4>
                <button className="px-3 py-1 bg-green-500 text-white rounded text-sm">
                  添加用户
                </button>
              </div>
              <div className="space-y-2">
                {users.map((user) => (
                  <div key={user.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded">
                    <span>{user.username}</span>
                    <button
                      onClick={() => deleteUser(user.id)}
                      className="text-red-500 hover:text-red-700 text-sm"
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 在 App.tsx 中集成设置面板路由**

- [ ] **Step 3: 验证构建**

Run: `cd web && npm run build`
Expected: 设置面板正常工作

---

## Task 16: 分享链接 UI

**Covers:** 分享功能

**Files:**
- Create: `web/src/components/ShareDialog.tsx`
- Modify: `web/src/components/Lightbox.tsx` (添加分享按钮)

- [ ] **Step 1: 创建 ShareDialog 组件**

```tsx
// web/src/components/ShareDialog.tsx
import React, { useState } from 'react';
import { createShare } from '../api';

interface ShareDialogProps {
  filePath: string;
  onClose: () => void;
}

export default function ShareDialog({ filePath, onClose }: ShareDialogProps) {
  const [password, setPassword] = useState('');
  const [expiresIn, setExpiresIn] = useState<number | null>(null);
  const [shareUrl, setShareUrl] = useState('');

  const handleCreate = async () => {
    const share = await createShare(filePath, password || undefined, expiresIn || undefined);
    setShareUrl(`${window.location.origin}/share/${share.id}`);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    alert('链接已复制');
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg w-full max-w-md p-6">
        <h3 className="text-lg font-medium mb-4">创建分享链接</h3>
        {!shareUrl ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">密码保护 (可选)</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border rounded dark:bg-gray-800"
                placeholder="留空则无密码"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">有效期 (可选)</label>
              <select
                value={expiresIn || ''}
                onChange={(e) => setExpiresIn(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-2 border rounded dark:bg-gray-800"
              >
                <option value="">永不过期</option>
                <option value="3600">1小时</option>
                <option value="86400">1天</option>
                <option value="604800">7天</option>
                <option value="2592000">30天</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">
                取消
              </button>
              <button onClick={handleCreate} className="px-4 py-2 bg-blue-500 text-white rounded">
                创建链接
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded text-sm break-all">
              {shareUrl}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={handleCopy} className="px-4 py-2 bg-blue-500 text-white rounded">
                复制链接
              </button>
              <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">
                关闭
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 在 Lightbox 中添加分享按钮**

- [ ] **Step 3: 验证构建**

Run: `cd web && npm run build`
Expected: 分享功能正常工作

---

## Task 17: 国际化 (i18n)

**Covers:** 国际化系统

**Files:**
- Create: `web/src/i18n/` 目录
- Create: `web/src/i18n/index.ts`
- Create: `web/src/i18n/locales/zh-CN.json`
- Create: `web/src/i18n/locales/en.json`
- Modify: `web/package.json` (添加 react-i18next 依赖)

- [ ] **Step 1: 安装 react-i18next**

Run: `cd web && npm install react-i18next i18next`
Expected: 依赖安装成功

- [ ] **Step 2: 创建 i18n 配置**

```typescript
// web/src/i18n/index.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhCN from './locales/zh-CN.json';
import en from './locales/en.json';

i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
    en: { translation: en },
  },
  lng: localStorage.getItem('language') || 'zh-CN',
  fallbackLng: 'zh-CN',
  interpolation: { escapeValue: false },
});

export default i18n;
```

- [ ] **Step 3: 创建翻译文件**

创建 `web/src/i18n/locales/zh-CN.json` 和 `web/src/i18n/locales/en.json`。

- [ ] **Step 4: 在 main.tsx 中导入 i18n**

- [ ] **Step 5: 在组件中使用 useTranslation**

- [ ] **Step 6: 验证构建**

Run: `cd web && npm run build`
Expected: 国际化正常工作

---

## Task 18: 全景查看器

**Covers:** 全景图片查看

**Files:**
- Create: `web/src/components/PanoramaViewer.tsx`
- Modify: `web/src/components/Lightbox.tsx` (检测全景图片)

- [ ] **Step 1: 创建 PanoramaViewer 组件**

```tsx
// web/src/components/PanoramaViewer.tsx
import React, { useRef, useEffect } from 'react';

interface PanoramaViewerProps {
  src: string;
  onClose: () => void;
}

export default function PanoramaViewer({ src, onClose }: PanoramaViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseDown = (e: MouseEvent) => {
      isDragging.current = true;
      startX.current = e.pageX - container.offsetLeft;
      scrollLeft.current = container.scrollLeft;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      e.preventDefault();
      const x = e.pageX - container.offsetLeft;
      const walk = (x - startX.current) * 2;
      container.scrollLeft = scrollLeft.current - walk;
    };

    const handleMouseUp = () => {
      isDragging.current = false;
    };

    container.addEventListener('mousedown', handleMouseDown);
    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('mouseleave', handleMouseUp);

    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('mouseleave', handleMouseUp);
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black z-50">
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white text-2xl z-10 hover:bg-white/20 rounded-full w-10 h-10"
      >
        ✕
      </button>
      <div
        ref={containerRef}
        className="w-full h-full overflow-x-auto overflow-y-hidden cursor-grab active:cursor-grabbing"
      >
        <img
          src={src}
          alt="全景图"
          className="h-full"
          draggable={false}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 在 Lightbox 中检测 2:1 比例图片并启用全景模式**

- [ ] **Step 3: 验证构建**

Run: `cd web && npm run build`
Expected: 全景查看器正常工作

---

## Task 19: 自定义 CSS/JS 加载

**Covers:** 自定义扩展

**Files:**
- Modify: `web/src/App.tsx` (运行时加载自定义资源)

- [ ] **Step 1: 在 App.tsx 中添加自定义 CSS/JS 加载逻辑**

```typescript
// 在 App.tsx 的 useEffect 中添加
useEffect(() => {
  // 加载自定义 CSS
  const customCSS = localStorage.getItem('customCSS');
  if (customCSS) {
    const style = document.createElement('style');
    style.textContent = customCSS;
    document.head.appendChild(style);
  }

  // 加载自定义 JS
  const customJS = localStorage.getItem('customJS');
  if (customJS) {
    const script = document.createElement('script');
    script.textContent = customJS;
    document.body.appendChild(script);
  }
}, []);
```

- [ ] **Step 2: 在设置面板中添加自定义 CSS/JS 编辑器**

- [ ] **Step 3: 验证构建**

Run: `cd web && npm run build`
Expected: 自定义 CSS/JS 加载正常

---

## Task 20: Demo 模式

**Covers:** 演示模式

**Files:**
- Modify: `src/index.ts` (检查 demo 模式)
- Modify: `wrangler.toml` (添加 DEMO_MODE 变量)

- [ ] **Step 1: 在 wrangler.toml 中添加 DEMO_MODE 变量**

```toml
[vars]
DEMO_MODE = "false"
```

- [ ] **Step 2: 在后端添加 demo 模式检查**

修改 `src/index.ts`，在写操作 API 前检查 DEMO_MODE 环境变量。

- [ ] **Step 3: 在前端显示 demo 模式提示**

- [ ] **Step 4: 验证构建**

Run: `npm run build:web && npm run deploy`
Expected: Demo 模式正常工作

---

## Task 21: 缓存管理

**Covers:** 缓存系统

**Files:**
- Modify: `src/services/db.ts` (缓存清理)
- Create: `src/routes/admin.ts` (缓存管理 API)

- [ ] **Step 1: 添加缓存清理 API**

在 `src/routes/admin.ts` 中添加 `POST /admin/clean-cache` 端点。

- [ ] **Step 2: 实现过期缓存清理逻辑**

- [ ] **Step 3: 在设置面板中添加缓存管理按钮**

- [ ] **Step 4: 验证构建**

Run: `npm run build:web && npm run deploy`
Expected: 缓存管理正常工作

---

## Task 22: 诊断页面

**Covers:** 系统诊断

**Files:**
- Create: `web/src/components/Diagnostics.tsx`
- Modify: `src/routes/admin.ts` (诊断 API)

- [ ] **Step 1: 创建诊断 API**

在 `src/routes/admin.ts` 中添加 `GET /admin/diagnostics` 端点，返回系统信息。

- [ ] **Step 2: 创建 Diagnostics 组件**

```tsx
// web/src/components/Diagnostics.tsx
import React, { useState, useEffect } from 'react';
import { getDiagnostics } from '../api';

interface DiagnosticsProps {
  onClose: () => void;
}

export default function Diagnostics({ onClose }: DiagnosticsProps) {
  const [info, setInfo] = useState<any>(null);

  useEffect(() => {
    loadDiagnostics();
  }, []);

  const loadDiagnostics = async () => {
    const data = await getDiagnostics();
    setInfo(data);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg w-full max-w-2xl h-[80vh] overflow-auto">
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white dark:bg-gray-900">
          <h3 className="font-medium">系统诊断</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>
        <div className="p-4 space-y-4">
          {info ? (
            <pre className="text-sm bg-gray-100 dark:bg-gray-800 p-4 rounded overflow-auto">
              {JSON.stringify(info, null, 2)}
            </pre>
          ) : (
            <div className="text-center py-8">加载中...</div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 在设置面板中添加诊断入口**

- [ ] **Step 4: 验证构建**

Run: `npm run build:web && npm run deploy`
Expected: 诊断页面正常工作

---

## Task 23: YouTube/Vimeo 嵌入

**Covers:** 嵌入播放

**Files:**
- Modify: `web/src/components/Lightbox.tsx` (嵌入播放器)

- [ ] **Step 1: 在 Lightbox 中添加嵌入播放支持**

检测 YouTube/Vimeo URL，使用 iframe 嵌入播放。

- [ ] **Step 2: 添加 .url 文件解析**

- [ ] **Step 3: 验证构建**

Run: `cd web && npm run build`
Expected: 嵌入播放正常工作

---

## Task 24: 图片上传增强

**Covers:** 上传功能

**Files:**
- Modify: `web/src/components/UploadZone.tsx` (上传增强)

- [ ] **Step 1: 添加上传进度条**

- [ ] **Step 2: 添加文件类型过滤**

- [ ] **Step 3: 添加文件大小限制显示**

- [ ] **Step 4: 验证构建**

Run: `cd web && npm run build`
Expected: 上传体验增强

---

## Task 25: 批量操作扩展

**Covers:** 批量操作

**Files:**
- Modify: `web/src/components/BulkActions.tsx` (添加更多操作)

- [ ] **Step 1: 添加批量移动按钮**

- [ ] **Step 2: 添加批量复制按钮**

- [ ] **Step 3: 添加批量 ZIP 下载按钮**

- [ ] **Step 4: 验证构建**

Run: `cd web && npm run build`
Expected: 批量操作功能完整

---

## 最终验证

完成所有 Task 后，执行以下验证：

1. **构建验证**
   Run: `npm run build:web`
   Expected: 无 TypeScript 错误

2. **本地开发测试**
   Run: `npm run dev`
   Expected: 所有功能正常工作

3. **部署测试**
   Run: `npm run deploy`
   Expected: 成功部署到 Cloudflare Workers

4. **功能完整性检查**
   - 6 种布局: grid, list, imagelist, blocks, rows, columns
   - 排序: name, kind, size, date, shuffle
   - 过滤: files_include, files_exclude, dirs_include, dirs_exclude
   - 文件管理: 上传, 下载, 删除, 重命名, 移动, 复制, 重复
   - ZIP: 创建, 解压, 下载
   - 播放器: Plyr (视频/音频), HLS, YouTube/Vimeo 嵌入
   - 编辑器: Markdown, Code/文本
   - 主题: dark, light, contrast
   - 国际化: zh-CN, en (可扩展)
   - 设置面板: 配置编辑, 用户管理
   - 分享: 创建链接, 密码保护, 有效期
   - 诊断: 系统信息显示
   - 缓存管理: 清理过期缓存
   - 全景查看: 2:1 图片查看
   - 自定义 CSS/JS: 运行时加载
   - Demo 模式: 阻止写操作
