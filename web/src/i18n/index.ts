import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  'zh-CN': {
    translation: {
      // Common
      'app.name': 'R2 Gallery',
      'loading': '加载中...',
      'error': '错误',
      'success': '成功',
      'cancel': '取消',
      'save': '保存',
      'delete': '删除',
      'confirm': '确认',
      'close': '关闭',
      
      // Navigation
      'nav.home': '首页',
      'nav.back': '返回',
      'nav.up': '上级目录',
      
      // File operations
      'file.upload': '上传',
      'file.download': '下载',
      'file.rename': '重命名',
      'file.delete': '删除',
      'file.copy': '复制',
      'file.move': '移动',
      'file.duplicate': '重复',
      'file.newFolder': '新建文件夹',
      'file.newFile': '新建文件',
      
      // Selection
      'select.all': '全选',
      'select.deselect': '取消全选',
      'select.selected': '已选',
      'select.of': '/',
      
      // Sort
      'sort.name': '名称',
      'sort.size': '大小',
      'sort.date': '日期',
      'sort.type': '类型',
      'sort.shuffle': '随机',
      'sort.asc': '升序',
      'sort.desc': '降序',
      
      // Layout
      'layout.grid': '网格',
      'layout.list': '列表',
      'layout.rows': '行',
      'layout.columns': '列',
      'layout.imagelist': '图片列表',
      'layout.blocks': '块',
      
      // Theme
      'theme.light': '浅色',
      'theme.dark': '深色',
      'theme.contrast': '高对比',
      'theme.system': '跟随系统',
      
      // Auth
      'auth.login': '登录',
      'auth.logout': '退出',
      'auth.username': '用户名',
      'auth.password': '密码',
      'auth.loginTitle': '登录',
      'auth.invalidLogin': '用户名或密码错误',
      
      // Settings
      'settings.title': '设置',
      'settings.config': '配置',
      'settings.users': '用户管理',
      'settings.diagnostics': '诊断',
      'settings.cache': '缓存',
      'settings.cleanCache': '清理缓存',
      'settings.layout': '默认布局',
      'settings.sort': '默认排序',
      
      // Share
      'share.title': '分享',
      'share.create': '创建链接',
      'share.copy': '复制链接',
      'share.password': '密码保护',
      'share.expires': '有效期',
      'share.noExpiry': '永不过期',
      'share.created': '链接已创建',
      'share.copied': '链接已复制',
      
      // Media
      'media.play': '播放',
      'media.pause': '暂停',
      'media.prev': '上一个',
      'media.next': '下一个',
      'media.fullscreen': '全屏',
      'media.slideshow': '幻灯片',
      'media.info': '信息',
      
      // Editor
      'editor.edit': '编辑',
      'editor.preview': '预览',
      'editor.split': '分屏',
      'editor.save': '保存',
      'editor.saved': '已保存',
      
      // Empty states
      'empty.files': '暂无文件',
      'empty.folders': '暂无文件夹',
      'empty.search': '未找到匹配结果',
      'empty.upload': '拖拽文件到此处上传',
      'empty.files_hint': '拖拽文件到此处，或点击上传按钮添加文件',
      'empty.search_hint': '尝试使用不同的关键词搜索，或清除搜索条件浏览全部文件',
      'empty.filtered': '没有匹配的文件类型',
      'empty.filtered_hint': '当前类型筛选条件下没有文件，尝试清除筛选查看全部',
      'empty.upload_hint': '你的画廊还是空的，开始上传你的第一张图片或视频吧',
      'search.clear': '清除搜索',
      'filter.clear': '清除筛选',
      
      // Errors
      'error.notFound': '文件不存在',
      'error.uploadFailed': '上传失败',
      'error.deleteFailed': '删除失败',
      'error.renameFailed': '重命名失败',
      'error.copyFailed': '复制失败',
      'error.moveFailed': '移动失败',
      
      // Demo mode
      'demo.title': '演示模式',
      'demo.message': '当前处于演示模式，部分操作已被禁用',
    }
  },
  'en': {
    translation: {
      'app.name': 'R2 Gallery',
      'loading': 'Loading...',
      'error': 'Error',
      'success': 'Success',
      'cancel': 'Cancel',
      'save': 'Save',
      'delete': 'Delete',
      'confirm': 'Confirm',
      'close': 'Close',
      'nav.home': 'Home',
      'nav.back': 'Back',
      'nav.up': 'Up',
      'file.upload': 'Upload',
      'file.download': 'Download',
      'file.rename': 'Rename',
      'file.delete': 'Delete',
      'file.copy': 'Copy',
      'file.move': 'Move',
      'file.duplicate': 'Duplicate',
      'file.newFolder': 'New Folder',
      'file.newFile': 'New File',
      'select.all': 'Select All',
      'select.deselect': 'Deselect',
      'select.selected': 'Selected',
      'select.of': '/',
      'sort.name': 'Name',
      'sort.size': 'Size',
      'sort.date': 'Date',
      'sort.type': 'Type',
      'sort.shuffle': 'Shuffle',
      'sort.asc': 'Ascending',
      'sort.desc': 'Descending',
      'layout.grid': 'Grid',
      'layout.list': 'List',
      'layout.rows': 'Rows',
      'layout.columns': 'Columns',
      'layout.imagelist': 'Image List',
      'layout.blocks': 'Blocks',
      'theme.light': 'Light',
      'theme.dark': 'Dark',
      'theme.contrast': 'Contrast',
      'theme.system': 'System',
      'auth.login': 'Login',
      'auth.logout': 'Logout',
      'auth.username': 'Username',
      'auth.password': 'Password',
      'auth.loginTitle': 'Login',
      'auth.invalidLogin': 'Invalid username or password',
      'settings.title': 'Settings',
      'settings.config': 'Configuration',
      'settings.users': 'User Management',
      'settings.diagnostics': 'Diagnostics',
      'settings.cache': 'Cache',
      'settings.cleanCache': 'Clean Cache',
      'settings.layout': 'Default Layout',
      'settings.sort': 'Default Sort',
      'share.title': 'Share',
      'share.create': 'Create Link',
      'share.copy': 'Copy Link',
      'share.password': 'Password Protection',
      'share.expires': 'Expiration',
      'share.noExpiry': 'Never expires',
      'share.created': 'Link created',
      'share.copied': 'Link copied',
      'media.play': 'Play',
      'media.pause': 'Pause',
      'media.prev': 'Previous',
      'media.next': 'Next',
      'media.fullscreen': 'Fullscreen',
      'media.slideshow': 'Slideshow',
      'media.info': 'Info',
      'editor.edit': 'Edit',
      'editor.preview': 'Preview',
      'editor.split': 'Split',
      'editor.save': 'Save',
      'editor.saved': 'Saved',
      'empty.files': 'No files',
      'empty.folders': 'No folders',
      'empty.search': 'No results found',
      'empty.upload': 'Drag files here to upload',
      'empty.files_hint': 'Drop files anywhere on the page or click the upload button to add files.',
      'empty.search_hint': 'Try different keywords or clear the search to browse all files.',
      'empty.filtered': 'No files match the current filter',
      'empty.filtered_hint': 'The current type filter is hiding everything. Try clearing it to see all files.',
      'empty.upload_hint': 'Your gallery is empty. Start uploading your first images and videos!',
      'search.clear': 'Clear Search',
      'filter.clear': 'Clear Filter',
      'error.notFound': 'File not found',
      'error.uploadFailed': 'Upload failed',
      'error.deleteFailed': 'Delete failed',
      'error.renameFailed': 'Rename failed',
      'error.copyFailed': 'Copy failed',
      'error.moveFailed': 'Move failed',
      'demo.title': 'Demo Mode',
      'demo.message': 'This is a demo. Some operations are disabled.',
    }
  },
  'ja': {
    translation: {
      'app.name': 'R2 Gallery',
      'loading': '読み込み中...',
      'cancel': 'キャンセル',
      'save': '保存',
      'delete': '削除',
      'close': '閉じる',
      'auth.login': 'ログイン',
      'auth.logout': 'ログアウト',
      'file.upload': 'アップロード',
      'file.download': 'ダウンロード',
      'file.rename': '名前変更',
      'file.copy': 'コピー',
      'file.duplicate': '複製',
      'empty.files': 'ファイルがありません',
      'theme.light': 'ライト',
      'theme.dark': 'ダーク',
    }
  },
  'ko': {
    translation: {
      'app.name': 'R2 Gallery',
      'loading': '로딩 중...',
      'cancel': '취소',
      'save': '저장',
      'delete': '삭제',
      'close': '닫기',
      'auth.login': '로그인',
      'auth.logout': '로그아웃',
      'file.upload': '업로드',
      'file.download': '다운로드',
      'file.rename': '이름 변경',
      'file.copy': '복사',
      'empty.files': '파일이 없습니다',
    }
  }
};

// Detect browser language
const getBrowserLang = (): string => {
  const lang = navigator.language || (navigator as any).userLanguage || '';
  const short = lang.split('-')[0];
  if (['zh', 'en', 'ja', 'ko'].includes(short)) {
    return short === 'zh' ? 'zh-CN' : short;
  }
  return 'en';
};

i18n.use(initReactI18next).init({
  resources,
  lng: localStorage.getItem('language') || getBrowserLang(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
