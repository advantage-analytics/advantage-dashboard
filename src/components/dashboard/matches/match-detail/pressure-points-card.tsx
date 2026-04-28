import type { MatchPoint } from "@/lib/data/match-points-server";

interface PressurePointsCardProps {
  points: MatchPoint[];
}

interface Row {
  label: string;
  won: number;
  total: number;
}

function computeRows(points: MatchPoint[]): Row[] {
  let bpWon = 0;
  let bpTotal = 0;
  let bpSavedWon = 0;
  let bpSavedTotal = 0;
  let spServeWon = 0;
  let spServeTotal = 0;
  let spReturnWon = 0;
  let spReturnTotal = 0;

  for (const p of points) {
    const p1Won = p.wonByPlayer1;

    if (p.isBreakPoint) {
      if (!p.serverIsPlayer1) {
        bpTotal += 1;
        if (p1Won) bpWon += 1;
      } else {
        bpSavedTotal += 1;
        if (p1Won) bpSavedWon += 1;
      }
    }

    if (p.isSetPoint) {
      if (p.serverIsPlayer1) {
        spServeTotal += 1;
        if (p1Won) spServeWon += 1;
      } else {
        spReturnTotal += 1;
        if (p1Won) spReturnWon += 1;
      }
    }
  }

  return [
    { label: "Break Points Won", won: bpWon, total: bpTotal },
    { label: "Break Points Saved", won: bpSavedWon, total: bpSavedTotal },
    { label: "Set Points Serving", won: spServeWon, total: spServeTotal },
    { label: "Set Points Returning", won: spReturnWon, total: spReturnTotal },
  ];
}

function pctColor(pct: number | null): string {
  if (pct === null) return "var(--color-text-dim)";
  return pct >= 50 ? "var(--color-success)" : "var(--color-error-strong)";
}

export function PressurePointsCard({ points }: PressurePointsCardProps) {
  const rows = computeRows(points);
  const headingId = "pressure-points-heading";

  return (
    <section
      aria-labelledby={headingId}
      className="surface-card flex flex-col"
    >
      <div className="flex items-center h-14 px-5">
        <h2
          id={headingId}
          className="text-[10px] font-medium text-[var(--color-text-dim)] uppercase tracking-[2.5px] leading-[15px]"
        >
          Pressure Points
        </h2>
      </div>

      <div className="flex flex-col gap-2.5 px-5 pb-5">
        {rows.map((r) => {
          const pct = r.total > 0 ? Math.round((r.won / r.total) * 100) : null;
          return (
            <div
              key={r.label}
              className="flex items-center justify-between text-[11px] leading-[16px]"
            >
              <span className="font-light text-[var(--color-text-body)] w-[120px] truncate">
                {r.label}
              </span>
              <span className="font-normal text-[var(--color-text-dim)] w-[56px] text-right tabular-nums">
                {r.total > 0 ? `${r.won}/${r.total}` : "—"}
              </span>
              <span
                className="font-medium w-[40px] text-right tabular-nums"
                style={{ color: pctColor(pct) }}
              >
                {pct !== null ? `${pct}%` : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
