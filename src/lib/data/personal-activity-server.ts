import { createClient } from "@/lib/supabase/server";
import {
  activityWindowStart,
  personalActivityFrom,
  type PersonalActivity,
} from "@/lib/data/personal-activity";

export type {
  ActivityDay,
  PersonalActivity,
} from "@/lib/data/personal-activity";

/**
 * The last 52 weeks of the viewer's **personal** match activity, bucketed by
 * day for the Home activity heatmap.
 *
 * Scope is `created_by = me AND program_id IS NULL` — the same personal
 * predicate the Matches list uses, so a coach's program uploads never leak into
 * a personal grid. The bucketing itself is `personalActivityFrom`, kept pure so
 * Home's day-zero loading fallback draws the same empty grid.
 */
export async function getPersonalActivity(
  userId: string,
  knownMatches?: { date: string }[],
): Promise<PersonalActivity> {
  if (knownMatches) return personalActivityFrom(knownMatches);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("matches")
    .select("date")
    .eq("created_by", userId)
    .is("program_id", null)
    .gte("date", activityWindowStart().toISOString());

  if (error) throw new Error("Could not load activity", { cause: error });
  return personalActivityFrom(data ?? []);
}
