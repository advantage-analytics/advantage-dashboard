import Link from "next/link";
import type { DisplayMatch } from "@/lib/data/matches-list-types";
import { MatchesGrid } from "@/components/dashboard/matches/matches-grid";
import {
  LIST_ROW_FRAME,
  listColumnLabels,
  listGridCols,
} from "@/components/dashboard/matches/match-list-layout";
import { cn } from "@/lib/utils";
import { EmptyBand, GhostBar, HEAD_LINK, SectionHead } from "./home-title";

const GHOST_OPACITY = [1, 0.6, 0.3];
/** One bar per track, in the Matches table's own column order. */
const GHOST_WIDTHS = {
  personal: [40, 104, 14, 60, 120, 96],
  team: [40, 96, 104, 14, 60, 120, 96],
};

/**
 * The newest few matches, drawn by the Matches page's own table
 * (`MatchesGrid`) so a row reads the same in both places. Before the first
 * match it is that table's header over ghost rows, and one line on what goes
 * here.
 */
export function LatestMatches({
  matches,
  scope,
  empty,
}: {
  matches: DisplayMatch[];
  scope: "personal" | "team";
  empty: { title: string; body: string };
}) {
  return (
    <section aria-label="Latest matches" className="flex flex-col gap-2.5">
      <SectionHead title="Latest matches">
        <Link href="/dashboard/matches" className={HEAD_LINK}>
          All matches
        </Link>
      </SectionHead>
      {matches.length > 0 ? (
        <MatchesGrid matches={matches} scope={scope} />
      ) : (
        <div className="surface-card" style={{ padding: "2px 24px 6px" }}>
          <div
            className={cn(
              LIST_ROW_FRAME,
              "border-b border-[var(--border-hairline)] pt-3.5 pb-2.5",
            )}
            style={listGridCols(scope)}
          >
            {listColumnLabels(scope).map((label) => (
              <span key={label} className="eyebrow-sm min-w-0 truncate">
                {label}
              </span>
            ))}
          </div>
          {GHOST_OPACITY.map((opacity) => (
            <div
              key={opacity}
              aria-hidden
              className={cn(LIST_ROW_FRAME, "h-[52px]")}
              style={{ ...listGridCols(scope), opacity }}
            >
              {GHOST_WIDTHS[scope].map((width, i) => (
                <GhostBar key={i} width={width} round={width === 14} />
              ))}
            </div>
          ))}
          <EmptyBand title={empty.title} body={empty.body} />
        </div>
      )}
    </section>
  );
}
