import { cn } from "@/lib/utils";
import { eventCellFade } from "./match-list-layout";

/**
 * The Event cell of a Matches row — a match's and a draft's alike, so the
 * two cannot drift. The occasion in `--ink-600`, with the round trailing it
 * in mono; filed with no event, a muted "No event" rather than an invented
 * one. Beside the open team drawer its track collapses to nothing and the
 * cell fades rather than leaving the tree — see `TEAM_LIST_GRID_COLS_COMPACT`.
 * The round never truncates; a tournament losing its tail is the smaller
 * loss.
 */
export function EventCell({
  name,
  round,
  hidden = false,
}: {
  name: string | null;
  round?: string | null;
  /** The team table beside the open drawer, with its Event track dropped. */
  hidden?: boolean;
}): React.JSX.Element {
  return (
    <span
      aria-hidden={hidden || undefined}
      className={cn(
        "flex min-w-0 items-baseline gap-1 overflow-hidden text-[12px]",
        eventCellFade(hidden),
      )}
      style={{ color: "var(--ink-600)" }}
    >
      {name ? (
        <span className="min-w-0 truncate">{name}</span>
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
