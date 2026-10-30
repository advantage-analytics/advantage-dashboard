import { RowAction } from "@/components/dashboard/schedule/row-action";
import { MatchCardList } from "@/components/dashboard/matches/match-card-list";
import {
  LIST_MIN_WIDTH,
  LIST_ROW_FRAME,
  MATCHES_PAGE_SIZE,
  listColumnLabels,
  listGridCols,
} from "@/components/dashboard/matches/match-list-layout";
import {
  GHOST_OPACITY,
  GhostRule,
} from "@/components/dashboard/home/day-zero-shape";
import {
  CardEmpty,
  type CardSubject,
} from "@/components/dashboard/shared/card-empty";
import type { DisplayMatch } from "@/lib/data/matches-list-types";
import { cn } from "@/lib/utils";

/**
 * Every match this player has played, drawn by the Matches list's own row.
 *
 * Same columns, same 52px rows, same Analysis cell as `/dashboard/matches`,
 * in its personal scope: the Player column drops because the page already
 * says whose matches these are. So a coach who follows "All N in Matches"
 * lands on a list that looks like the one they just read. Rows open the
 * report (no `onToggle`: the Matches page's drawer is not on this page).
 *
 * The loader has already turned each row to this player's side
 * (`fromPlayerSide`) — the list row reads player1 as "you".
 *
 * The first page only (`MATCHES_PAGE_SIZE`); the link carries the rest. A
 * match with no score is left out here as it is on the Matches page, by the
 * same transform.
 *
 * The card's width is the page's, so the full column set fits; below it the
 * table scrolls inside the card, as the Matches page's does.
 */
export function MatchHistoryCard({
  matches,
  matchesPlayed,
  playerName,
  subject,
  importHref,
}: {
  matches: DisplayMatch[];
  /**
   * Every match on record, scored or not. Above zero with no rows means the
   * matches exist but none has a score yet — the list's transform leaves those
   * out — which is not the same as "no matches yet".
   */
  matchesPlayed: number;
  /** For the Matches list's own player filter, which keys on the name. */
  playerName: string;
  subject: CardSubject;
  /**
   * The wizard on its SwingVision import, for the empty state — or null when
   * this viewer cannot upload for the program, which leaves the band textual.
   */
  importHref: string | null;
}) {
  const allHref = `/dashboard/matches?player=${encodeURIComponent(playerName)}`;
  const shown = matches.slice(0, MATCHES_PAGE_SIZE);

  return (
    <section
      aria-label="Match history"
      className="surface-card flex min-w-0 flex-col"
      style={{ padding: "20px 24px 8px" }}
    >
      <div className="flex items-center gap-2.5 pb-1">
        <span className="eyebrow">Match history</span>
        <div className="flex-1" />
        {/* "All 0 matches" would be a link to an empty list. */}
        {matches.length > 0 && (
          <RowAction href={allHref}>All {matches.length} in Matches</RowAction>
        )}
      </div>

      <div className="-mx-6 overflow-x-auto px-6">
        <div className={LIST_MIN_WIDTH}>
          {/* Column headers — the Matches list's own, hairline underneath. */}
          <div
            className={cn(
              LIST_ROW_FRAME,
              "border-b border-[var(--border-hairline)] pt-3.5 pb-2.5",
            )}
            style={listGridCols("personal")}
            role="row"
          >
            {listColumnLabels("personal").map((label, i) => (
              <span
                key={label || `col-${i}`}
                className="eyebrow-sm min-w-0 truncate"
                role="columnheader"
              >
                {label}
              </span>
            ))}
          </div>

          {shown.length === 0 && matchesPlayed > 0 ? (
            <p role="status" className="text-body-sm py-4">
              {subject.isSelf ? "Your" : `${subject.firstName}'s`} matches list
              here once they have a score.
            </p>
          ) : shown.length === 0 ? (
            <CardEmpty
              description="No matches yet: this card lists every match with its date, opponent, result, score, event and analysis."
              band={{
                title: subject.isSelf
                  ? "Every match you play, newest first"
                  : `Every match ${subject.firstName} plays, newest first`,
                body: "Each row opens its full report. Matches tracked in SwingVision import straight in.",
                action: importHref
                  ? { label: "Import from SwingVision", href: importHref }
                  : undefined,
              }}
            >
              {GHOST_OPACITY.slice(0, 3).map((opacity) => (
                <div
                  key={opacity}
                  className={cn(LIST_ROW_FRAME, "h-[52px]")}
                  style={{ ...listGridCols("personal"), opacity }}
                >
                  <GhostRule width="60%" />
                  <GhostRule width="55%" tone="200" shape="tall" />
                  <GhostRule width="14px" shape="dot" />
                  <GhostRule width="70%" />
                  <GhostRule width="60%" />
                  <GhostRule width="50%" />
                </div>
              ))}
            </CardEmpty>
          ) : (
            <div>
              {shown.map((match) => (
                <MatchCardList key={match.id} match={match} scope="personal" />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
