import { LIST_GRID_COLS } from "./match-card-list";

const SKELETON_ROWS = 5;
const SKELETON_COLS = 6;

function Bar({ className }: { className: string }): React.JSX.Element {
  return <div className={`rounded bg-[#F0F0F0] animate-pulse ${className}`} />;
}

export function MatchesSkeleton(): React.JSX.Element {
  return (
    <div aria-busy="true" aria-label="Loading matches">
      {/* Toolbar skeleton */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Bar key={i} className="h-8 w-24 rounded-full" />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Bar className="h-8 w-48 rounded-full" />
          <Bar className="h-8 w-28 rounded-full" />
          <Bar className="h-8 w-[62px] rounded-full" />
        </div>
      </div>

      {/* Column header skeleton */}
      <div
        className="grid gap-x-4 items-center px-4 py-2.5 border-b border-[#F0F0F0] mb-4"
        style={LIST_GRID_COLS}
      >
        {Array.from({ length: SKELETON_COLS }).map((_, i) => (
          <Bar key={i} className="h-2.5 w-12" />
        ))}
      </div>

      {/* Row skeletons */}
      {Array.from({ length: SKELETON_ROWS }).map((_, row) => (
        <div
          key={row}
          className="grid gap-x-4 items-center px-4 h-11 mb-0.5"
          style={LIST_GRID_COLS}
        >
          <div className="flex flex-col gap-1">
            <Bar className="h-3 w-32" />
            <Bar className="h-2 w-16" />
          </div>
          <Bar className="h-5 w-11 rounded-full" />
          <Bar className="h-3 w-20" />
          <Bar className="h-3 w-28" />
          <Bar className="h-3 w-16" />
          <Bar className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}
