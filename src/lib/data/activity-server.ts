/**
 * The header activity tray's feed.
 *
 * Built from `processing_jobs`, projected through the same status vocabulary
 * the matches list and match detail use — `resolveAnalysisStatus`,
 * `pipelinePercent`, `ANALYSIS_LABEL`. The tray is the third surface to show a
 * job's progress and it must not grow a fourth set of words for the same states.
 *
 * ── Scoped on the JOB, not the match ────────────────────────────────────────
 * The tray answers "what is happening with the work I sent", and the unit of
 * work is the job. Scoping on `matches.created_by` looked equivalent and is
 * not: a job can belong to someone who did not create the match row. There is
 * one on this database right now — the pipeline's first real submission — and
 * scoping by match hid it from the person who actually submitted it.
 *
 * It is also why this cannot lean on RLS alone. The program policy is a UNION,
 * so once `matches.program_id` is populated a coach sitting in their PERSONAL
 * workspace would start seeing the whole program's uploads in the header, with
 * no code change to cause it. RLS decides what a viewer MAY see; this decides
 * which workspace they are LOOKING at.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type MatchAnalysis,
  pipelinePercent,
  resolveAnalysisStatus,
} from './match-analysis';
import { shortName } from './match-utils';
import type { Workspace } from '@/lib/workspace/types';

/** Recent enough to be activity rather than history. */
const MAX_ITEMS = 10;

/**
 * The four fields the tray renders.
 *
 * Narrower than `MatchAnalysis` because every item crosses the server/client
 * boundary on each dashboard navigation. It still satisfies `LiveAnalysisPatch`,
 * so the shared `withLiveAnalysis` merge works on it unchanged.
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
  /** When the job started. The tray orders and dates by this, not the match. */
  at: string;
}

export interface ActivityFeed {
  items: ActivityItem[];
}

/** Fits two names into a ~300px row that also carries a timestamp. */
function titleFor(player1: string | null, player2: string | null): string {
  return `${shortName(player1 ?? 'Unknown', 12)} vs ${shortName(player2 ?? 'Unknown', 12)}`;
}

interface JobRow {
  match_id: string;
  status: string;
  upload_progress_percent: number | null;
  derivation_version: string | null;
  created_at: string;
  matches: {
    player1_name: string | null;
    player2_name: string | null;
    program_id: string | null;
  } | null;
}

export async function getActivityFeed(
  supabase: SupabaseClient,
  workspace: Workspace
): Promise<ActivityFeed> {
  // One round trip with the match embedded, rather than reading a page of
  // matches and discarding the ones without a job.
  //
  // `!inner` is load-bearing, not a join hint. `processing_jobs` keeps its own
  // `created_by` policy — the row carries a live SAS credential — so a viewer
  // can own a job whose MATCH they cannot read. There is one such row on this
  // database. The inner join drops it, which is right: the tray would otherwise
  // render both players' names off a match the viewer has no access to.
  let query = supabase
    .from('processing_jobs')
    .select(
      'match_id, status, upload_progress_percent, derivation_version, created_at, matches!inner(player1_name, player2_name, program_id)'
    )
    .order('created_at', { ascending: false })
    .limit(MAX_ITEMS);

  query =
    workspace.kind === 'team'
      ? query.eq('matches.program_id', workspace.id)
      : // Personal: the jobs this person submitted. Not `program_id is null` —
        // that column does not exist until the program migrations land in an
        // environment, and a filter on a missing column is an error rather
        // than an empty result.
        query.eq('created_by', workspace.id);

  const { data, error } = await query;

  if (error) {
    // Never fatal. The tray is chrome — a header that renders without it beats
    // a dashboard that does not render.
    console.error('[activity] could not load jobs', { error: error.message });
    return { items: [] };
  }

  const items: ActivityItem[] = [];
  const seen = new Set<string>();

  for (const row of (data ?? []) as unknown as JobRow[]) {
    // Newest first, so the first row for a match is its current attempt. A
    // resubmitted match must not appear twice in the tray.
    if (seen.has(row.match_id)) continue;

    const status = resolveAnalysisStatus(row.status, row.derivation_version);
    if (!status) {
      console.warn('[activity] unmapped processing_jobs.status', { status: row.status });
      continue;
    }
    seen.add(row.match_id);

    const uploadPercent =
      status === 'uploading' && row.upload_progress_percent !== null
        ? row.upload_progress_percent
        : undefined;

    items.push({
      matchId: row.match_id,
      title: titleFor(
        row.matches?.player1_name ?? null,
        row.matches?.player2_name ?? null
      ),
      analysis: {
        status,
        progressPercent: pipelinePercent(status, uploadPercent),
        // Only the upload has a measured number. The vendor sends its status
        // transitions without a percentage, so anything shown for queued or
        // processing would be invented.
        uploadPercent,
        startedAt: row.created_at,
      },
      at: row.created_at,
    });
  }

  return { items };
}
