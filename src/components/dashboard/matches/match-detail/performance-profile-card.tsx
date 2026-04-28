import { Info } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { RadarChartSection } from "./radar-chart-section";

interface PerformanceProfileCardProps {
  data: Array<{ stat: string; p1: number; p2: number }>;
  p1Name: string;
  p2Name: string;
}

const EMPTY_STATE_GEOMETRY = (() => {
  const RADIUS = 108;
  const CENTER = 150;
  const SIDES = 8;
  const angles = Array.from(
    { length: SIDES },
    (_, i) => -Math.PI / 2 + (i * 2 * Math.PI) / SIDES,
  );
  const points = angles.map((a) => ({
    x: CENTER + RADIUS * Math.cos(a),
    y: CENTER + RADIUS * Math.sin(a),
  }));
  const polygon = points.map((p) => `${p.x},${p.y}`).join(" ");
  return { CENTER, points, polygon };
})();

export function PerformanceProfileCard({
  data,
  p1Name,
  p2Name,
}: PerformanceProfileCardProps) {
  const headingId = "performance-profile-heading";
  const hasData = data.length > 0;
  const p1Leads = data.filter((d) => d.p1 > d.p2).length;
  const p2Leads = data.filter((d) => d.p2 > d.p1).length;
  const tallyLeader =
    p1Leads === p2Leads ? null : p1Leads > p2Leads ? "p1" : "p2";
  const tallyIsTie = tallyLeader === null;

  return (
    <section
      aria-labelledby={headingId}
      className="surface-card flex flex-col gap-4 py-[21px]"
    >
      <div className="px-5 flex items-center gap-1.5">
        <h2
          id={headingId}
          className="text-[10px] font-medium text-[var(--color-text-dim)] uppercase tracking-[2.5px] leading-[15px]"
        >
          Performance Profile
        </h2>
        {hasData && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Show all stats"
                aria-haspopup="dialog"
                className="relative inline-flex items-center justify-center size-5 -m-1 text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue-ring)] rounded-full"
              >
                <Info className="size-3" strokeWidth={1.75} aria-hidden="true" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="center"
              sideOffset={8}
              collisionPadding={16}
              role="dialog"
              aria-label="All stats"
              className="!bg-white !text-[var(--color-text-primary)] !rounded-xl !p-0 !border !border-[#F3F3F3] !shadow-[0px_4px_16px_0px_rgba(0,0,0,0.08)] !w-auto"
            >
              <div className="w-[260px] py-4 px-4 flex flex-col gap-3.5">
                <div className="flex flex-col gap-2">
                  <span className="text-[9px] font-medium text-[var(--color-text-dim)] uppercase tracking-[2.5px] leading-[13px]">
                    Performance Profile
                  </span>
                  <div className="flex items-center justify-between gap-3 min-w-0">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <TooltipLegendName
                        color="var(--color-player-1)"
                        name={p1Name}
                      />
                      <TooltipLegendName
                        color="var(--color-player-2)"
                        name={p2Name}
                      />
                    </div>
                    <span className="text-[9px] font-normal text-[var(--color-text-dim)] tabular-nums leading-[13px] shrink-0">
                      {data.length} · 0–100
                    </span>
                  </div>
                </div>
                <div className="h-px bg-[#F3F3F3] -mx-4" />
                <ul className="flex flex-col gap-1.5 max-h-[228px] overflow-y-auto -mx-0.5 px-0.5">
                  {data.map((d) => {
                    const leader =
                      d.p1 === d.p2 ? null : d.p1 > d.p2 ? "p1" : "p2";
                    const isTie = leader === null;
                    return (
                      <li
                        key={d.stat}
                        className="flex items-start justify-between gap-3 text-[11px] leading-[16px]"
                      >
                        <span className="text-[var(--color-text-secondary)] min-w-0">
                          {d.stat}
                        </span>
                        <span className="flex items-baseline gap-1 shrink-0 tabular-nums">
                          <span
                            className={`text-[var(--color-player-1)] transition-opacity ${
                              leader === "p1"
                                ? "font-semibold"
                                : isTie
                                  ? "font-normal"
                                  : "font-normal opacity-55"
                            }`}
                          >
                            {Math.round(d.p1)}
                          </span>
                          <span className="text-[11px] text-[var(--color-text-dim)]">
                            ·
                          </span>
                          <span
                            className={`text-[var(--color-player-2)] transition-opacity ${
                              leader === "p2"
                                ? "font-semibold"
                                : isTie
                                  ? "font-normal"
                                  : "font-normal opacity-55"
                            }`}
                          >
                            {Math.round(d.p2)}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <div className="h-px bg-[#F3F3F3] -mx-4" />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[9px] font-medium text-[var(--color-text-dim)] uppercase tracking-[2.5px] leading-[13px]">
                    Stats Leading
                  </span>
                  <span className="flex items-baseline gap-1.5 shrink-0 tabular-nums leading-[18px]">
                    <span
                      className={`text-[13px] text-[var(--color-player-1)] transition-opacity ${
                        tallyLeader === "p1"
                          ? "font-semibold"
                          : tallyIsTie
                            ? "font-medium"
                            : "font-normal opacity-55"
                      }`}
                    >
                      {p1Leads}
                    </span>
                    <span className="text-[12px] text-[var(--color-text-dim)]">
                      ·
                    </span>
                    <span
                      className={`text-[13px] text-[var(--color-player-2)] transition-opacity ${
                        tallyLeader === "p2"
                          ? "font-semibold"
                          : tallyIsTie
                            ? "font-medium"
                            : "font-normal opacity-55"
                      }`}
                    >
                      {p2Leads}
                    </span>
                  </span>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      <div className="px-2">
        {hasData ? (
          <RadarChartSection data={data} p1Name={p1Name} p2Name={p2Name} />
        ) : (
          <EmptyState />
        )}
      </div>

      {hasData && (
        <>
          <div className="px-5 flex justify-end">
            <span className="text-[10px] font-normal text-[var(--color-text-faint)] leading-[14px]">
              Select an axis for detail
            </span>
          </div>

          <div className="px-5">
            <div
              aria-hidden="true"
              className="h-px bg-[var(--color-border-card)]"
            />
          </div>

          <div className="px-5 flex items-center justify-end sm:justify-between gap-x-3 gap-y-2 flex-wrap">
            <span className="hidden sm:inline text-[10px] font-normal text-[var(--color-text-faint)]">
              {data.length} Categories
            </span>
            <div className="flex items-center gap-3">
              <LegendDot color="var(--color-player-1)" name={p1Name} />
              <LegendDot color="var(--color-player-2)" name={p2Name} />
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function TooltipLegendName({
  color,
  name,
}: {
  color: string;
  name: string;
}) {
  return (
    <div className="flex items-center gap-1.5 min-w-0 flex-1">
      <span
        aria-hidden="true"
        className="size-2 rounded-[2px] shrink-0"
        style={{ backgroundColor: color }}
      />
      <span className="text-[10px] font-normal text-[var(--color-text-muted)] leading-4 truncate">
        {name}
      </span>
    </div>
  );
}

function LegendDot({ color, name }: { color: string; name: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className="size-2 rounded-[2px] shrink-0"
        style={{ backgroundColor: color }}
      />
      <span className="text-[10px] font-normal text-[var(--color-text-muted)] leading-4 whitespace-nowrap">
        {name}
      </span>
    </div>
  );
}

function EmptyState() {
  const { CENTER, points, polygon } = EMPTY_STATE_GEOMETRY;
  return (
    <div
      className="relative flex items-center justify-center"
      style={{ height: 300 }}
      role="status"
      aria-label="No comparison data yet"
    >
      <svg
        className="absolute inset-0 m-auto opacity-40"
        width={300}
        height={300}
        viewBox="0 0 300 300"
        aria-hidden="true"
      >
        {[0.33, 0.66, 1].map((scale) => (
          <polygon
            key={scale}
            points={points
              .map(
                (p) =>
                  `${CENTER + (p.x - CENTER) * scale},${CENTER + (p.y - CENTER) * scale}`,
              )
              .join(" ")}
            fill="none"
            stroke="var(--color-radar-grid)"
            strokeWidth={1}
          />
        ))}
        {points.map((p, i) => (
          <line
            key={i}
            x1={CENTER}
            y1={CENTER}
            x2={p.x}
            y2={p.y}
            stroke="var(--color-radar-grid)"
            strokeWidth={1}
          />
        ))}
        <polygon
          points={polygon}
          fill="var(--color-text-faint)"
          fillOpacity={0.05}
        />
      </svg>
      <div className="relative flex flex-col items-center text-center gap-1 px-5 max-w-[220px]">
        <p className="text-[12px] font-medium text-[var(--color-text-primary)] leading-[18px]">
          Profile not yet available
        </p>
        <p className="text-[11px] font-normal text-[var(--color-text-muted)] leading-[1.6]">
          Comparison stats appear once this match is analyzed.
        </p>
      </div>
    </div>
  );
}
