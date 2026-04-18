export default function Loading() {
  return (
    <div className="flex-1 w-full bg-white" aria-busy="true">
      {/* Header skeleton */}
      <div className="px-8 pt-6 pb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="h-3 w-20 bg-[#F0F0F0] rounded animate-pulse motion-reduce:animate-none" />
          <div className="h-3 w-12 bg-[#F0F0F0] rounded animate-pulse motion-reduce:animate-none" />
        </div>
        <div className="h-9 w-72 bg-[#F0F0F0] rounded animate-pulse motion-reduce:animate-none mb-3" />
        <div className="flex items-center gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-3 w-24 bg-[#F0F0F0] rounded animate-pulse motion-reduce:animate-none"
            />
          ))}
        </div>
      </div>

      {/* Content skeleton */}
      <div className="px-8 pt-6 pb-20">
        {/* Result */}
        <div className="mb-10">
          <div className="h-3 w-20 bg-[#F0F0F0] rounded animate-pulse motion-reduce:animate-none mb-3" />
          <div className="flex items-center gap-3">
            <div className="h-12 w-32 bg-[#F0F0F0] rounded animate-pulse motion-reduce:animate-none" />
            <div className="h-6 w-12 bg-[#F0F0F0] rounded-full animate-pulse motion-reduce:animate-none" />
          </div>
        </div>

        {/* Analysis + Radar */}
        <div className="flex gap-8 mb-10">
          <div className="w-[400px] shrink-0 flex flex-col gap-8">
            <div className="flex flex-col gap-2">
              <div className="h-3 w-20 bg-[#F0F0F0] rounded animate-pulse motion-reduce:animate-none" />
              <div className="h-7 w-32 bg-[#F0F0F0] rounded animate-pulse motion-reduce:animate-none" />
            </div>
            <div className="flex flex-col gap-2">
              <div className="h-3 w-20 bg-[#F0F0F0] rounded animate-pulse motion-reduce:animate-none" />
              <div className="h-16 bg-[#F0F0F0] rounded animate-pulse motion-reduce:animate-none" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="h-[340px] bg-[#F0F0F0] rounded animate-pulse motion-reduce:animate-none" />
          </div>
        </div>

        {/* Performance Tracker */}
        <div className="h-[266px] bg-[#F0F0F0] rounded-[14px] animate-pulse motion-reduce:animate-none mb-10" />

        {/* Court */}
        <div className="h-[400px] bg-[#F0F0F0] rounded-[14px] animate-pulse motion-reduce:animate-none mb-10" />

        {/* Key Moments */}
        <div className="mb-10">
          <div className="h-3 w-24 bg-[#F0F0F0] rounded animate-pulse motion-reduce:animate-none mb-4" />
          <div className="grid grid-cols-2 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-[#F0F0F0] rounded-lg animate-pulse motion-reduce:animate-none" />
            ))}
          </div>
        </div>

        {/* Stats Snapshot */}
        <div className="mb-10">
          <div className="h-3 w-36 bg-[#F0F0F0] rounded animate-pulse motion-reduce:animate-none mb-4" />
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-[140px] bg-[#F0F0F0] rounded-[14px] animate-pulse motion-reduce:animate-none"
              />
            ))}
          </div>
        </div>

        {/* Full Statistics */}
        <div className="h-[500px] bg-[#F0F0F0] rounded-[14px] animate-pulse motion-reduce:animate-none mb-10" />

        {/* Video */}
        <div className="mb-10">
          <div className="h-3 w-20 bg-[#F0F0F0] rounded animate-pulse motion-reduce:animate-none mb-4" />
          <div className="h-[400px] bg-[#F0F0F0] rounded-[14px] animate-pulse motion-reduce:animate-none" />
        </div>
      </div>
    </div>
  );
}
