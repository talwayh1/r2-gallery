# files.gallery 100% 细节复刻差距分析 (已更新)

> 最后更新: 2026-06-22
> 本文件追踪 r2-gallery 与 files.gallery 之间仍存的差距。

## ✅ 已实现

| 项目 | 状态 | 备注 |
|------|------|------|
| 1. 布局选择器 | ✅ | 6 种布局 (grid, rows, list, imagelist, blocks, columns)，Header 下拉菜单 |
| 2. 排序选项 | ✅ | 5 种排序: name, size, mtime, kind, shuffle；文件夹也响应排序 |
| 3. 类型筛选 | ✅ | 5 种筛选: all, image, video, audio, document |
| 4. 右键菜单 | ✅ | 含 move, copy, duplicate, download, zip 解压等 |
| 5. 文件夹下载 ZIP | ✅ | 右键菜单 + SettingsPanel 可选 ZIP 压缩 |
| 6. 上传冲突处理 | ✅ | ZPan 风格: increment/overwrite/fail，SettingsPanel 可配置 |
| 7. 面包屑导航 | ✅ | 含上级目录 `..` 按钮 + 目录操作下拉菜单 |
| 8. 设置编辑器 UI | ✅ | SettingsPanel 完整，含上传限制、缓存、用户管理 |
| 9. 快捷键支持 | ✅ | Lightbox 操控/键盘导航/Shift+Arrow 跳转 |
| 10. 移动端适配 | ✅ | 自适应布局、触摸滑动、底部工具栏 |
| 11. 缩略图加载 | ✅ | SafeThumb + useSafeImage hook, shimmer skeleton, priority |
| 12. 批量复制链接 | ✅ | select mode + BulkActions"批量复制链接/直链"按钮 |
| 13. TypeScript 类型修复 | ✅ | 后端 22+ 类型错误全部修复 (AppBindings, bind(), Hono 重载) |

## ❌ 仍存差距

| # | 项目 | 优先级 | 复杂度 | 说明 |
|---|------|--------|--------|------|
| 1 | 国际化扩展 | 低 | 高 | 当前只有 4 种语言，files.gallery 有 30 种 |
| 2 | Google Docs 查看器 | 低 | 中 | Office 文件 (doc/xls/ppt) 在线预览，当前仅用 Google Docs Viewer iframe |
| 3 | 全局音频播放器 | 低 | 高 | 迷你模式/跨页面播放（已有 AudioPlayer 组件，但无迷你跨页模式） |
| 4 | HEIC/PSD/TIFF/DNG 转换 | 低 | 高 | 需要 WASM (libvips/libheif) 编译到 Worker |
| 5 | 视频/PDF 缩略图 | 低 | 高 | 需要 ffmpeg WASM 或外部服务 |

## 建议优先处理

1. **国际化扩展** — 提取硬编码字符串到 i18n 文件，增加中/英/日/韩以外语言
2. **HEIC/PSD/TIFF/DNG 转换** — 浏览器端 WASM 或 Worker 端转换
