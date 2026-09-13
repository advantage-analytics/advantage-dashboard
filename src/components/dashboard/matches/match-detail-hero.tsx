"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Calendar } from "lucide-react";
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
          <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
            Match
          </p>
          <h1
            title={heroTitle}
            className="font-light text-[30px] text-[#0D0D0D] tracking-[-0.6px] leading-[36px] truncate"
          >
            {heroTitle}
          </h1>
        </div>
        {(match.date || match.matchType || match.courtType) && (
          <div className="flex items-center gap-4">
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
