import { Check } from "lucide-react";
import { TIEBREAK_STYLE } from "@/components/dashboard/score-line";

/**
 * The rail scoreboard (H1 · B2, frames SB1–SB3): one widget, three states.
 *
 *   live      the film head's point — sets so far, the set in play, and a
 *             points cell behind a hairline; the clock is the head, in blue
 *   final     the whole match — set columns only, the loser's row in ink-600,
 *             a check beside the winner, the clock the match duration
 *   untagged  no score yet — a dash where the digits go, a dash for the clock
 *
 * Display only: no callbacks, no hover, no internal timer. The clock moves
 * because the caller passes a new `headTime`. Every cell has a fixed width so
 * the two rows' digits stay in a column, and the caption is one truncating
 * line, so the widget holds one height in every state and the view switcher
 * under it never jumps.
 *
 * Rows arrive in the order they are drawn. Which player is on top — the
 * roster player — is the caller's decision (`useMatchSides`), never this
 * component's.
 */

export type RailScoreboardStatus = "live" | "final" | "untagged";

export interface RailScoreboardPlayer {
  id: string;
  name: string;
  /** One entry per set column; null is an unmeasured set (an em dash). */
  sets: (number | null)[];
  /** Tiebreak points to superscript beside a set, aligned with `sets`. */
  tiebreaks?: (number | null)[];
  /** Per-set "this row lost it" — final only; unused when omitted. */
  lostSets?: boolean[];
  /** The live points cell ("30", "AD"). Live only; null is a dash. */
  points?: string | null;
  serving?: boolean;
  won?: boolean;
}

export interface RailScoreboardProps {
  players: [RailScoreboardPlayer, RailScoreboardPlayer];
  status: RailScoreboardStatus;
  /** The status word in sentence case ("Playing", "Final", "Retired"). */
  label: string;
  /** The film head, e.g. "41:12". Live only. */
  headTime?: string | null;
  /** The match length, e.g. "1:42:18". Final only. */
  duration?: string | null;
  /** Always one line; truncates rather than wraps. */
  caption: string;
}

function Dash({ label }: { label: string }) {
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className="sr-only">{label}</span>
    </>
  );
}

export function RailScoreboard({
  players,
  status,
  label,
  headTime,
  duration,
  caption,
}: RailScoreboardProps) {
  const clock =
    status === "live" ? headTime : status === "final" ? duration : null;
  const anyWinner = status === "final" && players.some((p) => p.won);

  return (
    // No card of its own (F1, settled): the rail's head, set off from the view
    // switcher by a hairline that stops 12px short of each rail edge.
    <div className="px-3">
      <div
        className="flex flex-col gap-[14px] border-b border-[var(--border-hairline)]"
        style={{ padding: "18px 13px 20px" }}
      >
        <div className="flex items-baseline gap-2">
          {/* `.text-micro` already paints ink-500, and is unlayered, so no
              colour utility beside it. */}
          <span className="text-micro">{label}</span>
          <div className="flex-1" />
          <span
            className="mono tabular text-[10px] font-medium"
            style={{
              color:
                status === "live" && clock ? "var(--blue)" : "var(--ink-400)",
            }}
          >
            {clock ?? <Dash label="No time" />}
          </span>
        </div>

        <div className="flex flex-col gap-[11px]">
          {players.map((player) => (
            <ScoreRow
              key={player.id}
              player={player}
              status={status}
              muted={anyWinner && !player.won}
            />
          ))}
        </div>

        <span className="text-micro tabular truncate">{caption}</span>
      </div>
    </div>
  );
}

function ScoreRow({
  player,
  status,
  muted,
}: {
  player: RailScoreboardPlayer;
  status: RailScoreboardStatus;
  /** The final's losing row: name and digits drop to ink-600. */
  muted: boolean;
}) {
  const ink = muted ? "var(--ink-600)" : "var(--ink-900)";

  return (
    <div className="flex min-w-0 items-center gap-[7px]">
      {/* Never wraps: a long name ends in an ellipsis before it can push the
          score group, which never shrinks, out of the 300px rail. */}
      <span
        className="min-w-0 truncate text-[13px] font-medium"
        style={{ color: ink }}
      >
        {player.name}
      </span>
      {status === "live" && player.serving ? (
        <span
          aria-label="Serving"
          role="img"
          className="size-1.5 shrink-0 rounded-[var(--radius-pill)] bg-[var(--blue)]"
        />
      ) : null}
      {status === "final" && player.won ? (
        <Check
          aria-label="Winner"
          strokeWidth={2}
          className="size-3 shrink-0 text-[var(--blue)]"
        />
      ) : null}
      <div className="flex-1" />

      {status === "untagged" || player.sets.length === 0 ? (
        <span className="mono tabular shrink-0 text-[13px] text-[var(--ink-400)]">
          <Dash label="No score" />
        </span>
      ) : (
        <span className="mono tabular inline-flex shrink-0 items-center gap-2 text-[13px] whitespace-nowrap">
          {player.sets.map((games, index) => {
            const lost = player.lostSets?.[index] ?? false;
            const tiebreak = lost ? (player.tiebreaks?.[index] ?? null) : null;
            return (
              <span
                key={index}
                className="w-[11px] text-right"
                style={{ color: games === null ? "var(--ink-400)" : ink }}
              >
                {games === null ? <Dash label="No score" /> : games}
                {tiebreak !== null ? (
                  // Zero-width, so the games digit stays flush right in its
                  // 11px slot and the raised digit hangs into the gap.
                  <span className="inline-block w-0">
                    <span aria-hidden="true" style={TIEBREAK_STYLE}>
                      {tiebreak}
                    </span>
                    <span className="sr-only"> tiebreak {tiebreak}</span>
                  </span>
                ) : null}
              </span>
            );
          })}
          {status === "live" ? (
            <>
              <span
                aria-hidden="true"
                className="mx-0.5 h-3 w-px bg-[var(--border-hairline)]"
              />
              <span
                className="w-[22px] text-right font-medium"
                style={{ color: player.points ? ink : "var(--ink-400)" }}
              >
                {player.points ?? <Dash label="No points" />}
              </span>
            </>
          ) : null}
        </span>
      )}
    </div>
  );
}
