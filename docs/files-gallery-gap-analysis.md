# files.gallery 功能差距分析

## 对比总结

| 维度 | files.gallery | r2-gallery | 差距 |
|------|--------------|------------|------|
| 文件浏览 | ✅ 完整 | ✅ 完整 | 无 |
| 文件管理操作 | ✅ 完整 | ✅ 完整 | 无 |
| 图片缩略图 | ✅ GD/ImageMagick + 视频/PDF缩略图 | ✅ @jsquash WASM | 缺视频/PDF缩略图 |
| 音频播放器 | ✅ 完整播放列表+ID3+迷你模式 | ❌ 无 | **大差距** |
| 多用户权限 | ✅ 细粒度权限 | ⚠️ 仅admin/user | **大差距** |
| 文本编辑 | ✅ 浏览器内编辑 | ❌ 无 | 中等差距 |
| ZIP打包/解压 | ✅ 支持 | ❌ 无 | 中等差距 |
| 上传限制 | ✅ 文件类型+大小限制 | ❌ 无 | 中等差距 |
| 文件夹预览图 | ✅ 支持 | ⚠️ 仅API | 小差距 |
| 批量下载链接 | ✅ mass_copy_links | ❌ 无 | 小差距 |
| 设置编辑器 | ✅ 浏览器内 | ⚠️ 仅admin面板 | 小差距 |
| 诊断页面 | ✅ 完整 | ⚠️ 仅admin API | 小差距 |
| 国际化 | ✅ 30语言 | ⚠️ i18next已配置 | 需补充语言 |
| CSS自定义 | ✅ 自定义CSS | ❌ 无 | 小差距 |
| 图片格式转换 | ✅ HEIC/PSD/TIFF/DNG | ❌ 无 | 中等差距 |
| 视频缩略图 | ✅ FFmpeg | ❌ 无 | 中等差距 |
| PDF缩略图 | ✅ ImageMagick+Ghostscript | ❌ 无 | 小差距 |
| 上传冲突处理 | ✅ increment策略 | ❌ 无 | 小差距 |

---

## 详细差距分析

### 1. 音频播放器 (大差距)

**files.gallery 功能:**
- 从当前文件夹自动加载播放列表
- 全局音频播放器（跨文件夹播放）
- ID3标签解析（标题、艺术家、专辑）
- 专辑封面显示
- 迷你播放器模式
- 洗牌/循环播放
- 下一首/上一首导航
- 滚动时自动隐藏
- LocalStorage状态持久化
- 标题模板系统（%title%, %artist%, %album%）
- 基于Plyr播放器

**r2-gallery 现状:**
- 有AudioPlayer组件，但功能有限
- 有VideoPlayer和HlsPlayer
- 无播放列表功能
- 无ID3标签
- 无专辑封面

**需要实现:**
- [ ] 完整的音频播放列表系统
- [ ] ID3标签解析（jsmediatags已安装）
- [ ] 专辑封面提取和显示
- [ ] 迷你播放器模式
- [ ] 洗牌/循环/导航控制
- [ ] 滚动自动隐藏
- [ ] 状态持久化

### 2. 多用户权限系统 (大差距)

**files.gallery 功能:**
- 每个用户独立配置
- 细粒度权限: allow_upload, allow_delete, allow_rename, allow_settings, allow_all, allow_zip, allow_move, allow_copy, allow_duplicate, allow_text_edit, allow_mass_download, allow_mass_copy_links
- 每个用户独立根目录 (root)
- 每个用户文件可见性过滤 (files_include, files_exclude, dirs_include, dirs_exclude)
- 每个用户上传限制 (upload_allowed_file_types, upload_max_filesize)
- 每个用户起始路径 (start_path)
- 用户重命名/删除
- 用户管理界面

**r2-gallery 现状:**
- users表有role字段（admin/user）
- authMiddleware检查登录
- ensureAdmin检查管理员
- 无细粒度权限

**需要实现:**
- [ ] 扩展users表添加权限字段
- [ ] 权限中间件系统
- [ ] 用户管理界面（创建/编辑/删除用户）
- [ ] 每用户根目录和文件过滤
- [ ] 每用户上传限制

### 3. 文本文件编辑 (中等差距)

**files.gallery 功能:**
- allow_text_edit权限控制
- 浏览器内编辑文本文件
- 保存到服务器

**r2-gallery 现状:**
- 有CodeEditor组件（语法高亮）
- 有MarkdownEditor组件（预览）
- 无保存功能

**需要实现:**
- [ ] 文件保存API端点 (PUT /api/file)
- [ ] 编辑器工具栏添加保存按钮
- [ ] 权限控制

### 4. ZIP打包/解压 (中等差距)

**files.gallery 功能:**
- allow_zip: 选择文件打包下载ZIP
- allow_unzip: 上传ZIP自动解压
- 浏览器端ZIP创建

**r2-gallery 现状:**
- 有zip.ts工具文件
- 无ZIP打包下载功能
- 无ZIP解压功能

**需要实现:**
- [ ] 批量选择→ZIP打包下载
- [ ] ZIP上传→自动解压选项
- [ ] JSZip已安装

### 5. 上传限制配置 (中等差距)

**files.gallery 功能:**
- upload_allowed_file_types: 允许的文件扩展名
- upload_max_filesize: 最大文件大小（字节）
- upload_exists: 文件存在时的处理策略（increment/rename/overwrite）

**r2-gallery 现状:**
- 无上传限制
- 无文件存在检查

**需要实现:**
- [ ] settings表添加上传限制配置
- [ ] 上传时检查文件类型和大小
- [ ] 文件存在时的处理策略

### 6. 文件夹预览图 (小差距)

**files.gallery 功能:**
- folder_preview_image: 文件夹显示预览图
- folder_preview_default: 默认预览图文件名
- 自动从文件夹内第一张图片生成

**r2-gallery 现状:**
- API端点 /api/thumbnail 存在
- useFolderThumbnails hook存在
- 但在FileGrid中未显示文件夹预览图

**需要实现:**
- [ ] FileGrid中文件夹显示预览图
- [ ] 配置选项

### 7. 图片格式转换 (中等差距)

**files.gallery 功能:**
- HEIC/HEIF/TIFF/PSD/DNG → JPEG转换
- ImageMagick或PHP Imagick扩展
- 自动检测并转换浏览器不支持的格式

**r2-gallery 现状:**
- @jsquash/* WASM库支持JPEG/PNG/WebP/resize
- 无HEIC/HEIF/TIFF/PSD/DNG支持

**需要实现:**
- [ ] 检测不支持的图片格式
- [ ] 转换为WebP/JPEG后提供
- [ ] 需要额外的WASM库或服务

### 8. 视频/PDF缩略图 (中等差距)

**files.gallery 功能:**
- FFmpeg生成视频缩略图
- ImageMagick+Ghostscript生成PDF缩略图
- 缓存到文件系统

**r2-gallery 现状:**
- 仅支持图片缩略图（@jsquash WASM）
- 视频和PDF无缩略图

**需要实现:**
- [ ] 视频缩略图（需要外部服务或CF Worker限制）
- [ ] PDF缩略图（需要PDF.js或类似方案）

### 9. 批量操作增强 (小差距)

**files.gallery 功能:**
- allow_mass_download: 批量下载（ZIP打包）
- allow_mass_copy_links: 批量复制链接
- allow_move: 批量移动
- allow_copy: 批量复制
- allow_duplicate: 批量复制

**r2-gallery 现状:**
- 有批量删除
- 有批量下载（逐个下载）
- 有批量重命名
- 无批量移动/复制
- 无批量复制链接

**需要实现:**
- [ ] 批量移动
- [ ] 批量复制
- [ ] 批量复制链接
- [ ] ZIP打包下载替代逐个下载

### 10. 设置编辑器 (小差距)

**files.gallery 功能:**
- 浏览器内设置编辑器
- 用户管理界面
- 配置模板

**r2-gallery 现状:**
- admin/settings API存在
- admin/users API存在
- SettingsPanel组件存在
- 但功能可能不完整

**需要实现:**
- [ ] 完善SettingsPanel功能
- [ ] 用户管理界面
- [ ] 上传限制配置UI

### 11. 上传冲突处理 (小差距)

**files.gallery 功能:**
- upload_exists: 'increment' | 'rename' | 'overwrite'
- 自动处理同名文件

**r2-gallery 现状:**
- 无冲突处理
- 直接覆盖

**需要实现:**
- [ ] 检查文件是否存在
- [ ] 根据策略处理（递增数字后缀/重命名/覆盖）

### 12. 国际化完善 (小差距)

**files.gallery 功能:**
- 30种语言
- 自动浏览器语言检测
- 语言切换UI

**r2-gallery 现状:**
- i18next已配置
- 有i18n.ts
- 中文界面硬编码在组件中

**需要实现:**
- [ ] 提取硬编码字符串到i18n
- [ ] 添加更多语言
- [ ] 语言切换UI

### 13. CSS自定义 (小差距)

**files.gallery 功能:**
- _files/css/custom.css
- 每用户自定义CSS
- data-username属性选择器

**r2-gallery 现状:**
- 无自定义CSS支持

**需要实现:**
- [ ] 自定义CSS注入
- [ ] 每用户CSS配置

### 14. 诊断页面 (小差距)

**files.gallery 功能:**
- ?action=tests 完整诊断
- PHP版本、扩展检查
- 路径检查
- 配置验证

**r2-gallery 现状:**
- admin/diagnostics API存在
- 无前端诊断页面

**需要实现:**
- [ ] 诊断页面UI
- [ ] 环境检查
- [ ] 配置验证

---

## 实现优先级

### P0 - 核心功能（必须实现）
1. 音频播放器系统
2. 文本文件编辑保存
3. ZIP打包下载
4. 文件夹预览图显示

### P1 - 重要功能
5. 多用户权限系统
6. 上传限制配置
7. 上传冲突处理
8. 批量操作增强

### P2 - 增强功能
9. 图片格式转换
10. 视频/PDF缩略图
11. 设置编辑器完善
12. 诊断页面

### P3 - 锦上添花
13. 国际化完善
14. CSS自定义
15. 批量复制链接
