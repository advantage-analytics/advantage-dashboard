/**
 * The profile's shape while its reads land — the identity row, the five-tile
 * strip and the 2:1 card grid, each at the height it will settle at, so the
 * page does not jump when the data arrives.
 */
export default function Loading() {
  return (
    <div className="w-full flex-1 bg-[var(--surface-card)]" aria-busy="true">
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-5 px-6 pt-5 pb-8 sm:px-14">
        {/* Identity */}
        <div className="flex items-center gap-5">
          <Pulse className="size-[76px] rounded-full" />
          <div className="flex flex-1 flex-col gap-2.5">
            <Pulse className="h-8 w-[260px] max-w-full rounded-md" />
            <Pulse className="h-3 w-[220px] max-w-full rounded" />
          </div>
          <div className="flex shrink-0 gap-2">
            <Pulse className="h-9 w-[104px] rounded-[6px]" />
            <Pulse className="h-9 w-[110px] rounded-[6px]" />
          </div>
        </div>

        {/* KPI strip */}
        <div className="surface-card flex overflow-hidden">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex min-w-0 flex-1 flex-col gap-3 px-5 py-5">
              <Pulse className="h-2.5 w-20 rounded" />
              <Pulse className="h-7 w-16 rounded-md" />
              <Pulse className="h-2.5 w-24 rounded" />
            </div>
          ))}
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-[1.9fr_1fr]">
          <div className="flex flex-col gap-4">
            <div className="surface-card flex flex-col gap-3.5" style={{ padding: "18px 20px" }}>
              <Pulse className="h-2.5 w-20 rounded" />
              <div className="flex items-center gap-3">
                <Pulse className="size-8 rounded-[6px]" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Pulse className="h-3.5 w-32 rounded" />
                  <Pulse className="h-2.5 w-44 rounded" />
                </div>
                <Pulse className="h-4 w-24 rounded" />
              </div>
            </div>
            <div className="surface-card flex flex-col gap-3" style={{ padding: 20 }}>
              <Pulse className="h-2.5 w-24 rounded" />
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex h-8 items-center gap-3">
                  <Pulse className="h-2.5 w-10 rounded" />
                  <Pulse className="h-3 w-32 rounded" />
                  <Pulse className="h-3 flex-1 rounded" />
                  <Pulse className="h-2.5 w-16 rounded" />
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <div className="surface-card flex flex-col gap-3" style={{ padding: 20 }}>
              <Pulse className="h-2.5 w-20 rounded" />
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex h-8 items-center gap-3">
                  <Pulse className="h-2.5 w-6 rounded" />
                  <Pulse className="h-3 w-8 rounded" />
                  <Pulse className="h-2.5 flex-1 rounded" />
                </div>
              ))}
            </div>
            <div className="surface-card flex flex-col gap-3" style={{ padding: "18px 20px" }}>
              <Pulse className="h-2.5 w-28 rounded" />
              <Pulse className="h-4 w-48 rounded" />
              <Pulse className="h-3.5 w-full rounded-[4px]" />
              <Pulse className="h-3.5 w-full rounded-[4px]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Pulse({ className = "" }: { className?: string }) {
  return (
    <div
      className={`bg-[var(--color-surface-muted)] animate-pulse motion-reduce:animate-none ${className}`}
    />
  );
}
