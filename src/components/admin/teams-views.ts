import type { AdminTeamsView } from "@/lib/data/admin-teams-server";

/**
 * Admin › Teams' views and the URL that names them — pure, so the server page,
 * the client toolbar and `tests/admin-teams-views.spec.ts` share one mapping.
 *
 * The page has three view pills, in this order: Programs, Pilot players and
 * Conferences. `?view=` carries more values than that: Programs stands for any
 * of the loader's four program views (`on_advantage` is the default and stays
 * out of the URL; `in_pilot`, `needs_review` and `all` are what old links name,
 * since AdminTeams T9 took their pills away), `pilots` is Pilot players and
 * `conferences` is Conferences. Anything else reads as the default.
 */

/** The page's views: the loader's four program views, pilots and conferences. */
export type TeamsPageView = AdminTeamsView | "pilots" | "conferences";

/** The view row's pills. */
export type TeamsViewPill = "programs" | "pilots" | "conferences";

/** The pills in the order the view row shows them. */
export const TEAMS_VIEW_PILLS: readonly TeamsViewPill[] = [
  "programs",
  "pilots",
  "conferences",
];

const PAGE_VIEWS = new Set<TeamsPageView>([
  "on_advantage",
  "in_pilot",
  "needs_review",
  "all",
  "pilots",
  "conferences",
]);

/**
 * `?view=` → the page's view. Unknown, empty or missing falls back to the
 * default rather than 404ing: a hand-edited or stale URL should still show the
 * page it names.
 */
export function teamsPageViewFrom(
  param: string | null | undefined,
): TeamsPageView {
  const value = param?.trim();
  return value && PAGE_VIEWS.has(value as TeamsPageView)
    ? (value as TeamsPageView)
    : "on_advantage";
}

/** The pill a view lights: every program view is Programs. */
export function teamsViewPill(view: TeamsPageView): TeamsViewPill {
  if (view === "pilots" || view === "conferences") return view;
  return "programs";
}

/** URL → pill: what `?view=` lights in the view row. */
export function teamsViewPillFrom(
  param: string | null | undefined,
): TeamsViewPill {
  return teamsViewPill(teamsPageViewFrom(param));
}

/** Pill → the view it opens. Programs opens the default program view. */
export function teamsPillView(pill: TeamsViewPill): TeamsPageView {
  return pill === "programs" ? "on_advantage" : pill;
}

/**
 * A view → its `?view=` value, or null for the default, which stays out of the
 * URL so a first visit and a deliberate reset produce the same address.
 */
export function teamsViewParam(view: TeamsPageView): string | null {
  return view === "on_advantage" ? null : view;
}

/** Pill → URL: the `?view=` value a pill writes, null for Programs. */
export function teamsViewPillParam(pill: TeamsViewPill): string | null {
  return teamsViewParam(teamsPillView(pill));
}
