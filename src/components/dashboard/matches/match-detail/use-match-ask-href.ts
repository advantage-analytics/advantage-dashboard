"use client";

import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { askEntryHref } from "@/lib/services/ask/entry";

/**
 * The way from this report into Ask with the match tagged
 * (`askEntryHref`, `/dashboard/ask?match=…` or the team page's), and
 * `question` in the composer when one is given — or null when the report
 * offers no way there.
 *
 * Null on a read-only report (the public link, the sample match): there is
 * nothing of the reader's to ask about. Null too when the match and the
 * active workspace disagree: Ask's scope is the workspace's, and it silently
 * drops a tag its menu does not offer, so a team match read from the
 * personal workspace (or the reverse) would land untagged and answer about
 * the wrong matches. Switching workspace is the way to ask about it.
 *
 * Shared by the title row's "Ask about this match" and the insight card's
 * "Why this", so the two can never disagree about where Ask is.
 */
export function useMatchAskHref(question?: string): string | null {
  const { meta } = useMatchReport();
  const { match } = useMatchData();
  if (meta.readOnly) return null;
  const matchIsTeam = Boolean(match.programId);
  if (matchIsTeam !== (meta.workspaceKind === "team")) return null;
  return askEntryHref(
    meta.workspaceKind === "team"
      ? { kind: "team", programId: "", programName: "" }
      : { kind: "personal" },
    { kind: "match", id: meta.matchId },
    { question },
  );
}
