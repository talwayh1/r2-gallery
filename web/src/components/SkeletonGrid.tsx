/**
 * Skeleton loading grid — placeholder cards shown while data loads.
 * Matches the grid layout of FileGrid to reduce layout shift.
 */
export default function SkeletonGrid() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Folder skeleton section */}
      <div>
        <div className="h-3 w-16 rounded shimmer mb-3" />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={`sk-folder-${i}`} className="flex flex-col items-center gap-2 p-3 rounded-xl">
              <div className="w-full aspect-square rounded-xl shimmer" />
              <div className="w-2/3 h-3 rounded shimmer" />
            </div>
          ))}
        </div>
      </div>

      {/* File skeleton section */}
      <div>
        <div className="h-3 w-12 rounded shimmer mb-3" />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={`sk-file-${i}`} className="flex flex-col items-center gap-2 p-3 rounded-xl">
              <div className="w-full aspect-square rounded-xl shimmer" />
              <div className="w-3/4 h-3 rounded shimmer mt-1" />
              <div className="w-1/3 h-2 rounded shimmer" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
