"use server";

import { createClient } from "@/lib/supabase/server";
import { TOUR_COLUMN, type SeenId } from "@/lib/onboarding/tours";

/**
 * Record that the signed-in player has finished (or skipped) a first-run
 * report tour or dismissed a shell hint. Design:
 * `work/first-run-onboarding/02_design/output/design.md`
 * §6 — either is set on Done OR Skip, and no partial step index is kept.
 *
 * Writes with the cookie client, so `users`' own-row ALL policy
 * (`auth.uid() = id`) and the column-scoped UPDATE grant
 * (`20261007061209_users_onboarding_tours_column_grants.sql`) are what admit
 * the write; the id comes from the session, never from the caller. The tour
 * id is mapped to its column through `TOUR_COLUMN` (`lib/onboarding/tours.ts`,
 * shared with the workspace context's read) — the input is never interpolated into SQL.
 * The update selects the row back, as `finishOnboarding` does: an update
 * that matched nothing (RLS hid the row, or no `users` row exists) is an
 * error, never a silent success that offers the tour again next session.
 *
 * Never throws: the runner closes the tour whatever comes back, and a
 * rejected promise there would surface as an unhandled rejection for a write
 * that only decides whether the tour is offered again next session.
 */

export interface MarkTourDoneResult {
  /** The sentence a client could show; `null` on success. */
  error: string | null;
  /** The slug a client branches on, present only beside an `error`. */
  code?:
    | "unknown_tour"
    | "unauthenticated"
    | "write_failed"
    | "no_row"
    | "unexpected";
}

const SAVE_FAILED = "Could not save that the tour was seen.";

export async function markTourDone(tour: SeenId): Promise<MarkTourDoneResult> {
  // A server action's argument is whatever the network sent, so the type is
  // re-checked here against the columns that exist.
  const column =
    typeof tour === "string" && Object.hasOwn(TOUR_COLUMN, tour)
      ? TOUR_COLUMN[tour]
      : null;
  if (!column) {
    return { error: "That tour does not exist.", code: "unknown_tour" };
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        error: "Not signed in. Please log back in.",
        code: "unauthenticated",
      };
    }

    const { data, error } = await supabase
      .from("users")
      .update({ [column]: new Date().toISOString() })
      .eq("id", user.id)
      .select("id");
    if (error) {
      return {
        error: SAVE_FAILED,
        code: "write_failed",
      };
    }
    if (!data?.length) {
      return {
        error: SAVE_FAILED,
        code: "no_row",
      };
    }
    return { error: null };
  } catch {
    return {
      error: SAVE_FAILED,
      code: "unexpected",
    };
  }
}

/**
 * Stamp `users.first_report_seen_at` the first time the signed-in player
 * opens a published report of a personal match they filed. The match page
 * calls it (`matches/(detail)/[matchId]/page.tsx`) once the report is on
 * screen; the column is the first-match feedback prompt's clock
 * (`firstMatchFeedbackDue`, `lib/feedback/first-match-feedback.ts`).
 *
 * Write-once: `.is("first_report_seen_at", null)` keeps the first moment,
 * however many reports follow. Same client, same own-row policy, same
 * column-scoped grant (`20261025063957_first_match_feedback.sql`) and the
 * same never-throws contract as `markTourDone`: a failed write only means
 * the next report stamps it instead.
 */
export async function markFirstReportSeen(): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from("users")
      .update({ first_report_seen_at: new Date().toISOString() })
      .eq("id", user.id)
      .is("first_report_seen_at", null);
    if (error) {
      console.error("[first-report seen] write failed", { code: error.code });
    }
  } catch (cause) {
    console.error("[first-report seen] write failed", cause);
  }
}
