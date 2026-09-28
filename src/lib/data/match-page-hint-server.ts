/**
 * A cheap, request-cached guess at what the match page will draw — the
 * Analysis steps column or the report — for surfaces that must decide before
 * the page's own data arrives (the route's loading skeleton).
 *
 * The decision itself is `matchPageKind()` in `match-analysis.ts`, the same
 * pure function `page.tsx` calls, so the two cannot disagree about a row
 * (guardrails §3.2). The status/recovery projection is the page's too:
 * `loadMatchAnalysis` + `analysisFor`, the same loader and fallback.
 *
 * What it deliberately does NOT do is the page's writes: no `reap` and no
 * `reconcileBeforePageRead`. A hint must never spend a vendor poll or write a
 * status, so it reads the row as it stands. The only possible drift from the
 * page is therefore a job those writes move in the same request — the page's
 * gate always runs on its own post-reconcile read, never on this hint.
 *
 * No `match_stats` read either: `withStatsPublished` only maps `completed` to
 * `timeline`, and both resolve to "report", so the stats question cannot move
 * the kind.
 *
 * Lives in its own `-server` module rather than `match-analysis-server.ts`,
 * which client components import: `cache()` and the cookie client must not
 * enter that module graph.
 */

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  type MatchAnalysis,
  type MatchPageKind,
  matchPageKind,
} from "@/lib/data/match-analysis";
import {
  analysisFor,
  loadMatchAnalysis,
} from "@/lib/data/match-analysis-server";

export interface MatchPageHint {
  analysis: MatchAnalysis;
  kind: MatchPageKind;
}

/**
 * The hint for `matchId`, or null when the viewer cannot see the match (RLS
 * returns no row) or it does not exist. Runs on the request-scoped cookie
 * client — never the admin client — so it answers exactly what the viewer's
 * own RLS policy would.
 */
export const getMatchPageHint = cache(async function getMatchPageHint(
  matchId: string,
): Promise<MatchPageHint | null> {
  const supabase = await createClient();
  // `matches` has no `verification_status` column; `verified` is the boolean
  // behind `Match.verificationStatus`, mapped the same way
  // `transformDbMatchToMatch` maps it, so `analysisFor` sees identical input.
  const { data: row, error } = await supabase
    .from("matches")
    .select("id, source_provider, verified")
    .eq("id", matchId)
    .maybeSingle();
  // A failed read is "no answer", not "no match": throw so the route's error
  // boundary offers a retry, as `getMatchDetailData` does, rather than
  // rendering not-found for a match that exists.
  if (error) throw error;
  if (!row) return null;

  const analysis = analysisFor(await loadMatchAnalysis(supabase, [matchId]), {
    id: row.id,
    sourceProvider: row.source_provider ?? undefined,
    verificationStatus: row.verified ? "Verified Result" : undefined,
  });
  return { analysis, kind: matchPageKind(analysis) };
});
