import { useEffect, useState, useMemo, useRef } from 'react';

interface Props {
  onClose: () => void;
}

interface Shortcut {
  keys: string[];
  description: string;
}

const shortcuts: { category: string; items: Shortcut[] }[] = [
  {
    category: '全局',
    items: [
      { keys: ['?'], description: '显示/隐藏快捷键帮助' },
      { keys: ['/'], description: '全局搜索' },
      { keys: ['Ctrl', 'F'], description: '全局搜索' },
      { keys: ['Ctrl', 'K'], description: '全局搜索' },
      { keys: ['R'], description: '刷新文件列表' },
      { keys: ['G'], description: '切换下一个布局' },
      { keys: ['B'], description: '切换侧边栏' },
      { keys: ['N'], description: '新建文件夹 (需要登录)' },
      { keys: ['1'], description: '网格布局' },
      { keys: ['2'], description: '列表布局' },
      { keys: ['3'], description: '图片列表' },
      { keys: ['4'], description: '列布局' },
      { keys: ['5'], description: '块布局' },
      { keys: ['6'], description: '行布局' },
      { keys: ['T'], description: '切换亮色/暗色主题' },
      { keys: ['Alt', '0'], description: '全局搜索：全部类型' },
      { keys: ['Alt', '1'], description: '全局搜索：图片' },
      { keys: ['Alt', '2'], description: '全局搜索：视频' },
      { keys: ['Alt', '3'], description: '全局搜索：音频' },
      { keys: ['Alt', '4'], description: '全局搜索：文档' },
    ],
  },
  {
    category: '文件操作',
    items: [
      { keys: ['Ctrl', 'A'], description: '全选文件' },
      { keys: ['Ctrl', 'C'], description: '复制选中文件' },
      { keys: ['Ctrl', 'X'], description: '剪切选中文件' },
      { keys: ['Ctrl', 'V'], description: '粘贴文件到当前目录' },
      { keys: ['Ctrl', 'Shift', 'D'], description: '复制文件（创建副本）' },
      { keys: ['Shift', 'D'], description: '下载选中文件' },
      { keys: ['Delete'], description: '删除选中文件' },
      { keys: ['F2'], description: '重命名选中文件' },
      { keys: ['Esc'], description: '取消选择' },
      { keys: ['Ctrl', 'Shift', 'C'], description: '复制选中文件的分享链接' },
      { keys: ['Ctrl', 'Shift', 'A'], description: '取消全选' },
    ],
  },
  {
    category: '灯箱 (Lightbox)',
    items: [
      { keys: ['←', '↑'], description: '上一张' },
      { keys: ['→', '↓'], description: '下一张' },
      { keys: ['Shift', '←'], description: '向前跳 10 张' },
      { keys: ['Shift', '→'], description: '向后跳 10 张' },
      { keys: ['Home'], description: '跳转到第一张' },
      { keys: ['End'], description: '跳转到最后一张' },
      { keys: ['Esc'], description: '关闭面板/关闭灯箱' },
      { keys: ['I'], description: '切换文件信息面板' },
      { keys: ['C'], description: '复制图片到剪贴板' },
      { keys: ['D'], description: '下载当前文件' },
      { keys: ['M'], description: '切换更多工具面板' },
      { keys: ['Space', 'S'], description: '播放/暂停幻灯片' },
      { keys: ['+', '-'], description: '放大/缩小' },
      { keys: ['0'], description: '重置缩放' },
      { keys: ['1'], description: '实际大小 (1:1)' },
      { keys: ['2'], description: '适配宽度 (W)' },
      { keys: ['Ctrl', 'O'], description: '在新标签页打开文件' },
      { keys: ['Ctrl', 'W'], description: '关闭灯箱' },
      { keys: ['Ctrl', 'D'], description: '复制当前文件' },
      { keys: ['[', ']'], description: '幻灯片播放中减速/加速' },
      { keys: ['F'], description: '切换全屏' },
      { keys: ['R', 'Shift+R'], description: '顺时针/逆时针旋转' },
    ],
  },
  {
    category: '触控手势 (移动端)',
    items: [
      { keys: ['← 滑动'], description: '下一张' },
      { keys: ['滑动 →'], description: '上一张' },
      { keys: ['下滑'], description: '关闭灯箱' },
    ],
  },
];

export default function KeyboardShortcuts({ onClose }: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement).isContentEditable) {
        if (e.key === 'Escape') {
          (e.target as HTMLElement).blur();
        }
        return;
      }
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    // Auto-focus search input
    setTimeout(() => inputRef.current?.focus(), 50);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  // Filter shortcuts by search term
  const filteredShortcuts = useMemo(() => {
    if (!searchTerm.trim()) return shortcuts;
    const term = searchTerm.toLowerCase().trim();
    return shortcuts
      .map((section) => ({
        ...section,
        items: section.items.filter(
          (item) =>
            item.description.toLowerCase().includes(term) ||
            item.keys.some((k) => k.toLowerCase().includes(term))
        ),
      }))
      .filter((section) => section.items.length > 0);
  }, [searchTerm]);

  const totalCount = shortcuts.reduce((s, c) => s + c.items.length, 0);
  const shownCount = filteredShortcuts.reduce((s, c) => s + c.items.length, 0);
  const hasFilter = searchTerm.trim().length > 0;
  const matchCount = hasFilter ? shownCount : totalCount;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 max-w-lg w-[90vw] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            键盘快捷键
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search input */}
        <div className="px-6 pt-3 pb-2 shrink-0">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={`搜索 ${totalCount} 个快捷键...`}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-400 dark:focus:border-blue-500 focus:ring-1 focus:ring-blue-400/30 dark:focus:ring-blue-500/30 transition-colors"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          {hasFilter && (
            <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
              找到 {matchCount} 个匹配项
            </p>
          )}
        </div>

        {/* Shortcut sections — scrollable */}
        <div className="px-6 py-3 space-y-5 overflow-y-auto">
          {filteredShortcuts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400 dark:text-gray-500">
              <svg className="w-12 h-12 mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm">未找到匹配的快捷键</p>
              <button
                onClick={() => setSearchTerm('')}
                className="mt-2 text-xs text-blue-500 hover:text-blue-600"
              >
                清除搜索
              </button>
            </div>
          ) : (
            filteredShortcuts.map((section) => (
              <div key={section.category}>
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                  {section.category}
                </h3>
                <div className="space-y-1.5">
                  {section.items.map((item) => (
                    <div key={item.description} className="flex items-center justify-between gap-4">
                      <span className="text-sm text-gray-700 dark:text-gray-300">{item.description}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        {item.keys.map((key, i) => (
                          <span key={i}>
                            {i > 0 && <span className="text-gray-400 text-xs mx-0.5">/</span>}
                            <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 text-xs font-mono font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm">
                              {key}
                            </kbd>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 text-center shrink-0">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            按 <kbd className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-mono bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded">?</kbd> 或 <kbd className="inline-flex items-center justify-center w-8 h-5 text-[10px] font-mono bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded">Esc</kbd> 关闭
          </p>
        </div>
      </div>
    </div>
  );
}