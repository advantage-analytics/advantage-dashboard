import { createClient } from "@/lib/supabase/server";
import { TOUR_COLUMN, type TourId } from "@/lib/onboarding/tours";

/**
 * When the viewer finished (or skipped) a first-run report tour — the
 * `users.<tour>_done_at` column `markTourDone` stamps, named through the same
 * `TOUR_COLUMN` map so the read and the write can never disagree.
 *
 * Read through the cookie client, so the row's own-row RLS bounds it to the
 * viewer; `viewerId` is passed only so the query is explicit about whose row.
 *
 * Three answers, and the difference between the last two is the point:
 *
 *   - a timestamp — the tour was finished then;
 *   - `null` — never finished;
 *   - `undefined` — the read failed (or found no row), so nothing is known.
 *
 * Callers treat `undefined` as "do not auto-start": a transient error must
 * never push a tour at someone who already dismissed it, while an explicit
 * `?tour=1` is still honoured since it needs no row. Logged, never thrown —
 * the report is the thing, the tour a courtesy over it.
 */
export async function getTourDoneAt(
  viewerId: string,
  tour: TourId,
): Promise<string | null | undefined> {
  const column = TOUR_COLUMN[tour];
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("users")
      .select(column)
      .eq("id", viewerId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return undefined;
    return ((data as Record<string, unknown>)[column] as string | null) ?? null;
  } catch (cause) {
    console.error(`[${tour} tour] seen-state read failed`, cause);
    return undefined;
  }
}
