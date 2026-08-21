import {
  COMPARE_MEASURES,
  type PlayerComparison,
} from "@/lib/data/team-compare-server";

/**
 * The comparison itself: one row per measure, two numbers, and a bar that says
 * who leads by how much.
 *
 * The bar is the point. Two columns of percentages make a reader do ten
 * subtractions; a split bar makes the same ten answers legible at a glance and
 * keeps the exact figures for when one of them matters.
 *
 * ── Nothing here is coloured good or bad ────────────────────────────────────
 * Leading is shown as weight and width, not as green against red. Every measure
 * on this screen is one where more is better for the player it belongs to, so a
 * red number would be a judgement on a person rather than a fact about a rate —
 * and the two people being compared are on the same squad.
 */

function fmt(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)}%`;
}

export function CompareTable({
  left,
  right,
}: {
  left: PlayerComparison;
  right: PlayerComparison;
}) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-medium)]">
      {/* Header: who, and their record */}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)] items-end gap-4 border-b border-[var(--border-hairline)] bg-[var(--surface-page)] px-[18px] py-4">
        <PlayerHead player={left} align="left" />
        <span className="text-center text-[11px] tracking-[0.08em] text-[var(--ink-500)] uppercase">
          Season to date
        </span>
        <PlayerHead player={right} align="right" />
      </div>

      <ul>
        {COMPARE_MEASURES.map((measure, index) => {
          const a = left.measures[measure.key];
          const b = right.measures[measure.key];
          return (
            <li
              key={measure.key}
              className={
                index === 0 ? "" : "border-t border-[var(--border-hairline)]"
              }
            >
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)] items-center gap-4 px-[18px] py-3">
                <span
                  className={`text-left text-[14px] tabular-nums ${
                    leads(a, b)
                      ? "font-medium text-[var(--ink-900)]"
                      : "text-[var(--ink-700)]"
                  }`}
                >
                  {fmt(a)}
                </span>

                <div className="flex flex-col items-center gap-1.5">
                  <span
                    className="text-[12px] text-[var(--ink-700)]"
                    title={measure.hint}
                  >
                    {measure.label}
                  </span>
                  <SplitBar a={a} b={b} />
                </div>

                <span
                  className={`text-right text-[14px] tabular-nums ${
                    leads(b, a)
                      ? "font-medium text-[var(--ink-900)]"
                      : "text-[var(--ink-700)]"
                  }`}
                >
                  {fmt(b)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function leads(value: number | null, other: number | null): boolean {
  if (value === null || other === null) return false;
  return value > other;
}

/**
 * A single bar split at the ratio between the two values.
 *
 * Proportional to the pair, not to 100 — the question is "who leads and by how
 * much", and against a fixed axis two players separated by three points look
 * identical to two separated by thirty.
 */
function SplitBar({ a, b }: { a: number | null; b: number | null }) {
  if (a === null || b === null) {
    return <div className="h-1 w-full max-w-[180px] rounded-full bg-[var(--ink-100)]" />;
  }

  const total = a + b;
  // Both at zero is a real state — nobody has broken serve yet — and dividing
  // by it would render NaN% and collapse the bar. Split it evenly instead,
  // which is the truth: neither leads.
  const share = total === 0 ? 50 : (a / total) * 100;

  return (
    <div
      className="flex h-1 w-full max-w-[180px] overflow-hidden rounded-full bg-[var(--ink-100)]"
      role="img"
      aria-label={`${Math.round(a)} against ${Math.round(b)}`}
    >
      <span
        className="h-full bg-[var(--blue)]"
        style={{ width: `${share}%` }}
      />
      <span
        className="h-full bg-[var(--ink-300)]"
        style={{ width: `${100 - share}%` }}
      />
    </div>
  );
}

function PlayerHead({
  player,
  align,
}: {
  player: PlayerComparison;
  align: "left" | "right";
}) {
  return (
    <div className={`flex flex-col gap-0.5 ${align === "right" ? "text-right" : ""}`}>
      <span className="truncate text-[14px] text-[var(--ink-900)]">
        {player.name}
      </span>
      <span className="text-[11px] text-[var(--ink-500)] tabular-nums">
        {player.wins}–{player.losses} · {player.matchesPlayed}{" "}
        {player.matchesPlayed === 1 ? "match" : "matches"}
      </span>
    </div>
  );
}
