export default function Loading() {
  return (
    <div className="flex-1 w-full bg-white" aria-busy="true">
      <div className="mx-auto max-w-screen-2xl px-6 sm:px-8 py-8 sm:py-10">
        {/* Hero */}
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-4 min-w-0">
            <div className="flex flex-col gap-3">
              <Pulse className="h-2.5 w-14 rounded" />
              <Pulse className="h-9 w-[420px] max-w-full rounded-md" />
            </div>
            <div className="flex items-center gap-4">
              <Pulse className="h-3 w-24 rounded" />
              <Pulse className="h-3 w-20 rounded" />
              <Pulse className="h-3 w-16 rounded" />
            </div>
          </div>
          <div className="shrink-0 flex items-center gap-3.5">
            <Pulse className="h-4 w-12 rounded" />
            <Pulse className="h-4 w-12 rounded" />
          </div>
        </div>

        {/* Match Summary */}
        <div className="mt-8 surface-card flex flex-col gap-3 p-5">
          <div className="border-b border-[var(--color-border-card)] pb-3 flex items-center justify-between">
            <Pulse className="h-2.5 w-32 rounded" />
            <Pulse className="h-2.5 w-12 rounded" />
          </div>
          <div className="flex justify-end gap-1.5">
            {[0, 1, 2].map((i) => (
              <Pulse key={i} className="h-3 w-10 rounded" />
            ))}
          </div>
          <div className="flex flex-col gap-4">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center justify-between gap-4">
                <div className="flex flex-col gap-2">
                  <Pulse className="h-4 w-36 rounded" />
                  <Pulse className="h-3 w-48 rounded" />
                </div>
                <div className="flex gap-1.5">
                  {[0, 1, 2].map((j) => (
                    <Pulse key={j} className="h-6 w-10 rounded" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* KPI Row */}
        <div className="mt-8 surface-card overflow-hidden">
          <div className="flex items-stretch">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="flex-1 min-w-0 flex flex-col gap-3 px-5 py-5"
              >
                <Pulse className="h-2.5 w-20 rounded" />
                <Pulse className="h-7 w-16 rounded-md" />
                <Pulse className="h-1 w-full rounded-full" />
                <div className="flex justify-between">
                  <Pulse className="h-2.5 w-6 rounded" />
                  <Pulse className="h-2.5 w-6 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 2-col grid */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-8">
          {/* Left: Statistics */}
          <div className="surface-card flex flex-col">
            <div className="flex items-center justify-between h-14 px-5">
              <Pulse className="h-2.5 w-20 rounded" />
              <div className="flex gap-8">
                <Pulse className="h-2.5 w-16 rounded" />
                <Pulse className="h-2.5 w-20 rounded" />
              </div>
            </div>
            <div className="px-5 pb-5 flex flex-col gap-5">
              {[6, 8, 6].map((rowCount, sectionIdx) => (
                <div key={sectionIdx} className="flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Pulse className="h-3 w-14 rounded" />
                    <div className="h-px w-full bg-[var(--color-border-card)]" />
                  </div>
                  <div className="flex flex-col gap-3">
                    {Array.from({ length: rowCount }).map((_, rowIdx) => (
                      <div key={rowIdx} className="flex items-center gap-4">
                        <Pulse
                          className="h-3 flex-1 max-w-[180px] rounded"
                          style={{ width: `${110 + ((rowIdx * 23) % 70)}px` }}
                        />
                        <div className="flex items-center shrink-0 gap-x-8">
                          <Pulse className="h-3.5 w-14 rounded" />
                          <Pulse className="h-3.5 w-14 rounded" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right column: AI Insight + Performance Profile + Key Moments */}
          <div className="flex flex-col gap-6">
            {/* AI Insight */}
            <div className="surface-card flex flex-col gap-2.5 p-5">
              <Pulse className="h-2.5 w-20 rounded" />
              <Pulse className="h-3.5 w-40 rounded" />
              <div className="flex flex-col gap-2">
                <Pulse className="h-3 w-full rounded" />
                <Pulse className="h-3 w-5/6 rounded" />
                <Pulse className="h-3 w-4/6 rounded" />
              </div>
            </div>

            {/* Performance Profile */}
            <div className="surface-card flex flex-col">
              <div className="flex items-center justify-between h-14 px-5">
                <Pulse className="h-2.5 w-36 rounded" />
                <Pulse className="h-2.5 w-24 rounded" />
              </div>
              <div className="px-5 pb-4 flex items-center justify-center">
                <Pulse className="size-[260px] rounded-full" />
              </div>
              <div className="px-5">
                <div className="h-px w-full bg-[var(--color-border-card)]" />
              </div>
              <div className="px-5 py-3.5 flex items-center justify-between">
                <Pulse className="h-2.5 w-20 rounded" />
                <div className="flex gap-3">
                  <Pulse className="h-2.5 w-20 rounded" />
                  <Pulse className="h-2.5 w-20 rounded" />
                </div>
              </div>
            </div>

            {/* Key Moments */}
            <div className="surface-card flex-1 flex flex-col">
              <div className="flex items-center justify-between h-14 px-5">
                <Pulse className="h-2.5 w-24 rounded" />
                <Pulse className="h-2.5 w-14 rounded" />
              </div>
              <div className="px-5 pb-5 flex flex-col gap-4">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex gap-3 items-stretch">
                    <div className="w-px bg-[var(--color-border-card)] rounded-full" />
                    <div className="flex-1 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-3">
                        <Pulse className="h-2.5 w-24 rounded" />
                        <Pulse className="h-2.5 w-20 rounded" />
                      </div>
                      <Pulse className="h-3 w-full rounded" />
                      <Pulse className="h-2.5 w-3/4 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Momentum Tracker */}
        <div className="mt-10 surface-card">
          <div className="flex items-center justify-between h-14 px-5">
            <Pulse className="h-2.5 w-36 rounded" />
            <div className="flex gap-4">
              <Pulse className="h-2.5 w-20 rounded" />
              <Pulse className="h-2.5 w-24 rounded" />
              <Pulse className="h-2.5 w-24 rounded" />
            </div>
          </div>
          <div className="px-5 pb-5">
            <Pulse className="h-[160px] w-full rounded-[12px]" />
          </div>
        </div>

        {/* Serve Placement */}
        <div className="mt-10 surface-card">
          <div className="flex items-center justify-between h-14 px-5">
            <Pulse className="h-2.5 w-36 rounded" />
            <div className="flex gap-2">
              <Pulse className="h-7 w-24 rounded-full" />
              <Pulse className="h-7 w-20 rounded-full" />
              <Pulse className="h-7 w-20 rounded-full" />
            </div>
          </div>
          <div className="px-5 pb-5">
            <Pulse className="h-[300px] w-full rounded-[12px]" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Pulse({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`bg-[var(--color-surface-muted)] animate-pulse motion-reduce:animate-none ${className}`}
      style={style}
    />
  );
}
