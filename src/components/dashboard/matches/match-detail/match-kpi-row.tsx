import type { PlayerStatistics } from "@/lib/data/types";

interface MatchKpiRowProps {
  duration: string | undefined;
  matchDurationSec: number | null;
  playingTimeSec: number;
  p1Stats: PlayerStatistics | undefined;
  p2Stats: PlayerStatistics | undefined;
  p1Name: string;
  p2Name: string;
}

const P1_COLOR = "var(--color-accent-blue)";
const P2_COLOR = "#A855F7";
const ACTIVE_PLAY_COLOR = "#5DB955";

function formatHm(totalSec: number): string {
  const t = Math.max(0, Math.round(totalSec));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}`;
  const s = t % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function MatchKpiRow({
  duration,
  matchDurationSec,
  playingTimeSec,
  p1Stats,
  p2Stats,
  p1Name,
  p2Name,
}: MatchKpiRowProps) {
  const durationLabel = duration && duration.trim().length > 0 ? duration : null;

  const p1Pts = p1Stats?.totalPointsWon ?? 0;
  const p2Pts = p2Stats?.totalPointsWon ?? 0;
  const p1Aces = p1Stats?.aces ?? 0;
  const p2Aces = p2Stats?.aces ?? 0;
  const p1Win = p1Stats?.winners ?? 0;
  const p2Win = p2Stats?.winners ?? 0;
  const p1Ue = p1Stats?.unforcedErrors ?? 0;
  const p2Ue = p2Stats?.unforcedErrors ?? 0;

  const activeRatio =
    matchDurationSec && matchDurationSec > 0 && playingTimeSec > 0
      ? Math.min(1, playingTimeSec / matchDurationSec)
      : null;
  const activePct = activeRatio !== null ? Math.round(activeRatio * 100) : null;
  const activeLabel = playingTimeSec > 0 ? formatHm(playingTimeSec) : null;

  return (
    <section
      aria-label="Match KPI summary"
      className="surface-card overflow-hidden"
    >
      <div className="flex items-stretch">
        <DurationCell
          value={durationLabel ?? "—"}
          activeLabel={activeLabel}
          activePct={activePct}
          activeRatio={activeRatio}
        />
        <KpiCell
          label="Total Points"
          value={String(p1Pts + p2Pts)}
          split={{ p1: p1Pts, p2: p2Pts, p1Name, p2Name }}
        />
        <KpiCell
          label="Aces"
          value={String(p1Aces + p2Aces)}
          split={{ p1: p1Aces, p2: p2Aces, p1Name, p2Name }}
        />
        <KpiCell
          label="Winners"
          value={String(p1Win + p2Win)}
          split={{ p1: p1Win, p2: p2Win, p1Name, p2Name }}
        />
        <KpiCell
          label="Unforced Errors"
          value={String(p1Ue + p2Ue)}
          split={{ p1: p1Ue, p2: p2Ue, p1Name, p2Name }}
        />
      </div>
    </section>
  );
}

interface KpiCellProps {
  label: string;
  value: string;
  split?: { p1: number; p2: number; p1Name: string; p2Name: string };
}

function KpiCell({ label, value, split }: KpiCellProps) {
  return (
    <div className="flex-1 min-w-0 flex flex-col gap-3 px-5 py-5">
      <p className="text-[9px] font-normal leading-[13.5px] tracking-[2.5px] text-[var(--color-text-dim)] uppercase whitespace-nowrap">
        {label}
      </p>
      <p className="text-[28px] font-light leading-[28px] tracking-[-0.5px] text-[var(--color-text-primary)] tabular-nums">
        {value}
      </p>
      {split && <SplitBar {...split} />}
    </div>
  );
}

interface DurationCellProps {
  value: string;
  activeLabel: string | null;
  activePct: number | null;
  activeRatio: number | null;
}

function DurationCell({
  value,
  activeLabel,
  activePct,
  activeRatio,
}: DurationCellProps) {
  const hasActive = activeLabel !== null && activeRatio !== null && activePct !== null;
  return (
    <div className="flex-1 min-w-0 flex flex-col gap-3 px-5 py-5">
      <p className="text-[9px] font-normal leading-[13.5px] tracking-[2.5px] text-[var(--color-text-dim)] uppercase whitespace-nowrap">
        Match Duration
      </p>
      <p className="text-[28px] font-light leading-[28px] tracking-[-0.5px] text-[var(--color-text-primary)] tabular-nums">
        {value}
      </p>
      {hasActive && (
        <div
          className="flex flex-col gap-1.5 w-full"
          aria-label={`${activeLabel} active play, ${activePct}% of elapsed time`}
        >
          <div
            className="h-[3px] w-full overflow-hidden rounded-full bg-[var(--color-border-card)]"
            role="presentation"
          >
            <div
              className="h-full rounded-full"
              style={{ width: `${activePct}%`, backgroundColor: ACTIVE_PLAY_COLOR }}
            />
          </div>
          <div className="flex items-baseline justify-between gap-2 text-[11px] leading-none tabular-nums">
            <span
              className="font-medium"
              style={{ color: ACTIVE_PLAY_COLOR }}
            >
              {activeLabel}
            </span>
            <span className="text-[var(--color-text-dim)] text-[10px] uppercase tracking-[1.5px]">
              {activePct}% live
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function SplitBar({
  p1,
  p2,
  p1Name,
  p2Name,
}: {
  p1: number;
  p2: number;
  p1Name: string;
  p2Name: string;
}) {
  const total = p1 + p2;
  const p1Pct = total > 0 ? (p1 / total) * 100 : 50;
  const p2Pct = 100 - p1Pct;

  return (
    <div
      className="flex flex-col gap-1.5 w-full"
      aria-label={`${p1Name} ${p1}, ${p2Name} ${p2}`}
    >
      <div
        className="flex h-[3px] w-full overflow-hidden rounded-full bg-[var(--color-border-card)]"
        role="presentation"
      >
        <div style={{ width: `${p1Pct}%`, backgroundColor: P1_COLOR }} />
        <div style={{ width: `${p2Pct}%`, backgroundColor: P2_COLOR }} />
      </div>
      <div className="flex items-center justify-between text-[11px] font-medium leading-none tabular-nums">
        <span style={{ color: P1_COLOR }}>{p1}</span>
        <span style={{ color: P2_COLOR }}>{p2}</span>
      </div>
    </div>
  );
}
