export type Locale = 'zh-CN' | 'en';

const translations: Record<Locale, Record<string, string>> = {
  'zh-CN': {
    // Navigation
    'nav.home': 'R2 Gallery',
    'nav.back': '返回',
    'nav.refresh': '刷新',

    // File operations
    'file.download': '下载',
    'file.delete': '删除',
    'file.rename': '重命名',
    'file.copy': '复制文件',
    'file.copyLink': '复制链接',
    'file.copyDirectLink': '复制直链',
    'file.move': '移动',
    'file.duplicate': '复制文件',
    'file.createFolder': '新建文件夹',
    'file.upload': '上传',

    // Layout
    'layout.grid': '网格视图',
    'layout.list': '列表视图',
    'layout.rows': '行视图',
    'layout.columns': '列视图',
    'layout.blocks': '块视图',
    'layout.imagelist': '图片列表',

    // Sort
    'sort.name': '名称',
    'sort.size': '大小',
    'sort.date': '日期',
    'sort.kind': '类型',
    'sort.shuffle': '随机',
    'sort.asc': '升序',
    'sort.desc': '降序',

    // Filter
    'filter.all': '全部',
    'filter.image': '图片',
    'filter.video': '视频',
    'filter.audio': '音频',
    'filter.document': '文档',

    // Actions
    'action.search': '搜索...',
    'action.select': '选择',
    'action.selectAll': '全选',
    'action.deselectAll': '取消全选',
    'action.batchDelete': '批量删除',
    'action.batchDownload': '批量下载',
    'action.batchRename': '批量重命名',
    'action.discover': '发现',
    'action.stats': '存储统计',
    'action.shortcuts': '快捷键',
    'action.install': '安装应用',
    'action.login': '管理登录',
    'action.logout': '退出',

    // Auth
    'auth.username': '用户名',
    'auth.password': '密码',
    'auth.login': '登录',
    'auth.loggingIn': '登录中...',

    // Lightbox
    'lightbox.close': '关闭',
    'lightbox.prev': '上一张',
    'lightbox.next': '下一张',
    'lightbox.zoomIn': '放大',
    'lightbox.zoomOut': '缩小',
    'lightbox.resetZoom': '重置缩放',
    'lightbox.slideshow': '幻灯片',
    'lightbox.slideshowSettings': '幻灯片设置',
    'lightbox.info': '文件信息',
    'lightbox.download': '下载',

    // Info panel
    'info.name': '名称',
    'info.type': '类型',
    'info.size': '大小',
    'info.dimensions': '尺寸',
    'info.aspectRatio': '宽高比',
    'info.megapixels': '百万像素',
    'info.path': '路径',
    'info.camera': '相机',
    'info.lens': '镜头',
    'info.params': '参数',
    'info.exposure': '曝光',
    'info.dateTaken': '拍摄时间',
    'info.software': '软件',
    'info.location': '位置',

    // Empty state
    'empty.title': '暂无文件',
    'empty.subtitle': '拖拽文件到此处上传',

    // Messages
    'msg.deleted': '已删除 {count} 个项目',
    'msg.renamed': '已重命名为 "{name}"',
    'msg.created': '已创建文件夹 "{name}"',
    'msg.copied': '链接已复制',
    'msg.linkCopied': '直链已复制',
    'msg.error': '操作失败',
    'msg.uploading': '正在上传...',

    // Theme
    'theme.light': '浅色',
    'theme.dark': '深色',
    'theme.toggle': '切换主题',

    // Keyboard
    'kbd.search': '搜索',
    'kbd.shortcuts': '快捷键帮助',
    'kbd.refresh': '刷新',
    'kbd.toggleLayout': '切换布局',
    'kbd.toggleTheme': '切换主题',
    'kbd.selectAll': '全选',
    'kbd.deselect': '取消选择',
  },
  'en': {
    'nav.home': 'R2 Gallery',
    'nav.back': 'Back',
    'nav.refresh': 'Refresh',
    'file.download': 'Download',
    'file.delete': 'Delete',
    'file.rename': 'Rename',
    'file.copy': 'Copy file',
    'file.copyLink': 'Copy link',
    'file.copyDirectLink': 'Copy direct link',
    'file.move': 'Move',
    'file.duplicate': 'Duplicate',
    'file.createFolder': 'New folder',
    'file.upload': 'Upload',
    'layout.grid': 'Grid view',
    'layout.list': 'List view',
    'layout.rows': 'Rows view',
    'layout.columns': 'Columns view',
    'layout.blocks': 'Blocks view',
    'layout.imagelist': 'Image list',
    'sort.name': 'Name',
    'sort.size': 'Size',
    'sort.date': 'Date',
    'sort.kind': 'Kind',
    'sort.shuffle': 'Shuffle',
    'sort.asc': 'Ascending',
    'sort.desc': 'Descending',
    'filter.all': 'All',
    'filter.image': 'Images',
    'filter.video': 'Videos',
    'filter.audio': 'Audio',
    'filter.document': 'Documents',
    'action.search': 'Search...',
    'action.select': 'Select',
    'action.selectAll': 'Select all',
    'action.deselectAll': 'Deselect all',
    'action.batchDelete': 'Delete selected',
    'action.batchDownload': 'Download selected',
    'action.batchRename': 'Rename selected',
    'action.discover': 'Discover',
    'action.stats': 'Storage stats',
    'action.shortcuts': 'Shortcuts',
    'action.install': 'Install app',
    'action.login': 'Login',
    'action.logout': 'Logout',
    'auth.username': 'Username',
    'auth.password': 'Password',
    'auth.login': 'Login',
    'auth.loggingIn': 'Logging in...',
    'lightbox.close': 'Close',
    'lightbox.prev': 'Previous',
    'lightbox.next': 'Next',
    'lightbox.zoomIn': 'Zoom in',
    'lightbox.zoomOut': 'Zoom out',
    'lightbox.resetZoom': 'Reset zoom',
    'lightbox.slideshow': 'Slideshow',
    'lightbox.slideshowSettings': 'Slideshow settings',
    'lightbox.info': 'File info',
    'lightbox.download': 'Download',
    'info.name': 'Name',
    'info.type': 'Type',
    'info.size': 'Size',
    'info.dimensions': 'Dimensions',
    'info.aspectRatio': 'Aspect ratio',
    'info.megapixels': 'Megapixels',
    'info.path': 'Path',
    'info.camera': 'Camera',
    'info.lens': 'Lens',
    'info.params': 'Parameters',
    'info.exposure': 'Exposure',
    'info.dateTaken': 'Date taken',
    'info.software': 'Software',
    'info.location': 'Location',
    'empty.title': 'No files',
    'empty.subtitle': 'Drag files here to upload',
    'msg.deleted': 'Deleted {count} items',
    'msg.renamed': 'Renamed to "{name}"',
    'msg.created': 'Created folder "{name}"',
    'msg.copied': 'Link copied',
    'msg.linkCopied': 'Direct link copied',
    'msg.error': 'Operation failed',
    'msg.uploading': 'Uploading...',
    'theme.light': 'Light',
    'theme.dark': 'Dark',
    'theme.toggle': 'Toggle theme',
    'kbd.search': 'Search',
    'kbd.shortcuts': 'Keyboard shortcuts',
    'kbd.refresh': 'Refresh',
    'kbd.toggleLayout': 'Toggle layout',
    'kbd.toggleTheme': 'Toggle theme',
    'kbd.selectAll': 'Select all',
    'kbd.deselect': 'Deselect',
  },
};

let currentLocale: Locale = (localStorage.getItem('locale') as Locale) || 'zh-CN';

export function setLocale(locale: Locale) {
  currentLocale = locale;
  localStorage.setItem('locale', locale);
}

export function getLocale(): Locale {
  return currentLocale;
}

export function t(key: string, params?: Record<string, string | number>): string {
  let value = translations[currentLocale]?.[key] || translations['zh-CN']?.[key] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      value = value.replace(`{${k}}`, String(v));
    }
  }
  return value;
}

export function getLocaleLabel(locale: Locale): string {
  return locale === 'zh-CN' ? '简体中文' : 'English';
}
