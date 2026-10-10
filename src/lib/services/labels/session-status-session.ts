/**
 * The console header's "Mark complete" and "Reopen": the one column pair a
 * session's lifecycle lives in, `label_sessions.status` and `completed_at`
 * (a CHECK holds them together). Admin-gated like edit-session.ts; not the
 * marks gate — a session labelled blind completes like any other.
 *
 * Complete is the ordinary gate (`checkSessionOpen`), then a lease: ONE update
 * setting `publishing_since`, matched on `status = 'labelling'` and no fresh
 * lease. While it is held the session stays `labelling` but takes no edits
 * (the gate refuses them, and so does the database: a label row's write
 * share-locks its session row, so the lease waits for an edit already under
 * way — `20261010212629_label_publish_guards.sql`), no second Complete and
 * no Reopen (which needs `complete`). Then the publish — the labelled points
 * replace the match's (apply-session.ts), backed up first — and, matched on
 * the lease this call took, either `complete` or the lease released with the
 * reason. A publish killed mid-way leaves the session open with a lease that
 * lapses after `PUBLISH_LEASE_MS`, so Complete again finishes it.
 *
 * Reopen leaves the published points as they are; completing again publishes
 * again. Reopen reads the status and writes the reverse, matched on
 * `status = 'complete'`; the partial unique index that allows one open
 * session per job (`label_sessions_one_open_per_job`) refuses it while
 * another session of the match is open.
 */

import type { AdminClient } from "@/lib/supabase/admin";
import {
  checkSessionOpen,
  defaultLabelWriteDependencies,
  PUBLISH_LEASE_MS,
  PUBLISHING,
  racedMessage,
  type LabelWriteDependencies,
} from "./edit-session";
import { gated, normaliseId, type LabelOpResult } from "./operations-session";
import type { LabelSession } from "./session";

/** What a publish wrote, for the console's confirmation line. */
export interface LabelPublishSummary {
  points: number;
  shots: number;
  insightsRequested: boolean;
}

export type LabelSessionStatusResult = LabelOpResult<{
  status: LabelSession["status"];
  published?: LabelPublishSummary;
}>;

/** The publish step, injectable so the writer is tested without a database. */
export type LabelPublish = (
  supabase: AdminClient,
  sessionId: string,
) => Promise<
  ({ ok: true } & LabelPublishSummary) | { ok: false; error: string }
>;

/**
 * Publish with the labelled score taken as it is: the confirm before "Mark
 * complete" already listed any difference from the entered score.
 */
const publishAcceptingScore: LabelPublish = async (supabase, sessionId) => {
  // Loaded on use: it reads through labels-server.ts.
  const { publishLabelSession } = await import("./apply-session");
  return publishLabelSession({ db: supabase, sessionId, acceptScore: true });
};

const RACED = racedMessage("session");
/** The unique index's refusal, as `seed-session.ts` reads it. */
const UNIQUE_VIOLATION = "23505";
export const ANOTHER_SESSION_OPEN =
  "Another labelling session is open for this match. Complete or remove it before reopening this one.";
const ALREADY_OPEN = "This session is already open for labelling.";

/** Publish a labelling session to its match, then close it. Never throws. */
export async function writeLabelSessionComplete(params: {
  supabase: AdminClient;
  sessionId: unknown;
  publish?: LabelPublish;
  now?: () => number;
}): Promise<LabelSessionStatusResult> {
  const { supabase, publish = publishAcceptingScore, now = Date.now } = params;
  const sessionId = normaliseId(params.sessionId);
  if (!sessionId) return { error: "Invalid session id." };

  const refused = await checkSessionOpen(supabase, sessionId);
  if (refused) return { error: refused };

  // The lease: taken only on an open session with no fresh lease on it.
  const claimedAt = new Date(now()).toISOString();
  const staleBefore = new Date(now() - PUBLISH_LEASE_MS).toISOString();
  const { data, error } = await supabase
    .from("label_sessions")
    .update({ publishing_since: claimedAt })
    .eq("id", sessionId)
    .eq("status", "labelling")
    .or(`publishing_since.is.null,publishing_since.lt.${staleBefore}`)
    .select("id");
  if (error) {
    return { error: `Could not complete the session: ${error.message}` };
  }
  if (!data || data.length === 0) return { error: PUBLISHING };

  let failure: string;
  try {
    const result = await publish(supabase, sessionId);
    if (result.ok) {
      const { data: closed, error: closeError } = await supabase
        .from("label_sessions")
        .update({
          status: "complete",
          completed_at: new Date(now()).toISOString(),
          publishing_since: null,
        })
        .eq("id", sessionId)
        .eq("publishing_since", claimedAt)
        .select("id");
      if (closeError) {
        return {
          error: `The labels are published, but the session could not be marked complete: ${closeError.message}`,
        };
      }
      if (!closed || closed.length === 0) return { error: RACED };
      return {
        ok: true,
        status: "complete",
        published: {
          points: result.points,
          shots: result.shots,
          insightsRequested: result.insightsRequested,
        },
      };
    }
    failure = result.error;
  } catch (err) {
    failure = `Could not publish the labels: ${err instanceof Error ? err.message : String(err)}`;
  }

  // Not published, or not fully: release the lease so it can be retried.
  // Matched on this call's lease, so a later Complete's is never released.
  const { error: releaseError } = await supabase
    .from("label_sessions")
    .update({ publishing_since: null })
    .eq("id", sessionId)
    .eq("publishing_since", claimedAt);
  if (releaseError) {
    return {
      error: `${failure} The session stays held for up to ${PUBLISH_LEASE_MS / 60_000} minutes before it takes edits again (${releaseError.message}).`,
    };
  }
  return { error: failure };
}

/** Open a complete session for labelling again. Never throws. */
export async function writeLabelSessionReopen(params: {
  supabase: AdminClient;
  sessionId: unknown;
}): Promise<LabelSessionStatusResult> {
  const { supabase } = params;
  const sessionId = normaliseId(params.sessionId);
  if (!sessionId) return { error: "Invalid session id." };

  const { data: session, error: readError } = await supabase
    .from("label_sessions")
    .select("status")
    .eq("id", sessionId)
    .maybeSingle<{ status: string }>();
  if (readError) {
    return { error: `Could not read the session: ${readError.message}` };
  }
  if (!session) return { error: "Session not found." };
  if (session.status !== "complete") return { error: ALREADY_OPEN };

  const { data, error } = await supabase
    .from("label_sessions")
    .update({ status: "labelling", completed_at: null })
    .eq("id", sessionId)
    .eq("status", "complete")
    .select("id");
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { error: ANOTHER_SESSION_OPEN };
    return { error: `Could not reopen the session: ${error.message}` };
  }
  if (!data || data.length === 0) return { error: RACED };
  return { ok: true, status: "labelling" };
}

export function completeLabelSession(
  sessionId: unknown,
  deps: LabelWriteDependencies = defaultLabelWriteDependencies,
): Promise<LabelSessionStatusResult> {
  return gated(
    deps,
    (supabase) => writeLabelSessionComplete({ supabase, sessionId }),
    "complete the session",
  );
}

export function reopenLabelSession(
  sessionId: unknown,
  deps: LabelWriteDependencies = defaultLabelWriteDependencies,
): Promise<LabelSessionStatusResult> {
  return gated(
    deps,
    (supabase) => writeLabelSessionReopen({ supabase, sessionId }),
    "reopen the session",
  );
}
