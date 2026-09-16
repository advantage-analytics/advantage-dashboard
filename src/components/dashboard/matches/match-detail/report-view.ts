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

/**
 * `?tab=` → the active view. Anything that is not `"shots"` or `"film"` —
 * absent, empty, mis-cased, or a stale `"stats"` link — reads as the default
 * Statistics view rather than as an error. Mirrors `parseMatchTab`.
 */
export function parseReportView(value: string | null | undefined): ReportView {
  return value === "shots" || value === "film" ? value : "statistics";
}

/**
 * The active view → the query string, carrying every other parameter through
 * (set scope, anything else the pane is doing) so switching views can never
 * drop `?set=`. Statistics is the default view, so selecting it clears `tab`
 * rather than writing `tab=statistics` — the same "absent is default" rule
 * `setScopeQuery` uses for `?set=`.
 *
 * Returns a new string; `params` is never mutated, since callers hold onto
 * their own copy of the live search params after this call.
 */
export function reportViewQuery(
  params: URLSearchParams,
  view: ReportView,
): string {
  const next = new URLSearchParams(params.toString());
  if (view === "statistics") next.delete("tab");
  else next.set("tab", view);
  return next.toString();
}
