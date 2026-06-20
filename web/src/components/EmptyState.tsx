/**
 * EmptyState — contextual empty state component with i18n support.
 *
 * Shows distinct illustrations + messages for different empty scenarios:
 *  - directory:  current folder has no files
 *  - search:     search returned no results
 *  - filtered:   type filter hid everything
 *  - upload:     no files yet (first-time visitor)
 *
 * When `user` is provided, shows upload hint for directory/upload types.
 */

import { useTranslation } from 'react-i18next';

interface Props {
  type: 'directory' | 'search' | 'filtered' | 'upload';
  /** Show upload hint for directory/upload types */
  user?: boolean;
  /** Action callbacks */
  onClearSearch?: () => void;
  onClearFilter?: () => void;
  onUpload?: () => void;
}

export default function EmptyState({ type, user, onClearSearch, onClearFilter, onUpload }: Props) {
  const { t } = useTranslation();

  const config = CONFIGS[type];
  const icon = config.icon;
  const title = t(config.titleKey, config.titleFallback);
  const desc = t(config.descKey, config.descFallback);

  return (
    <div className="flex flex-col items-center justify-center min-h-[320px] px-6 py-12 select-none">
      {/* Icon */}
      <div className="mb-6 text-gray-200 dark:text-gray-700 transition-colors">
        {icon}
      </div>

      {/* Title */}
      <h3 className="text-lg font-medium text-gray-500 dark:text-gray-400 mb-1.5">
        {title}
      </h3>

      {/* Description */}
      <p className="text-sm text-gray-400 dark:text-gray-500 mb-6 max-w-xs text-center leading-relaxed">
        {desc}
      </p>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {type === 'search' && onClearSearch && (
          <button
            onClick={onClearSearch}
            className="px-4 py-2 text-sm rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors font-medium"
          >
            {t('search.clear', '清除搜索')}
          </button>
        )}

        {type === 'filtered' && onClearFilter && (
          <button
            onClick={onClearFilter}
            className="px-4 py-2 text-sm rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors font-medium"
          >
            {t('filter.clear', '清除筛选')}
          </button>
        )}

        {(type === 'directory' || type === 'upload') && user && onUpload && (
          <button
            onClick={onUpload}
            className="px-5 py-2 text-sm rounded-lg bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white transition-colors font-medium shadow-sm"
          >
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {t('file.upload', '上传文件')}
            </span>
          </button>
        )}

        {type === 'directory' && (
          <button
            onClick={() => window.history.pushState({}, '', '/')}
            className="px-4 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            {t('nav.home', '返回首页')}
          </button>
        )}
      </div>
    </div>
  );
}

/* ── SVG icons ── */

const FOLDER_ICON = (
  <svg className="w-20 h-20" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
  </svg>
);

const SEARCH_ICON = (
  <svg className="w-20 h-20" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
    <circle cx="11" cy="11" r="8" strokeLinecap="round" strokeLinejoin="round" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35" />
  </svg>
);

const FILTER_ICON = (
  <svg className="w-20 h-20" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
  </svg>
);

const UPLOAD_ICON = (
  <svg className="w-20 h-20" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const CONFIGS: Record<Props['type'], {
  icon: React.ReactNode;
  titleKey: string;
  titleFallback: string;
  descKey: string;
  descFallback: string;
}> = {
  directory: {
    icon: FOLDER_ICON,
    titleKey: 'empty.files',
    titleFallback: '暂无文件',
    descKey: 'empty.files_hint',
    descFallback: '拖拽文件到此处，或点击上传按钮添加文件',
  },
  search: {
    icon: SEARCH_ICON,
    titleKey: 'empty.search',
    titleFallback: '未找到匹配结果',
    descKey: 'empty.search_hint',
    descFallback: '尝试使用不同的关键词搜索，或清除搜索条件浏览全部文件',
  },
  filtered: {
    icon: FILTER_ICON,
    titleKey: 'empty.filtered',
    titleFallback: '没有匹配的文件类型',
    descKey: 'empty.filtered_hint',
    descFallback: '当前类型筛选条件下没有文件，尝试清除筛选查看全部',
  },
  upload: {
    icon: UPLOAD_ICON,
    titleKey: 'empty.upload',
    titleFallback: '暂无内容',
    descKey: 'empty.upload_hint',
    descFallback: '你的画廊还是空的，开始上传你的第一张图片或视频吧',
  },
};