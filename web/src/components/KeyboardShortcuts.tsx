import { useEffect, useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  onClose: () => void;
}

interface Shortcut {
  keys: string[];
  descriptionKey: string;
}

interface ShortcutSection {
  categoryKey: string;
  items: Shortcut[];
}

const shortcutSections: ShortcutSection[] = [
  {
    categoryKey: 'kbd.category.global',
    items: [
      { keys: ['?'], descriptionKey: 'kbd.toggle' },
      { keys: ['/'], descriptionKey: 'kbd.search' },
      { keys: ['Ctrl', 'F'], descriptionKey: 'kbd.search' },
      { keys: ['Ctrl', 'K'], descriptionKey: 'kbd.search' },
      { keys: ['R'], descriptionKey: 'kbd.refresh' },
      { keys: ['G'], descriptionKey: 'kbd.next_layout' },
      { keys: ['B'], descriptionKey: 'kbd.toggle_sidebar' },
      { keys: ['N'], descriptionKey: 'kbd.new_folder' },
      { keys: ['1'], descriptionKey: 'kbd.layout_grid' },
      { keys: ['2'], descriptionKey: 'kbd.layout_list' },
      { keys: ['3'], descriptionKey: 'kbd.layout_imagelist' },
      { keys: ['4'], descriptionKey: 'kbd.layout_columns' },
      { keys: ['5'], descriptionKey: 'kbd.layout_blocks' },
      { keys: ['6'], descriptionKey: 'kbd.layout_rows' },
      { keys: ['T'], descriptionKey: 'kbd.toggle_theme' },
      { keys: ['Alt', '0'], descriptionKey: 'kbd.search_all' },
      { keys: ['Alt', '1'], descriptionKey: 'kbd.search_image' },
      { keys: ['Alt', '2'], descriptionKey: 'kbd.search_video' },
      { keys: ['Alt', '3'], descriptionKey: 'kbd.search_audio' },
      { keys: ['Alt', '4'], descriptionKey: 'kbd.search_doc' },
    ],
  },
  {
    categoryKey: 'kbd.category.file',
    items: [
      { keys: ['Ctrl', 'A'], descriptionKey: 'kbd.select_all' },
      { keys: ['Ctrl', 'C'], descriptionKey: 'kbd.copy' },
      { keys: ['Ctrl', 'X'], descriptionKey: 'kbd.cut' },
      { keys: ['Ctrl', 'V'], descriptionKey: 'kbd.paste' },
      { keys: ['Ctrl', 'Shift', 'D'], descriptionKey: 'kbd.duplicate' },
      { keys: ['Shift', 'D'], descriptionKey: 'kbd.download' },
      { keys: ['Delete'], descriptionKey: 'kbd.delete' },
      { keys: ['F2'], descriptionKey: 'kbd.rename' },
      { keys: ['Esc'], descriptionKey: 'kbd.deselect' },
      { keys: ['Ctrl', 'Shift', 'C'], descriptionKey: 'kbd.copy_link' },
      { keys: ['Ctrl', 'Shift', 'A'], descriptionKey: 'kbd.deselect_all' },
    ],
  },
  {
    categoryKey: 'kbd.category.lightbox',
    items: [
      { keys: ['←', '↑'], descriptionKey: 'kbd.lightbox_prev' },
      { keys: ['→', '↓'], descriptionKey: 'kbd.lightbox_next' },
      { keys: ['Shift', '←'], descriptionKey: 'kbd.lightbox_jump' },
      { keys: ['Shift', '→'], descriptionKey: 'kbd.lightbox_jump_back' },
      { keys: ['Home'], descriptionKey: 'kbd.lightbox_first' },
      { keys: ['End'], descriptionKey: 'kbd.lightbox_last' },
      { keys: ['Esc'], descriptionKey: 'kbd.lightbox_close' },
      { keys: ['I'], descriptionKey: 'kbd.lightbox_info' },
      { keys: ['C'], descriptionKey: 'kbd.lightbox_copy_image' },
      { keys: ['D'], descriptionKey: 'kbd.lightbox_download' },
      { keys: ['M'], descriptionKey: 'kbd.lightbox_tools' },
      { keys: ['Space', 'S'], descriptionKey: 'kbd.lightbox_slideshow' },
      { keys: ['+', '-'], descriptionKey: 'kbd.lightbox_zoom' },
      { keys: ['0'], descriptionKey: 'kbd.lightbox_reset' },
      { keys: ['1'], descriptionKey: 'kbd.lightbox_actual' },
      { keys: ['2'], descriptionKey: 'kbd.lightbox_fit' },
      { keys: ['Ctrl', 'O'], descriptionKey: 'kbd.lightbox_newtab' },
      { keys: ['Ctrl', 'W'], descriptionKey: 'kbd.lightbox_close_modal' },
      { keys: ['Ctrl', 'D'], descriptionKey: 'kbd.lightbox_copy_file' },
      { keys: ['L'], descriptionKey: 'kbd.lightbox_locate' },
      { keys: ['[', ']'], descriptionKey: 'kbd.lightbox_speed' },
      { keys: ['F'], descriptionKey: 'kbd.lightbox_fullscreen' },
      { keys: ['R', 'Shift+R'], descriptionKey: 'kbd.lightbox_rotate' },
    ],
  },
  {
    categoryKey: 'kbd.category.touch',
    items: [
      { keys: ['← 滑动'], descriptionKey: 'kbd.touch_next' },
      { keys: ['滑动 →'], descriptionKey: 'kbd.touch_prev' },
      { keys: ['下滑'], descriptionKey: 'kbd.touch_close' },
    ],
  },
];

export default function KeyboardShortcuts({ onClose }: Props) {
  const { t } = useTranslation();
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

  // Map shortcut data to translated display objects
  const sections = useMemo(() => {
    return shortcutSections.map((section) => ({
      category: t(section.categoryKey),
      items: section.items.map((item) => ({
        ...item,
        description: t(item.descriptionKey),
      })),
    }));
  }, [t]);

  // Filter shortcuts by search term
  const filteredShortcuts = useMemo(() => {
    if (!searchTerm.trim()) return sections;
    const term = searchTerm.toLowerCase().trim();
    return sections
      .map((section) => ({
        ...section,
        items: section.items.filter(
          (item) =>
            item.description.toLowerCase().includes(term) ||
            item.keys.some((k) => k.toLowerCase().includes(term))
        ),
      }))
      .filter((section) => section.items.length > 0);
  }, [sections, searchTerm]);

  const totalCount = sections.reduce((s, c) => s + c.items.length, 0);
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
            {t('kbd.title')}
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
              placeholder={t('kbd.search_shortcuts', { count: totalCount })}
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
              {t('kbd.found_matches', { count: matchCount })}
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
              <p className="text-sm">{t('kbd.no_matches')}</p>
              <button
                onClick={() => setSearchTerm('')}
                className="mt-2 text-xs text-blue-500 hover:text-blue-600"
              >
                {t('kbd.clear_search')}
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
                    <div key={item.descriptionKey} className="flex items-center justify-between gap-4">
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
            <kbd className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-mono bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded">?</kbd>
            {' / '}
            <kbd className="inline-flex items-center justify-center w-8 h-5 text-[10px] font-mono bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded">Esc</kbd>
            {' — '}{t('kbd.lightbox_close')}
          </p>
        </div>
      </div>
    </div>
  );
}
