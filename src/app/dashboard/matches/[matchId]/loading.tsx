export default function Loading() {
  return (
    <div className="flex-1 w-full bg-white">
      <div className="relative z-10 pt-[104px] pb-6 px-8">
        <div className="max-w-[1200px] mx-auto">
          {/* Breadcrumb skeleton */}
          <div className="animate-pulse flex items-center gap-2">
            <div className="h-3 w-16 bg-[#F3F3F3] rounded-full" />
            <div className="h-3 w-3 bg-[#F3F3F3] rounded-full" />
            <div className="h-3 w-24 bg-[#F3F3F3] rounded-full" />
            <div className="h-3 w-3 bg-[#F3F3F3] rounded-full" />
            <div className="h-3 w-32 bg-[#F3F3F3] rounded-full" />
          </div>
        </div>

        <div className="flex flex-row mt-6 pb-6 gap-8 max-w-[1200px] mx-auto">
          {/* Left main content */}
          <div className="flex-1 min-w-0 flex flex-col gap-10">
            {/* Event header + metadata pills + tabs */}
            <div className="flex flex-col gap-6 animate-pulse">
              {/* Event header: tournament name + date */}
              <div className="flex flex-col gap-3">
                <div className="h-7 w-64 bg-[#F3F3F3] rounded-[14px]" />
                <div className="h-4 w-40 bg-[#F3F3F3] rounded-[14px]" />
                {/* Metadata pills row */}
                <div className="flex items-center gap-2 mt-1">
                  <div className="h-6 w-20 bg-[#F3F3F3] rounded-full" />
                  <div className="h-6 w-24 bg-[#F3F3F3] rounded-full" />
                  <div className="h-6 w-28 bg-[#F3F3F3] rounded-full" />
                </div>
              </div>

              {/* Tab bar skeleton */}
              <div className="h-10 w-full bg-[#F3F3F3] rounded-[14px]" />
            </div>

            {/* Content cards */}
            <div className="flex flex-col gap-10 animate-pulse">
              {/* Large content card */}
              <div className="h-[280px] w-full bg-[#F3F3F3] rounded-[14px]" />
              {/* Two smaller cards side by side */}
              <div className="grid grid-cols-2 gap-6">
                <div className="h-[200px] bg-[#F3F3F3] rounded-[14px]" />
                <div className="h-[200px] bg-[#F3F3F3] rounded-[14px]" />
              </div>
              {/* Another content card */}
              <div className="h-[240px] w-full bg-[#F3F3F3] rounded-[14px]" />
            </div>
          </div>

          {/* Right sidebar */}
          <div className="w-[320px] flex-shrink-0 flex flex-col gap-6 animate-pulse">
            {/* Score card skeleton */}
            <div className="flex flex-col gap-4 p-6 bg-[#F3F3F3] rounded-[14px]">
              {/* Player 1 row */}
              <div className="flex items-center justify-between">
                <div className="h-5 w-28 bg-white/60 rounded-full" />
                <div className="flex gap-3">
                  <div className="h-6 w-6 bg-white/60 rounded" />
                  <div className="h-6 w-6 bg-white/60 rounded" />
                </div>
              </div>
              {/* Divider */}
              <div className="h-px bg-white/40" />
              {/* Player 2 row */}
              <div className="flex items-center justify-between">
                <div className="h-5 w-32 bg-white/60 rounded-full" />
                <div className="flex gap-3">
                  <div className="h-6 w-6 bg-white/60 rounded" />
                  <div className="h-6 w-6 bg-white/60 rounded" />
                </div>
              </div>
            </div>

            {/* Sidebar card skeleton */}
            <div className="h-[200px] bg-[#F3F3F3] rounded-[14px]" />
            <div className="h-[160px] bg-[#F3F3F3] rounded-[14px]" />
          </div>
        </div>
      </div>
    </div>
  );
}
