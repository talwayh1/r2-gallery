# files.gallery 100% 细节复刻差距分析 (已更新)

> 最后更新: 2026-06-22
> 本文件追踪 r2-gallery 与 files.gallery 之间仍存的差距。

## ✅ 已实现

| 项目 | 状态 | 备注 |
|------|------|------|
| 1. 布局选择器 | ✅ | 6 种布局 (grid, rows, list, imagelist, blocks, columns)，Header 下拉菜单 |
| 2. 排序选项 | ✅ | 5 种排序: name, size, mtime, kind, shuffle |
| 3. 类型筛选 | ✅ | 5 种筛选: all, image, video, audio, document |
| 4. 右键菜单 | ✅ | 含 move, copy, duplicate, download, zip 解压等 |
| 5. 文件夹下载 ZIP | ✅ | 右键菜单 + SettingsPanel 可选 ZIP 压缩 |
| 6. 上传冲突处理 | ✅ | ZPan 风格: increment/overwrite/fail，SettingsPanel 可配置 |
| 7. 面包屑导航 | ✅ | 含上级目录 `..` 按钮 + 目录操作下拉菜单 |
| 8. 设置编辑器 UI | ✅ | SettingsPanel 完整，含上传限制、缓存、用户管理 |
| 9. 快捷键支持 | ✅ | Lightbox 操控/键盘导航/Shift+Arrow 跳转 |
| 10. 移动端适配 | ✅ | 自适应布局、触摸滑动、底部工具栏 |
| 11. 缩略图加载 | ✅ | SafeThumb + useSafeImage hook, shimmer skeleton, priority |

## ❌ 仍存差距

| # | 项目 | 优先级 | 复杂度 | 说明 |
|---|------|--------|--------|------|
| 1 | 批量复制链接 | 中 | 低 | select mode 中增加 "批量复制链接" 按钮，复制所有选中文件的 URL |
| 2 | 文件夹排序 | 低 | 中 | 文件夹固定按名称排，未像文件一样支持 name/date 排序 |
| 3 | 国际化扩展 | 低 | 中 | 当前只有 4 种语言，files.gallery 有 30 种 |
| 4 | 诊断页面 | 低 | 高 | frontend diagnostics page for ?action=tests |
| 5 | Google Docs 查看器 | 低 | 中 | Office 文件 (doc/xls/ppt) 在线预览，当前仅用 Google Docs Viewer iframe |
| 6 | 全局音频播放器 | 低 | 高 | 迷你模式/跨页面播放 |
| 7 | CSS 自定义 | 低 | 中 | 注入自定义 CSS |
| 8 | 批量复制链接 | 中 | 低 | 选中多个文件后一键复制所有链接 |

## 建议优先处理

1. **批量复制链接** — 选中最直接的小功能，select mode 已有基础 (selected Set)，只需在底部栏加按钮
2. **文件夹排序** — FileList/FileGrid 等组件中让文件夹也响应 sortOrder
