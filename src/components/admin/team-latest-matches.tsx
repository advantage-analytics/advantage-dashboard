"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import {
  MatchStatus,
  UploadedAt,
} from "@/components/admin/matches/matches-page-content";
import type { AdminTeamLatestMatch } from "@/lib/data/admin-team-links";

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
 */
export function TeamLatestMatches({
  programId,
  matches,
  matchCount,
}: {
  programId: string;
  matches: readonly AdminTeamLatestMatch[];
  /** Every match filed under the program; null when the count failed. */
  matchCount: number | null;
}) {
  const program = encodeURIComponent(programId);
  const allHref = `/admin/matches?program=${program}`;

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
        <Link
          href={allHref}
          className="inline-flex items-center gap-0.5 text-[12px] text-[var(--ink-600)] transition-colors duration-200 hover:text-[var(--ink-900)]"
        >
          {matchCount == null
            ? "All in Matches"
            : `All ${matchCount} in Matches`}
          <ChevronRight
            aria-hidden="true"
            className="size-3.5 text-[var(--ink-400)]"
            strokeWidth={1.75}
          />
        </Link>
      </div>

      {matches.length === 0 ? (
        <p className="text-[12px] text-[var(--ink-500)]">
          No matches uploaded yet.
        </p>
      ) : (
        <ul className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]">
          {matches.map((match) => (
            <li
              key={match.id}
              className="border-t border-[var(--border-hairline)] first:border-t-0"
            >
              <Link
                href={`${allHref}&id=${encodeURIComponent(match.id)}`}
                className="grid min-h-11 grid-cols-[minmax(0,1fr)_minmax(160px,0.5fr)_96px] items-center gap-x-3.5 px-4 py-1.5 transition-colors duration-200 hover:bg-[var(--surface-subtle)]"
              >
                <span className="min-w-0 truncate text-[13px] font-medium text-[var(--ink-900)]">
                  {match.player} vs {match.opponent}
                </span>
                <span className="flex min-w-0 overflow-hidden">
                  <MatchStatus
                    row={{ analysis: match.analysis, verification: null }}
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
