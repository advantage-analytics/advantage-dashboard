import type { MatchPoint } from "@/lib/data/match-points-server";

interface PressurePointsCardProps {
  points: MatchPoint[];
}

interface Row {
  label: string;
  won: number;
  total: number;
}

const REGULAR_GAME_SCORES = new Set([0, 15, 30, 40]);

function isDeucePoint(pointScore: string): boolean {
  return pointScore === "40-40" || pointScore.includes("Ad");
}

// Tiebreak point scores use raw counts (e.g. "5-3") instead of 15/30/40.
// A regular game score is always a hyphenated pair from {0, 15, 30, 40} or
// contains "Ad", so anything purely numeric with a value outside that set is
// a tiebreak.
function isTiebreakPoint(pointScore: string): boolean {
  const m = /^(\d+)-(\d+)$/.exec(pointScore);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  return !REGULAR_GAME_SCORES.has(a) || !REGULAR_GAME_SCORES.has(b);
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
  let mpServeWon = 0;
  let mpServeTotal = 0;
  let mpReturnWon = 0;
  let mpReturnTotal = 0;
  let deuceWon = 0;
  let deuceTotal = 0;
  let tiebreakWon = 0;
  let tiebreakTotal = 0;

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

    if (p.isMatchPoint) {
      if (p.serverIsPlayer1) {
        mpServeTotal += 1;
        if (p1Won) mpServeWon += 1;
      } else {
        mpReturnTotal += 1;
        if (p1Won) mpReturnWon += 1;
      }
    }

    if (isDeucePoint(p.pointScore)) {
      deuceTotal += 1;
      if (p1Won) deuceWon += 1;
    }

    if (isTiebreakPoint(p.pointScore)) {
      tiebreakTotal += 1;
      if (p1Won) tiebreakWon += 1;
    }
  }

  const rows: Row[] = [
    { label: "Break Points Won", won: bpWon, total: bpTotal },
    { label: "Break Points Saved", won: bpSavedWon, total: bpSavedTotal },
    { label: "Set Points Serving", won: spServeWon, total: spServeTotal },
    { label: "Set Points Returning", won: spReturnWon, total: spReturnTotal },
  ];

  if (mpServeTotal > 0 || mpReturnTotal > 0) {
    rows.push({ label: "Match Points Serving", won: mpServeWon, total: mpServeTotal });
    rows.push({ label: "Match Points Returning", won: mpReturnWon, total: mpReturnTotal });
  }

  if (deuceTotal > 0) {
    rows.push({ label: "Deuce Points Won", won: deuceWon, total: deuceTotal });
  }

  if (tiebreakTotal > 0) {
    rows.push({ label: "Tiebreak Points Won", won: tiebreakWon, total: tiebreakTotal });
  }

  return rows;
}

function pctColor(pct: number | null): string {
  if (pct === null) return "var(--color-text-dim)";
  if (pct < 35) return "var(--color-error-strong)";
  if (pct > 60) return "var(--color-success)";
  return "var(--color-text-secondary)";
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

      <div className="flex flex-col gap-4 px-5 pb-5">
        {rows.map((r) => {
          const pct = r.total > 0 ? Math.round((r.won / r.total) * 100) : null;
          return (
            <div
              key={r.label}
              className="flex items-center gap-3 text-[11px] leading-[16px]"
            >
              <span className="flex-1 min-w-0 font-light text-[var(--color-text-body)] truncate">
                {r.label}
              </span>
              <span className="font-normal text-[var(--color-text-secondary)] w-[56px] text-right tabular-nums shrink-0">
                {r.total > 0 ? `${r.won}/${r.total}` : "—"}
              </span>
              <span
                className="font-medium w-[40px] text-right tabular-nums shrink-0"
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
