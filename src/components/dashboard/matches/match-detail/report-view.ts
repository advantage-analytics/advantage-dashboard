/**
 * The report's rail switcher — Statistics · Visualizations · Video (F1) — and
 * the `?tab=` rule behind it.
 *
 * Same shape as `match-tabs.tsx`'s `MATCH_TABS`/`parseMatchTab`: the query key
 * stays `tab` (spec: "`?tab=` values unchanged") and only the labels move —
 * "Visualizations" and "Video" read better on a rail row than "Shots &
 * placement"/"Film room" did on a tab — so an old `?tab=shots` link still
 * lands on the right view. Kept as its own pure file rather than folded into
 * `match-report-context.tsx` because a plain array, a type and two functions
 * need no React and no `"use client"`; the context is the only file that has
 * to know the view lives in the URL at all.
 */

export const REPORT_VIEWS = [
  { value: "statistics", label: "Statistics" },
  { value: "shots", label: "Visualizations" },
  { value: "film", label: "Video" },
] as const;

export type ReportView = (typeof REPORT_VIEWS)[number]["value"];

export function isReportView(value: unknown): value is ReportView {
  return REPORT_VIEWS.some((view) => view.value === value);
}

/**
 * `?tab=` → the active view. Anything that is not a view — absent, empty,
 * mis-cased, or a stale `"stats"` link — reads as `fallback` rather than as an
 * error. `fallback` is the reader's "Match report opens at" preference
 * (Settings › Preferences), Statistics when there is none. Mirrors
 * `parseMatchTab`.
 */
export function parseReportView(
  value: string | null | undefined,
  fallback: ReportView = "statistics",
): ReportView {
  return isReportView(value) ? value : fallback;
}

/**
 * The active view → the query string, carrying every other parameter through
 * so switching views never drops one. Selecting the default view clears `tab`
 * rather than writing it — the same "absent is default" rule `setScopeQuery`
 * uses for `?set=`. Any other view is written out, Statistics included, so a
 * reload stays on the view the reader picked instead of their saved default.
 *
 * Returns a new string; `params` is never mutated, since callers hold onto
 * their own copy of the live search params after this call.
 */
export function reportViewQuery(
  params: URLSearchParams,
  view: ReportView,
  defaultView: ReportView = "statistics",
): string {
  const next = new URLSearchParams(params.toString());
  if (view === defaultView) next.delete("tab");
  else next.set("tab", view);
  return next.toString();
}

/**
 * The reader's "Match report opens at" preference → the view a bare URL
 * actually opens at. Video without a playable video would open on an empty
 * player, so that one case falls back to Statistics.
 */
export function resolveDefaultView(
  preference: ReportView,
  hasPlayableVideo: boolean,
): ReportView {
  return preference === "film" && !hasPlayableVideo ? "statistics" : preference;
}
