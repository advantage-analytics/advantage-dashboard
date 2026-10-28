"use client";

import { useMemo } from "react";
import { useFilmHead } from "@/components/dashboard/matches/match-detail/film-head-context";
import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import { useSelfReview } from "@/components/dashboard/matches/match-detail/self-review/self-review-context";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { reportPointOf, type ReportPoint } from "@/lib/data/match-verification";
import { readingPhrase, type Side } from "@/lib/data/self-review";

function surname(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] || name;
}

/**
 * The point "Something still wrong? Tell us" names: on the Video view, the
 * one under the film head (`useFilmHead`, the rail scoreboard's own source),
 * read as it stands now — a player's saved fix included (`readingFor`).
 * Null on any other view, or with no point under the head; the report is
 * then about the whole match.
 */
export function useReportPoint(): ReportPoint | null {
  const { state } = useMatchReport();
  const head = useFilmHead();
  const review = useSelfReview();
  const sides = useMatchSides();
  const point = state.view === "film" ? (head?.point ?? null) : null;

  return useMemo(() => {
    if (!point) return null;
    const names: Record<Side, string> = sides.you.isPlayer1
      ? { p1: surname(sides.you.name), p2: surname(sides.opp.name) }
      : { p1: surname(sides.opp.name), p2: surname(sides.you.name) };
    return reportPointOf(point, readingPhrase(review.readingFor(point), names));
  }, [point, review, sides.you, sides.opp]);
}
