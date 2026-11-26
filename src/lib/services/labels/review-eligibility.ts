/**
 * Who is offered for human review ("Verified by Advantage") from the 2027
 * plans on (docs/plans/2027-pricing.md, decision 5 and stage D).
 *
 * From `PLANS_BEGIN` a match is offered for the labellers' To do only when it
 * was PAID FOR: analysed on a Coach / Coach Pro plan, on purchased extra
 * hours (a Free player's included), on a team's season plan or on a team's
 * pilot. A match sent for analysis before `PLANS_BEGIN` stays eligible
 * whatever it drew. Before that date nothing is read and nothing changes.
 *
 * The answer is the database's: `label_review_eligibility()` (migration
 * `20261126090000_plans_2027_gating`) reads the marker the reservation wrote
 * (`processing_usage.paid_basis`). This file asks it and hands the queue's
 * rule (`canAddToTodo` in `queue.ts`) one boolean per job. The gate is on the
 * server, where the Not in To do list is built and where an add re-reads it
 * (`addToLabelTodo`); no button is hidden to make it hold.
 *
 * Only To do is gated. Work already past it (held, sent back, handed in,
 * published and waiting for a check) stays on the boards, so no labeller's
 * work drops off, and an admin can still open any analysed match from
 * Admin › Matches ("Label this match"): that is one person's deliberate
 * choice, not an offer.
 */

import { PLANS_BEGIN, plansHaveBegun } from "@/lib/billing/plans";
import { idChunks } from "@/lib/services/labels/chunks";
import type { AdminClient } from "@/lib/supabase/admin";
import { isMissingFunction } from "@/lib/supabase/missing-function";

const LOG = "[labels:review-eligibility]";

/** What a paid reservation drew (`processing_usage.paid_basis`). */
export type PaidBasis = "plan" | "extra_hours" | "season" | "pilot";

/** One row of `label_review_eligibility()`. */
export interface ReviewEligibilityRow {
  job_id: string;
  eligible: boolean;
  paid_basis: PaidBasis | null;
}

/**
 * Whether each job's match may be offered for review, by job id. Null means
 * the gate is not in force: plans have not begun, or this database does not
 * have the function yet. Every job is then eligible, as before.
 */
export type ReviewEligibility = ReadonlyMap<string, boolean>;

/** `PLANS_BEGIN` as the instant the database compares against. */
export function plansBeginInstant(): string {
  return `${PLANS_BEGIN}T00:00:00Z`;
}

export function reviewEligibilityFrom(
  rows: readonly Pick<ReviewEligibilityRow, "job_id" | "eligible">[],
): ReviewEligibility {
  return new Map(rows.map((row) => [row.job_id, row.eligible === true]));
}

/**
 * The one reading of the map: a job is refused only when the database said
 * no. With no map (the gate is not in force) or no row for the job (it was
 * not asked about), it is eligible. Refusing on a missing answer would empty
 * the admin's list the day a read failed.
 */
export function isReviewEligible(
  eligibility: ReviewEligibility | null | undefined,
  jobId: string,
): boolean {
  return eligibility?.get(jobId) !== false;
}

/**
 * Ask the database which of `jobIds` may be offered for review. Null before
 * `PLANS_BEGIN` (nothing is read) and when the function is not on this
 * database yet (the migration is unapplied: logged, and every job stays
 * eligible). Any other error throws, like the queue's other reads.
 */
export async function readReviewEligibility(
  db: AdminClient,
  jobIds: readonly string[],
  now: Date = new Date(),
): Promise<ReviewEligibility | null> {
  if (!plansHaveBegun(now)) return null;
  if (jobIds.length === 0) return new Map();

  const results = await Promise.all(
    idChunks(jobIds).map((ids) =>
      db.rpc("label_review_eligibility", {
        p_job_ids: ids,
        p_plans_begin: plansBeginInstant(),
      }),
    ),
  );

  const rows: ReviewEligibilityRow[] = [];
  for (const { data, error } of results) {
    if (error) {
      if (isMissingFunction(error)) {
        console.warn(
          `${LOG} label_review_eligibility is not on this database; every match stays eligible`,
        );
        return null;
      }
      throw new Error(`Could not read review eligibility: ${error.message}`);
    }
    rows.push(...((data ?? []) as ReviewEligibilityRow[]));
  }
  return reviewEligibilityFrom(rows);
}
