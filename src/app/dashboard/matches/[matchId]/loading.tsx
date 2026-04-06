export default function Loading() {
  return (
    <div className="flex-1 w-full bg-white">
      {/* Hero header */}
      <section className="pt-8 pb-8 px-8 border-b border-[#F3F3F3]">
        <div className="flex items-center justify-between gap-8">
          <div className="flex items-center gap-2.5 flex-1">
            <div className="h-7 w-44 bg-[#F3F3F3] rounded-[14px] animate-pulse" />
            <div className="h-5 w-16 bg-[#F3F3F3] rounded-full animate-pulse" />
          </div>

          <div className="flex items-center gap-8 shrink-0">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <div className="h-3 w-8 bg-[#F3F3F3] rounded-full animate-pulse" />
                <div className="flex items-center gap-2">
                  <div className="h-8 w-6 bg-[#F3F3F3] rounded-[14px] animate-pulse" />
                  <div className="h-8 w-6 bg-[#F3F3F3] rounded-[14px] animate-pulse" />
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-2.5 flex-1">
            <div className="h-7 w-40 bg-[#F3F3F3] rounded-[14px] animate-pulse" />
          </div>
        </div>

        <div className="mt-4 flex gap-2 flex-wrap items-center">
          {[20, 24, 20, 16, 28].map((w, i) => (
            <div
              key={i}
              className="h-7 bg-[#F3F3F3] rounded-full animate-pulse"
              style={{ width: `${w * 4}px` }}
            />
          ))}
        </div>
      </section>

      <div className="px-8 pb-16">
        {/* Tab bar */}
        <div className="pt-6">
          <div className="flex gap-4 border-b border-[#F3F3F3] pb-2">
            {[64, 56, 72, 56].map((w, i) => (
              <div
                key={i}
                className="h-4 bg-[#F3F3F3] rounded-full animate-pulse"
                style={{ width: `${w}px` }}
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[5fr_2fr] gap-8 mt-6 pb-6">
          <div className="flex flex-col gap-6 min-w-0">
            <div className="h-[280px] bg-[#F3F3F3] rounded-[14px] animate-pulse" />
            <div className="h-[200px] bg-[#F3F3F3] rounded-[14px] animate-pulse" />
            <div className="h-[240px] bg-[#F3F3F3] rounded-[14px] animate-pulse" />
          </div>

          <div className="flex flex-col gap-6">
            <div className="h-[320px] bg-[#F3F3F3] rounded-[14px] animate-pulse" />
            <div className="h-[200px] bg-[#F3F3F3] rounded-[14px] animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}
