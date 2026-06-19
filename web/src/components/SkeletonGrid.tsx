import type { LayoutMode } from '../types';

/**
 * Skeleton loading grid — placeholder cards shown while data loads.
 * Accepts a layoutMode prop to render skeletons matching each layout mode,
 * minimizing layout shift when the real content loads.
 */
export default function SkeletonGrid({ layoutMode = 'grid' }: { layoutMode?: LayoutMode }) {
  // Folder skeleton: 3 folders with square thumbnails
  const folderSkeleton = (
    <>
      <div className="h-3 w-16 rounded shimmer mb-3" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={`sk-folder-${i}`} className="flex flex-col items-center gap-2 p-3 rounded-xl">
            <div className="w-full aspect-square rounded-xl shimmer" />
            <div className="w-2/3 h-3 rounded shimmer" />
          </div>
        ))}
      </div>
    </>
  );

  // Shared shimmer for grid-item cards
  const cardSkeleton = (key: string) => (
    <div key={key} className="flex flex-col items-center gap-2 p-3 rounded-xl">
      <div className="w-full aspect-square rounded-xl shimmer" />
      <div className="w-3/4 h-3 rounded shimmer mt-1" />
      <div className="w-1/3 h-2 rounded shimmer" />
    </div>
  );

  switch (layoutMode) {
    case 'list': {
      // Table row skeleton with thumbnail + name + size columns
      return (
        <div className="space-y-3 animate-in fade-in duration-300">
          {folderSkeleton}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="w-10 px-2 py-3" />
                  <th className="px-2 py-3 text-left">
                    <div className="h-3 w-12 rounded shimmer" />
                  </th>
                  <th className="px-4 py-3 text-right hidden sm:table-cell">
                    <div className="h-3 w-10 rounded shimmer ml-auto" />
                  </th>
                  <th className="px-4 py-3 text-right hidden md:table-cell">
                    <div className="h-3 w-14 rounded shimmer ml-auto" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 6 }).map((_, i) => (
                  <tr key={`sk-row-${i}`} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="px-2 py-3 text-center">
                      <div className="w-5 h-5 rounded-md shimmer mx-auto" />
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg shimmer flex-shrink-0" />
                        <div className="flex-1">
                          <div className="h-3 w-3/5 rounded shimmer" />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <div className="h-3 w-14 rounded shimmer ml-auto" />
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="h-3 w-16 rounded shimmer ml-auto" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    case 'blocks': {
      // Blocks layout: 2-5 responsive columns with overlay labels
      return (
        <div className="space-y-3 animate-in fade-in duration-300">
          {/* Folders in blocks style */}
          <div>
            <div className="h-3 w-16 rounded shimmer mb-3" />
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={`sk-bf-${i}`} className="rounded-xl overflow-hidden">
                  <div className="aspect-square shimmer" />
                </div>
              ))}
            </div>
          </div>
          {/* File cards in blocks style */}
          <div>
            <div className="h-3 w-12 rounded shimmer mb-3" />
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={`sk-bc-${i}`} className="rounded-xl overflow-hidden">
                  <div className="aspect-square shimmer" />
                  <div className="p-2">
                    <div className="h-3 w-4/5 rounded shimmer" />
                    <div className="h-2 w-1/3 rounded shimmer mt-1" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    case 'columns': {
      // Columns (masonry) layout: CSS columns with varying heights
      return (
        <div className="space-y-3 animate-in fade-in duration-300">
          {folderSkeleton}
          <div>
            <div className="h-3 w-12 rounded shimmer mb-3" />
            <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 gap-4 space-y-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={`sk-col-${i}`} className="break-inside-avoid rounded-xl overflow-hidden">
                  <div className={`shimmer ${i % 3 === 0 ? 'aspect-[3/4]' : i % 3 === 1 ? 'aspect-square' : 'aspect-video'}`} />
                  <div className="p-2">
                    <div className="h-3 w-4/5 rounded shimmer" />
                    <div className="h-2 w-1/3 rounded shimmer mt-1" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    case 'imagelist': {
      // Image list: rows with larger thumbnails
      return (
        <div className="space-y-2 animate-in fade-in duration-300">
          {/* Folder rows (imagelist style) */}
          <div>
            <div className="h-3 w-16 rounded shimmer mb-3" />
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={`sk-ilf-${i}`} className="flex items-center gap-4 p-3 rounded-lg">
                <div className="w-5 h-5 rounded-md shimmer flex-shrink-0" />
                <div className="w-16 h-16 rounded-lg shimmer flex-shrink-0" />
                <div className="flex-1">
                  <div className="h-4 w-2/5 rounded shimmer" />
                  <div className="h-3 w-16 rounded shimmer mt-1" />
                </div>
                <div className="h-3 w-14 rounded shimmer" />
              </div>
            ))}
          </div>
          {/* File rows */}
          <div>
            <div className="h-3 w-12 rounded shimmer mb-3" />
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={`sk-il-${i}`} className="flex items-center gap-4 p-3 rounded-lg">
                <div className="w-5 h-5 rounded-md shimmer flex-shrink-0" />
                <div className="w-16 h-16 rounded-lg shimmer flex-shrink-0" />
                <div className="flex-1">
                  <div className="h-4 w-3/5 rounded shimmer" />
                  <div className="h-3 w-16 rounded shimmer mt-1" />
                </div>
                <div className="h-3 w-14 rounded shimmer" />
              </div>
            ))}
          </div>
        </div>
      );
    }

    // Default: grid / rows — virtual grid with responsive columns
    default: {
      return (
        <div className="space-y-6 animate-in fade-in duration-300">
          {folderSkeleton}
          <div>
            <div className="h-3 w-12 rounded shimmer mb-3" />
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
              {Array.from({ length: 8 }).map((_, i) => cardSkeleton(`sk-file-${i}`))}
            </div>
          </div>
        </div>
      );
    }
  }
}