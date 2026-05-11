import { Info } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PLAYER_1, PLAYER_2 } from "@/lib/design/player-colors";

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
  const isTie = p1Leads === p2Leads;

  return (
    <section
      aria-labelledby={headingId}
      className="surface-card flex flex-col"
    >
      <div className="flex items-center justify-between gap-3 h-14 px-5">
        <div className="flex items-center gap-1.5 min-w-0">
          <h2
            id={headingId}
            className="text-[10px] font-medium text-[var(--color-text-dim)] uppercase tracking-[2.5px] leading-[15px]"
          >
            Performance Profile
          </h2>
          {hasData && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="About the Performance Profile"
                  className="relative inline-flex items-center justify-center size-5 -m-1 text-[var(--color-text-dim)] hover:text-[var(--color-text-secondary)] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-blue-ring)] rounded-full"
                >
                  <Info className="size-3" strokeWidth={1.75} aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                align="start"
                sideOffset={8}
                showArrow={false}
                className="!bg-white !text-[var(--color-text-primary)] !rounded-xl !px-0 !py-0 !border !border-[var(--color-border-card)] !shadow-[0px_4px_16px_0px_rgba(0,0,0,0.08)] !text-left !w-auto"
              >
                <div className="w-[260px] py-3.5 px-4 flex flex-col gap-2.5">
                  <span className="text-[9px] font-medium text-[var(--color-text-dim)] uppercase tracking-[2.5px] leading-[13px]">
                    Performance Profile
                  </span>
                  <p className="text-[11px] font-normal text-[var(--color-text-secondary)] leading-[16px]">
                    Each axis is a 0–100 score for one stat. The further out the
                    shape reaches, the stronger that player is on that axis.
                  </p>
                  <div className="h-px bg-[var(--color-border-card)] -mx-4" />
                  <p className="text-[10px] font-normal text-[var(--color-text-dim)] leading-[14px]">
                    Pick any axis — by tap, hover, or keyboard — to compare
                    both players on that stat. The full breakdown lives in the
                    stats table below.
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {hasData && (
          <HeadlineInsight
            p1Name={p1Name}
            p2Name={p2Name}
            p1Leads={p1Leads}
            p2Leads={p2Leads}
            isTie={isTie}
            total={data.length}
          />
        )}
      </div>

      <div className="flex flex-col gap-4 pb-[21px]">
        <div className="px-2">
          {hasData ? (
            <RadarChartSection data={data} p1Name={p1Name} p2Name={p2Name} />
          ) : (
            <EmptyState />
          )}
        </div>

        <div className="px-5">
          <div
            aria-hidden="true"
            className="h-px bg-[var(--color-border-card)]"
          />
        </div>

        <div className="px-5 flex items-center justify-between gap-x-3 gap-y-2 flex-wrap">
          <span className="text-[10px] font-normal text-[var(--color-text-faint)] tabular-nums">
            {hasData ? `${data.length} Categories` : "— Categories"}
          </span>
          <div className="flex items-center gap-3">
            <LegendDot
              color="var(--color-player-1)"
              name={p1Name}
              dim={!hasData}
            />
            <LegendDot
              color="var(--color-player-2)"
              name={p2Name}
              dim={!hasData}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function HeadlineInsight({
  p1Name,
  p2Name,
  p1Leads,
  p2Leads,
  isTie,
  total,
}: {
  p1Name: string;
  p2Name: string;
  p1Leads: number;
  p2Leads: number;
  isTie: boolean;
  total: number;
}) {
  if (isTie) {
    return (
      <span
        className="text-[10px] font-medium text-[var(--color-text-secondary)] leading-[14px] tabular-nums shrink-0"
        aria-label={`Categories tied ${p1Leads} to ${p2Leads}`}
      >
        Even
      </span>
    );
  }
  const p1Ahead = p1Leads > p2Leads;
  const leaderName = p1Ahead ? p1Name : p2Name;
  const leaderColor = p1Ahead ? PLAYER_1 : PLAYER_2;
  const leaderCount = p1Ahead ? p1Leads : p2Leads;
  return (
    <span
      className="flex items-center gap-1.5 shrink-0"
      aria-label={`${leaderName} leads ${leaderCount} of ${total} categories`}
    >
      <span className="text-[9px] font-normal text-[var(--color-text-dim)] uppercase tracking-[2.5px] leading-[14px]">
        Leads
      </span>
      <span
        aria-hidden="true"
        className="size-2 rounded-[2px]"
        style={{ backgroundColor: leaderColor }}
      />
      <span className="text-[10px] font-medium text-[var(--color-text-secondary)] leading-[14px] truncate max-w-[160px]">
        {leaderName}
      </span>
    </span>
  );
}

function LegendDot({
  color,
  name,
  dim,
}: {
  color: string;
  name: string;
  dim?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className="size-2 rounded-[2px] shrink-0"
        style={{
          backgroundColor: color,
          opacity: dim ? 0.45 : 1,
        }}
      />
      <span
        className={`text-[10px] font-normal leading-4 whitespace-nowrap ${
          dim
            ? "text-[var(--color-text-faint)]"
            : "text-[var(--color-text-muted)]"
        }`}
      >
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
