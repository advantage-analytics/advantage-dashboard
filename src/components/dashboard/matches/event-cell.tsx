/**
 * The Event cell of a Matches row — a match's and a draft's alike, so the
 * two cannot drift. The occasion in `--ink-600`, with the round trailing it
 * in mono; filed with no event, a muted "No event" rather than an invented
 * one. A practice session filed with no event reads "Practice" in the cell's
 * own ink instead — it is the occasion, not an absence; filed under a named
 * event, the event name still wins. The round never truncates; a tournament
 * losing its tail is the smaller loss.
 */
export function EventCell({
  name,
  round,
  practice = false,
}: {
  name: string | null;
  round?: string | null;
  /** A practice session (`isPracticeMatch`) — names the empty cell "Practice". */
  practice?: boolean;
}): React.JSX.Element {
  return (
    <span
      className="flex min-w-0 items-baseline gap-1 overflow-hidden text-[12px]"
      style={{ color: "var(--ink-600)" }}
    >
      {name ? (
        <span className="min-w-0 truncate">{name}</span>
      ) : practice ? (
        <span className="min-w-0 truncate">Practice</span>
      ) : (
        <span className="min-w-0 truncate" style={{ color: "var(--ink-400)" }}>
          No event
        </span>
      )}
      {round && (
        <span
          className="mono shrink-0 text-[11px]"
          style={{ color: "var(--ink-400)" }}
        >
          · {round}
        </span>
      )}
    </span>
  );
}
