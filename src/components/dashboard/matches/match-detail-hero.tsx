"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calendar, Upload } from "lucide-react";
import { MatchMetadataRow } from "@/components/dashboard/matches/match-metadata-row";
import { ShareMatchButton } from "@/components/dashboard/matches/match-detail/share-match-button";
import { MatchActionsMenu } from "@/components/dashboard/matches/match-actions/match-actions-menu";
import type { Match } from "@/lib/data/types";

interface MatchDetailHeroProps {
  match: Match;
  previousMatchId?: string | null;
  nextMatchId?: string | null;
}

const MATCHES_HREF = "/dashboard/matches";

export function MatchDetailHero({ match }: MatchDetailHeroProps) {
  const router = useRouter();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;

      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (target.isContentEditable) return;
      }
      if (document.querySelector('[role="dialog"], [data-state="open"]')) return;

      if (e.key === "Escape") {
        router.push(MATCHES_HREF);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  const hasTournament = Boolean(match.tournamentName?.trim());
  const heroTitle = hasTournament
    ? match.tournamentName
    : buildFallbackTitle(match.date);

  return (
    <div className="flex items-end justify-between gap-4 min-w-0">
      <div className="flex flex-col gap-4 min-w-0">
        <div className="flex flex-col gap-3 min-w-0">
          {/* A match played on a lineup had no way back to it. The report is
              reached from the event, from the matches list, and from a shared
              link, and only the first of those left the reader anywhere to
              return to — so a coach checking one court had to use the browser's
              back button to see the other eight. The crumb renders only when a
              line is actually behind this match; a challenge or an imported
              match has nowhere to point and shows the label alone. */}
          <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[2.5px]">
            <span className="text-[#AAAAAA]">Match</span>
            {match.eventId && (
              <>
                <span aria-hidden="true" className="text-[#DDDDDD]">
                  /
                </span>
                <Link
                  href={`/dashboard/team/schedule/${match.eventId}`}
                  className="rounded-[3px] text-[var(--blue-text)] outline-none transition-colors duration-200 hover:text-[var(--blue)] focus-visible:shadow-[var(--focus-ring)]"
                >
                  Back to event
                </Link>
              </>
            )}
          </div>
          <h1
            title={heroTitle}
            className="font-light text-[30px] text-[#0D0D0D] tracking-[-0.6px] leading-[36px] truncate"
          >
            {heroTitle}
          </h1>
        </div>
        {(match.date || match.matchType || match.courtType || match.uploadedBy) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {match.date && (
              <div className="flex items-center gap-1">
                <Calendar
                  className="size-3.5 text-[var(--color-text-muted)]"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <span className="text-[10px] leading-4 text-[var(--color-text-muted)]">
                  {match.date}
                </span>
              </div>
            )}
            {(match.matchType || match.courtType) && (
              <MatchMetadataRow
                matchType={match.matchType}
                courtType={match.courtType}
                showVerification={false}
              />
            )}
            {/* Where this match came from. Inside a program the uploader is
                routinely not the athlete — a coach files for their squad, and
                a player may file for a teammate — and `created_by` recorded
                that all along without ever being shown. Rendered only when the
                two are actually different people, so a personal match and a
                self-filed team match look exactly as they did before. */}
            {match.uploadedBy && (
              <div className="flex items-center gap-1">
                <Upload
                  className="size-3.5 text-[var(--color-text-muted)]"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <span className="text-[10px] leading-4 text-[var(--color-text-muted)]">
                  Uploaded by {match.uploadedBy}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 flex flex-col items-end gap-3">
        <MatchActionsMenu
          matchId={match.id}
          matchLabel={hasTournament ? match.tournamentName : heroTitle}
        />
        <ShareMatchButton match={match} />
      </div>
    </div>
  );
}

function buildFallbackTitle(date: string | undefined): string {
  if (!date) return "Match";
  return `Match · ${date}`;
}
