# files.gallery 100% 细节复刻差距分析

## UI/UX 细节差距

### 1. 布局选择器 ❌
- files.gallery: 下拉菜单选择 6 种布局 (list, imagelist, blocks, grid, rows, columns)
- r2-gallery: 仅 toggle 按钮切换 grid/rows，其他 4 种布局组件存在但未接入

### 2. 排序选项 ❌
- files.gallery: name, size, date, kind, shuffle (5种)
- r2-gallery: name, size, mtime (3种) — 缺 kind 和 shuffle

### 3. 类型筛选 ❌
- files.gallery: all, image, video, audio, document (5种)
- r2-gallery: all, image, video, audio (4种) — 缺 document

### 4. 右键菜单 ❌
- files.gallery: download, copy link, copy direct link, move, copy, duplicate, rename, share, delete
- r2-gallery: download, copy link, copy direct link, duplicate, rename, share, delete — 缺 move, copy

### 5. 文件夹下载 ❌
- files.gallery: 下载整个文件夹为 ZIP
- r2-gallery: 无此功能

### 6. 批量复制链接 ❌
- files.gallery: mass_copy_links — 批量复制所有选中文件的链接
- r2-gallery: 无此功能

### 7. 设置编辑器 UI ❌
- files.gallery: 浏览器内编辑配置、用户管理
- r2-gallery: SettingsPanel 存在但功能不完整

### 8. 诊断页面 ❌
- files.gallery: ?action=tests 完整诊断
- r2-gallery: 仅 API，无前端页面

### 9. Google Docs 查看器 ❌
- files.gallery: 支持 doc/xls/ppt/csv 在线预览
- r2-gallery: 无此功能

### 10. 上传冲突处理 ❌
- files.gallery: upload_exists: increment/overwrite/fail
- r2-gallery: 直接覆盖，无提示

### 11. 面包屑导航 ❌
- files.gallery: 可点击面包屑，支持快速跳转
- r2-gallery: 有面包屑但缺少"上级目录"按钮

### 12. 文件夹排序 ❌
- files.gallery: 菜单中文件夹可按 name/date 排序
- r2-gallery: 文件夹固定按名称排序

### 13. 音频播放器增强 ❌
- files.gallery: 全局播放器、专辑封面、迷你模式、ID3
- r2-gallery: 已实现大部分，但缺少全局播放器模式

### 14. 国际化 ❌
- files.gallery: 30 种语言
- r2-gallery: 4 种语言 (zh-CN, en, ja, ko)

### 15. CSS 自定义 ❌
- files.gallery: 自定义 CSS 注入
- r2-gallery: 无此功能
