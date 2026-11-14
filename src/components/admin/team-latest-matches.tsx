"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { TEAM_LIST_GRID } from "@/components/admin/admin-people-card";
import {
  MatchStatus,
  UploadedAt,
} from "@/components/admin/matches/matches-page-content";
import type { AdminConferenceLatestMatch } from "@/lib/data/admin-conferences-server";
import type { AdminTeamLatestMatch } from "@/lib/data/admin-team-links";

/** Admin › Matches, filtered to one workspace (its Program filter). */
function matchesHref(programId: string): string {
  return `/admin/matches?program=${encodeURIComponent(programId)}`;
}

/**
 * Where the list is drawn. The team page's (`scope` omitted or `"team"`) are
 * all one program's, so every row and the header link share `programId`. The
 * conference page's (`"conference"`) span several programs: each row links
 * into its own match's program and names it, and the "All N in Matches" link
 * is left off — Admin › Matches filters by program only, so there is no list
 * of one conference's matches to send it to.
 */
type TeamLatestMatchesProps =
  | {
      scope?: "team";
      programId: string;
      matches: readonly AdminTeamLatestMatch[];
      /** Every match filed under the program; null when the count failed. */
      matchCount: number | null;
    }
  | {
      scope: "conference";
      matches: readonly AdminConferenceLatestMatch[];
    };

/**
 * The team page's Latest matches (`TeamDetail.dc.html`): the loader's three
 * newest uploads, one line each — players, the status mark and its words,
 * when it was uploaded — and a link to Admin › Matches filtered to this
 * workspace (`?program=<programId>`, which that page reads as its Program
 * filter).
 *
 * The status and the time are Admin › Matches' own `MatchStatus` and
 * `UploadedAt`, so one match reads the same on both screens. Each row opens
 * that match's drawer on Matches (`?id=`), inside the same workspace filter.
 *
 * Rows sit on the People list's tracks (`TEAM_LIST_GRID`), the players
 * spanning its face and name tracks, so the status lines up under the roles
 * and the time under the row actions.
 *
 * The conference page draws the same list with `scope="conference"` (see
 * `TeamLatestMatchesProps`): the program's name goes under the players.
 */
export function TeamLatestMatches(props: TeamLatestMatchesProps) {
  const { matches } = props;
  const allHref =
    props.scope === "conference" ? null : matchesHref(props.programId);
  const rows = matches.map((match) => ({
    match,
    // The team page's rows stay inside the page's own program; the
    // conference page's each go to the program the match belongs to.
    href: `${allHref ?? matchesHref(match.programId)}&id=${encodeURIComponent(match.id)}`,
    programName:
      props.scope === "conference"
        ? (match as AdminConferenceLatestMatch).programName
        : null,
  }));

  return (
    <section
      aria-labelledby="team-latest-matches"
      className="flex flex-col gap-3"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2
          id="team-latest-matches"
          className="text-[14px] font-medium text-[var(--ink-900)]"
        >
          Latest matches
        </h2>
        {allHref && props.scope !== "conference" ? (
          <Link
            href={allHref}
            className="inline-flex items-center gap-0.5 text-[12px] text-[var(--ink-600)] transition-colors duration-200 hover:text-[var(--ink-900)]"
          >
            {props.matchCount == null
              ? "All in Matches"
              : `All ${props.matchCount} in Matches`}
            <ChevronRight
              aria-hidden="true"
              className="size-3.5 text-[var(--ink-400)]"
              strokeWidth={1.75}
            />
          </Link>
        ) : null}
      </div>

      {matches.length === 0 ? (
        <p className="text-[12px] text-[var(--ink-500)]">
          No matches uploaded yet.
        </p>
      ) : (
        <ul className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]">
          {rows.map(({ match, href, programName }) => (
            <li
              key={match.id}
              className="border-t border-[var(--border-hairline)] first:border-t-0"
            >
              <Link
                href={href}
                className={`${TEAM_LIST_GRID} min-h-11 px-4 py-1.5 transition-colors duration-200 hover:bg-[var(--surface-subtle)]`}
              >
                {programName == null ? (
                  <span className="col-span-2 min-w-0 truncate text-[13px] font-medium text-[var(--ink-900)]">
                    {match.player} vs {match.opponent}
                  </span>
                ) : (
                  <span className="col-span-2 flex min-w-0 flex-col gap-1">
                    <span className="truncate text-[13px] leading-none font-medium text-[var(--ink-900)]">
                      {match.player} vs {match.opponent}
                    </span>
                    <span className="truncate text-[12px] leading-none text-[var(--ink-600)]">
                      {programName}
                    </span>
                  </span>
                )}
                <span className="flex min-w-0 overflow-hidden">
                  <MatchStatus
                    row={{
                      analysis: match.analysis,
                      verification: match.verification,
                    }}
                  />
                </span>
                <span className="flex justify-end">
                  <UploadedAt at={match.uploadedAt} fresh={false} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
