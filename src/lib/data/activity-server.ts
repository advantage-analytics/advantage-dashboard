/**
 * The header activity tray's feed.
 *
 * Built entirely from data that already exists: `processing_jobs`, projected
 * through the same `loadMatchAnalysis` the matches list and match detail use.
 * The tray is the third surface to show a job's progress, and the v2 design has
 * it carrying a bar and a time-remaining — so it reads the same statuses,
 * labels and ETA arithmetic rather than growing its own. Three renderings of
 * one job that disagree is the failure this avoids.
 *
 * Returns ONE list, unpartitioned. Splitting in-flight from settled here and
 * again in the tray meant two predicates for one question, and they already
 * disagreed: this side admitted a row via `isAnalysisReady || isAnalysisFailed`
 * and the tray excluded it via `!isInFlight`, which part company on `manual`.
 * The tray has to re-partition anyway — a live update is precisely the thing
 * that moves a job out of flight — so it owns the split outright.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MatchAnalysis } from './match-analysis';
import { loadMatchAnalysis } from './match-analysis-server';
import { shortName } from './match-utils';
import type { Workspace } from '@/lib/workspace/types';

/**
 * How far back the tray looks. Beyond this it is history, not activity.
 *
 * Matches without a job are discarded below, so this is an upper bound on rows
 * examined rather than rows shown.
 */
const LOOKBACK_MATCHES = 25;
const MAX_ITEMS = 10;

/**
 * The four fields the tray actually renders.
 *
 * A narrower projection than `MatchAnalysis` because every item here crosses
 * the server/client boundary on every dashboard navigation, and `providerId`,
 * `jobReference`, `window` and `failNote` were being serialized without ever
 * being read. It still satisfies `LiveAnalysisPatch`, so the shared
 * `withLiveAnalysis` merge works on it unchanged.
 */
export type ActivityAnalysis = Pick<
  MatchAnalysis,
  'status' | 'progressPercent' | 'uploadPercent' | 'startedAt'
>;

export interface ActivityItem {
  matchId: string;
  /** "M. Reid vs J. Park" — the same abbreviation the home activity rail uses. */
  title: string;
  analysis: ActivityAnalysis;
  /** The match date, ISO. The only timestamp every row reliably has. */
  at: string;
}

export interface ActivityFeed {
  items: ActivityItem[];
}

/** Fits two names into a ~300px row that also carries a timestamp. */
function titleFor(player1: string | null, player2: string | null): string {
  return `${shortName(player1 ?? 'Unknown', 12)} vs ${shortName(player2 ?? 'Unknown', 12)}`;
}

/**
 * Recent processing activity for ONE workspace.
 *
 * The workspace argument is not decoration. Relying on RLS alone would be
 * correct today and wrong the moment `matches.program_id` is populated, because
 * the program-scoped policy is a UNION — creator-or-player OR program staff. A
 * coach sitting in their personal workspace would silently start seeing the
 * whole program's uploads in the header, with no code change to cause it. RLS
 * decides what a user MAY see; this decides which workspace they are LOOKING
 * at, and the tray needs the second question answered too.
 */
export async function getActivityFeed(
  supabase: SupabaseClient,
  workspace: Workspace
): Promise<ActivityFeed> {
  const empty: ActivityFeed = { items: [] };

  let query = supabase
    .from('matches')
    .select('id, player1_name, player2_name, date')
    .order('date', { ascending: false })
    .limit(LOOKBACK_MATCHES);

  query =
    workspace.kind === 'team'
      ? query.eq('program_id', workspace.id)
      : // Personal: what this person uploaded. Not `program_id is null` — that
        // column does not exist until the program migrations land, and a filter
        // on a missing column is an error rather than an empty result.
        query.eq('created_by', workspace.id);

  const { data: matches, error } = await query;

  if (error) {
    // Never fatal. The tray is chrome — a header that renders without it beats
    // a dashboard that does not render.
    console.error('[activity] could not load matches', { error: error.message });
    return empty;
  }
  if (!matches?.length) return empty;

  // `reap` deliberately off: this runs on every dashboard page, and the reap is
  // a write. It belongs to the surfaces that draw a full-size progress bar.
  const analyses = await loadMatchAnalysis(
    supabase,
    matches.map((match) => match.id)
  );

  const items: ActivityItem[] = [];
  for (const match of matches) {
    // Only matches that actually ran a job. An imported or hand-scored match
    // never had activity, so it has nothing to report here.
    const analysis = analyses.get(match.id);
    if (!analysis) continue;

    items.push({
      matchId: match.id,
      title: titleFor(match.player1_name, match.player2_name),
      analysis: {
        status: analysis.status,
        progressPercent: analysis.progressPercent,
        uploadPercent: analysis.uploadPercent,
        startedAt: analysis.startedAt,
      },
      at: match.date,
    });

    if (items.length === MAX_ITEMS) break;
  }

  return { items };
}
