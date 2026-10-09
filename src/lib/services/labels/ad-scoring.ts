/**
 * Which scoring a label session's scoreboard counts by: what the labeller
 * set on the session, else what its job was submitted with (the job wins
 * over the match, as it does for the derivation), else the match's own
 * `format.ad_scoring`, else ad scoring — the default of every format the
 * wizard offers, and the one a blank reading of a college match gets wrong
 * least often.
 *
 * The loader (`lib/data/labels-server.ts`) and the writers that plan from the
 * score (`game-shift-session.ts`) resolve it the same way, from here.
 */

import type { AdminClient } from "@/lib/supabase/admin";

/** The one column of the session's job the console needs. */
export interface JobScoringRow {
  ad_scoring: boolean | null;
}

/** What the fallback reads of the session row. */
export interface SessionScoringRow {
  /** Null until the labeller sets it — then the job's value stands in. */
  ad_scoring: boolean | null;
  /** Null once the job row is gone (the key is ON DELETE SET NULL). */
  job_id: string | null;
}

/** The one column of the session's match the fallback reads. */
export interface MatchScoringRow {
  format: { ad_scoring?: boolean | null } | null;
}

export function resolveLabelAdScoring(
  sessionAdScoring: boolean | null,
  jobAdScoring: boolean | null | undefined,
  matchAdScoring?: boolean | null,
): boolean {
  return sessionAdScoring ?? jobAdScoring ?? matchAdScoring ?? true;
}

/**
 * The job's `ad_scoring`, read only when it is the fallback: a session that
 * has set its own never reads the job, and one whose job is gone has nothing
 * to fall back to. The caller decides what a read error means to it.
 */
export async function readJobAdScoring(
  db: AdminClient,
  session: SessionScoringRow,
): Promise<{ data: JobScoringRow | null; error: { message: string } | null }> {
  if (session.ad_scoring !== null || !session.job_id) {
    return { data: null, error: null };
  }
  return db
    .from("processing_jobs")
    .select("ad_scoring")
    .eq("id", session.job_id)
    .maybeSingle<JobScoringRow>();
}

/**
 * The match's `format.ad_scoring`, read only when it is the fallback: when
 * neither the session nor its job says. The caller decides what a read
 * error means to it.
 */
export async function readMatchAdScoring(
  db: AdminClient,
  matchId: string | null,
  before: boolean | null | undefined,
): Promise<{
  data: MatchScoringRow | null;
  error: { message: string } | null;
}> {
  if ((before !== null && before !== undefined) || !matchId) {
    return { data: null, error: null };
  }
  return db
    .from("matches")
    .select("format")
    .eq("id", matchId)
    .maybeSingle<MatchScoringRow>();
}
