/**
 * A labeller taking a match from the board at `/label`: seed the job's
 * session when it has none, then claim it (`claim_label_session`).
 *
 * The caller sends a job id and nothing else. Who is claiming comes from the
 * server-side session (`auth.getUser()`), and whether the job may be taken
 * is recomputed here from the queue (`claimableJobIds`) — the board's
 * `claimable` flag is only what the browser was shown.
 *
 * Service-role throughout, behind that gate: a labeller holds no grant on
 * `processing_jobs`, `matches` or `label_sessions`, and the RPC is executable
 * by `service_role` alone, so it is called with the gate's own user id — the
 * pattern of `claim_label_publish_lease` and Ask's `database.ts`. The RPC is
 * what settles a race: it assigns the session only while nobody holds it and
 * the claimer holds no other.
 *
 * Every sentence a labeller gets back has its ids struck out (`stripIds`):
 * the seed's and the database's errors were written for an admin and can
 * carry a match or program id.
 *
 * Seeding is the existing path (results download, re-derive), so the first
 * claim of a match is slow. A seed that then loses the claim leaves an
 * unassigned `labelling` session, which stays in To do.
 */

import { isUuid } from "@/lib/admin/validation";
import {
  readHoldingLabelSession,
  readLabelQueue,
} from "@/lib/data/label-queue-server";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { claimableJobIds, type QueueSession } from "./queue";
import { stripIds } from "./strip-ids";
import {
  seedLabelSessionForJob,
  type SeedLabelSessionResult,
} from "./seed-session";

const LOG = "[labels:claim]";

export const CLAIM_LABELLER_REQUIRED = "Only a labeller can claim a match.";
export const CLAIM_HOLDING = "Submit your match before you claim another.";
export const CLAIM_NOT_NEXT = "That match is not one of the next three due.";
export const CLAIM_TAKEN = "Someone claimed that match first.";
export const CLAIM_NOT_LABELLER = "You are no longer a labeller.";

export type ClaimLabelMatchResult = { sessionId: string } | { error: string };

/** What a claim reads off a queue entry: the job id and its session. */
export interface ClaimQueueEntry {
  /** The job id. */
  id: string;
  session: (QueueSession & { id: string }) | null;
}

/** What `claimLabelMatch` needs; specs pass fakes. */
export interface ClaimDependencies {
  /**
   * The signed-in labeller, from the server-side session; null when signed
   * out or not a labeller.
   */
  requireLabeller: () => Promise<{ id: string } | null>;
  createAdminClient: () => AdminClient;
  /** The queue, earliest due first (`readLabelQueue`). */
  readQueue: (db: AdminClient) => Promise<readonly ClaimQueueEntry[]>;
  readHolding: (db: AdminClient, userId: string) => Promise<boolean>;
  seed: (params: {
    supabase: AdminClient;
    jobId: string;
    labellerId: string;
  }) => Promise<SeedLabelSessionResult>;
}

/**
 * The caller, when they are a labeller. `is_labeller` has no client grant, so
 * it is read service-role from the caller's own row, keyed by the id
 * `auth.getUser()` verified. A failed read is no labeller: the gate fails
 * closed. `/label` asks it too, so an admin who is not a labeller is never
 * shown a Claim button the claim would refuse.
 */
export async function requireLabeller(): Promise<{ id: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await createAdminClient()
    .from("users")
    .select("is_labeller")
    .eq("id", user.id)
    .maybeSingle<{ is_labeller: boolean | null }>();
  if (error || data?.is_labeller !== true) return null;
  return { id: user.id };
}

const defaults: ClaimDependencies = {
  requireLabeller,
  createAdminClient,
  readQueue: readLabelQueue,
  readHolding: readHoldingLabelSession,
  seed: seedLabelSessionForJob,
};

/**
 * Claim job `jobId` for the signed-in labeller and answer the session to
 * open. Never throws.
 */
export async function claimLabelMatch(
  jobId: unknown,
  deps: ClaimDependencies = defaults,
): Promise<ClaimLabelMatchResult> {
  const viewer = await deps.requireLabeller();
  if (!viewer) return { error: CLAIM_LABELLER_REQUIRED };
  if (!isUuid(jobId)) return { error: "Invalid job id." };
  const id = jobId.toLowerCase();

  try {
    const db = deps.createAdminClient();
    const [entries, holding] = await Promise.all([
      deps.readQueue(db),
      deps.readHolding(db, viewer.id),
    ]);
    const entry = entries.find((row) => row.id === id);

    // A viewer who holds a session is refused, even on that same match: the
    // board shows no Claim button while they hold one, and their own match
    // opens from its "Continue labelling" card instead.
    if (holding) return { error: CLAIM_HOLDING };
    if (!entry || !claimableJobIds(entries).includes(id)) {
      return { error: CLAIM_NOT_NEXT };
    }

    let sessionId = entry.session?.id ?? null;
    if (!sessionId) {
      const seeded = await deps.seed({
        supabase: db,
        jobId: id,
        labellerId: viewer.id,
      });
      if ("error" in seeded) return { error: stripIds(seeded.error) };
      sessionId = seeded.sessionId;
    }

    const { data: answer, error } = await db.rpc("claim_label_session", {
      p_session_id: sessionId,
      p_user_id: viewer.id,
    });
    if (error) {
      return { error: stripIds(`Could not claim the match: ${error.message}`) };
    }

    if (answer === "claimed") return { sessionId };
    if (answer === "holding") return { error: CLAIM_HOLDING };
    if (answer === "taken") return { error: CLAIM_TAKEN };
    if (answer === "not_labeller") return { error: CLAIM_NOT_LABELLER };
    console.error(`${LOG} unexpected answer`, { jobId: id, answer });
    return { error: "Could not claim the match." };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} threw`, { jobId: id, message });
    return { error: stripIds(`Could not claim the match: ${message}`) };
  }
}
