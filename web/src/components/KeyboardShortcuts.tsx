import { useEffect } from 'react';

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
      { keys: ['1'], description: '网格布局' },
      { keys: ['2'], description: '列表布局' },
      { keys: ['3'], description: '图片列表' },
      { keys: ['4'], description: '列布局' },
      { keys: ['5'], description: '块布局' },
      { keys: ['6'], description: '行布局' },
      { keys: ['T'], description: '切换亮色/暗色主题' },
    ],
  },
  {
    category: '文件操作',
    items: [
      { keys: ['Ctrl', 'A'], description: '全选文件' },
      { keys: ['Ctrl', 'C'], description: '复制选中文件' },
      { keys: ['Ctrl', 'X'], description: '剪切选中文件' },
      { keys: ['Ctrl', 'V'], description: '粘贴文件到当前目录' },
      { keys: ['Ctrl', 'D'], description: '复制文件（创建副本）' },
      { keys: ['Delete'], description: '删除选中文件' },
      { keys: ['F2'], description: '重命名选中文件' },
      { keys: ['Esc'], description: '取消选择' },
    ],
  },
  {
    category: '灯箱 (Lightbox)',
    items: [
      { keys: ['←', '↑'], description: '上一张' },
      { keys: ['→', '↓'], description: '下一张' },
      { keys: ['Esc'], description: '关闭面板/关闭灯箱' },
      { keys: ['I'], description: '切换文件信息面板' },
      { keys: ['D'], description: '下载当前文件' },
      { keys: ['d'], description: '切换更多工具面板' },
      { keys: ['Space', 'S'], description: '播放/暂停幻灯片' },
      { keys: ['+', '-'], description: '放大/缩小' },
      { keys: ['0'], description: '重置缩放' },
      { keys: ['Ctrl', 'O'], description: '在新标签页打开文件' },
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
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 max-w-lg w-[90vw] max-h-[80vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
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

        {/* Shortcut sections */}
        <div className="px-6 py-4 space-y-5">
          {shortcuts.map((section) => (
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
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 text-center">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            按 <kbd className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-mono bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded">?</kbd> 或 <kbd className="inline-flex items-center justify-center w-8 h-5 text-[10px] font-mono bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded">Esc</kbd> 关闭
          </p>
        </div>
      </div>
    </div>
  );
}
