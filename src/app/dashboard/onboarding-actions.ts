"use server";

import { createClient } from "@/lib/supabase/server";
import type { TourId } from "@/lib/onboarding/tours";

/**
 * Record that the signed-in player has finished (or skipped) a first-run
 * report tour. Design: `work/first-run-onboarding/02_design/output/design.md`
 * §6 — either is set on Done OR Skip, and no partial step index is kept.
 *
 * Writes with the cookie client, so `users`' own-row ALL policy
 * (`auth.uid() = id`) and the column-scoped UPDATE grant
 * (`20261007061209_users_onboarding_tours_column_grants.sql`) are what admit
 * the write; the id comes from the session, never from the caller. The tour id is mapped to its column
 * through `TOUR_COLUMN` below — the input is never interpolated into SQL.
 *
 * Never throws: the runner closes the tour whatever comes back, and a
 * rejected promise there would surface as an unhandled rejection for a write
 * that only decides whether the tour is offered again next session.
 */

const TOUR_COLUMN = {
  sample: "sample_tour_done_at",
  "first-report": "first_report_tour_done_at",
} as const satisfies Record<TourId, string>;

export interface MarkTourDoneResult {
  /** The sentence a client could show; `null` on success. */
  error: string | null;
  /** The slug a client branches on, present only beside an `error`. */
  code?: "unknown_tour" | "unauthenticated" | "write_failed" | "unexpected";
}

export async function markTourDone(tour: TourId): Promise<MarkTourDoneResult> {
  // A server action's argument is whatever the network sent, so the type is
  // re-checked here against the two columns that exist.
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

    const { error } = await supabase
      .from("users")
      .update({ [column]: new Date().toISOString() })
      .eq("id", user.id);
    if (error) {
      return {
        error: "Could not save that the tour was seen.",
        code: "write_failed",
      };
    }
    return { error: null };
  } catch {
    return {
      error: "Could not save that the tour was seen.",
      code: "unexpected",
    };
  }
}
