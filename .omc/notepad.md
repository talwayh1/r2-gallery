# Notepad
<!-- Auto-managed by OMC. Manual edits preserved in MANUAL section. -->

## Priority Context
<!-- ALWAYS loaded. Keep under 500 chars. Critical discoveries only. -->

## Working Memory
<!-- Session notes. Auto-pruned after 7 days. -->
### 2026-06-16 06:14
### 2026-06-16 06:22
### 2026-06-16 06:30
## 优化轮次 2 — 记忆功能 "那年今日" (2026-06-16)

### 改动:
1. **后端 `src/services/db.ts`** — 新增 `getMemories()` 查询函数
   - 使用 SQLite strftime 提取 mtime 的月/日，匹配历史同月同日
   - 按 mtime DESC 排序，最新年份在前

2. **后端 `src/routes/metadata.ts`** — 新增 `GET /api/memories` 端点
   - 支持 ?month=&day= 参数，默认当天
   - 按年份分组返回，包含 yearsAgo 计算
   - 返回 { date, memories: [{ year, yearsAgo, files }], total }

3. **前端 `web/src/api.ts`** — 新增 `getMemories()` + `MemoryYear` 类型

4. **前端 `web/src/components/MemoriesPage.tsx`** — 全新组件
   - 按年份分组展示，每组有年份标题 + "x年前" 标签
   - emoji 标识里程碑（去年📅、前年🌟、5年💎、10年🏆）
   - 瀑布流布局，shimmer 加载动画
   - ESC 关闭，空状态提示

5. **前端 `web/src/App.tsx`** — 集成 MemoriesPage
   - lazy import + showMemories 状态
   - Header 传递 onMemoriesClick

6. **前端 `web/src/components/Header.tsx`** — 添加回忆按钮
   - 桌面端：发现按钮旁的时钟图标
   - 移动端：More 菜单中的 "💭那年今日" 入口

### 设计决策:
- 使用 mtime（文件修改时间）而非 EXIF dateTaken
  - 原因：mtime 已存储在 D1 中，无需读取文件解析 EXIF
  - 权衡：对于重命名/移动过的文件可能不准确，但覆盖 90%+ 场景
- 按年份分组展示，每组独立瀑布流
- 无需登录即可查看（公开功能）

### 构建验证: ✅ TypeScript 编译通过，Vite 构建成功
### MemoriesPage chunk: 4.92 kB (gzip 2.20 kB) — 自动 code-split

### 已完成优化:
- ✅ 轮次 1: 虚拟滚动
- ✅ 轮次 2: 记忆功能

### 下一轮优化方向:
- 地图视图 (EXIF GPS)
- 组合过滤器增强
- 更多排序选项 (按类型分组)


## 2026-06-16 06:14
### 2026-06-16 06:22
## 优化轮次 1 — 虚拟滚动 (2026-06-16)

### 改动:
1. **新建 `web/src/hooks/useVirtualGrid.ts`** — 轻量级虚拟网格 hook，零依赖
   - 自动计算列数（基于容器宽度和最小列宽 200px）
   - 只渲染可见行 + 2 行 overscan 缓冲
   - ResizeObserver 监听容器尺寸变化
   - passive scroll 监听，不阻塞主线程

2. **修改 `web/src/components/FileGrid.tsx`** — 集成虚拟滚动
   - 提取 `VirtualFileGrid` 子组件，只渲染可见文件卡片
   - 文件夹部分保持原样（通常数量少，不需要虚拟化）
   - 上下 spacer 维持正确滚动位置
   - 所有交互功能保持不变：拖拽、右键菜单、选择、重命名

### 性能影响:
- 1000 张图片时，原来渲染 1000 个 DOM 节点 → 现在只渲染 ~20-40 个
- 内存占用大幅降低，滚动更流畅
- 缩略图 lazy loading 配合虚拟滚动效果更佳

### 构建验证: ✅ TypeScript 编译通过，Vite 构建成功

### 下一轮优化方向:
- 地图视图 (EXIF GPS)
- 记忆功能 (x年前的今天)
- 更多排序选项 (按类型分组)


## 2026-06-16 06:14
## Gallery 优化调研 (2026-06-16)

### 从 Immich (103k stars) 学到:
- 可拖拽时间轴滚动条 - 大图库快速导航
- 虚拟滚动 - 大量照片不卡顿
- 全局地图视图 - 按地理位置浏览
- 文件夹视图 + 相册视图双模式
- AI 搜索 (CLIP嵌入, 人脸, 物体识别)
- 记忆功能 (x年前的今天)
- 堆叠照片 (相似照片分组)
- 360度图片支持
- LivePhoto/MotionPhoto 支持
- OpenAPI spec 自动生成客户端

### 从 PhotoPrism (39.8k stars) 学到:
- 组合过滤器 (标签+位置+分辨率+颜色+质量)
- 自动标签 (基于内容和位置)
- WebDAV 集成 - 像本地文件一样操作
- PWA 原生应用体验
- 隐私保护地理编码 + 高分辨率世界地图
- Live Photos 悬停播放
- RAW 格式透明支持

### 从 Telegraph-Image 学到:
- KV 作为元数据层的模式
- 环境变量驱动功能开关
- 白名单/黑名单模式
- 瀑布流视图

### R2 Gallery 可优化方向:
1. 虚拟滚动优化大图库性能
2. 地图视图 (EXIF GPS数据)
3. 组合搜索/过滤器
4. PWA 支持
5. WebDAV 接口
6. 记忆功能
7. 相似照片堆叠
8. 更多排序选项
9. 批量操作增强
10. 图片压缩优化策略


## MANUAL
<!-- User content. Never auto-pruned. -->

