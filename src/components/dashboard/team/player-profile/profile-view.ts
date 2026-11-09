/**
 * The player profile's rail switcher — Statistics · Visualizations (design Q)
 * — and the `?tab=` rule behind it.
 *
 * The same shape as the match report's `report-view.ts`, and the same key, so
 * a profile URL and a report URL read alike: `?tab=visualizations` opens the
 * second view, and an absent, empty, mis-cased or stale value reads as
 * Statistics rather than as an error. Pure — no React, no `"use client"` —
 * so `tests/profile-view.spec.ts` can pin it.
 */

export const PROFILE_VIEW_PARAM = "tab";

export const PROFILE_VIEWS = [
  { value: "statistics", label: "Statistics" },
  { value: "visualizations", label: "Visualizations" },
] as const;

export type ProfileView = (typeof PROFILE_VIEWS)[number]["value"];

export const DEFAULT_PROFILE_VIEW: ProfileView = "statistics";

export function isProfileView(value: unknown): value is ProfileView {
  return PROFILE_VIEWS.some((view) => view.value === value);
}

/** `?tab=` → the active view; anything that is not a view reads as Statistics. */
export function parseProfileView(
  value: string | string[] | null | undefined,
): ProfileView {
  // A repeated `?tab=` arrives as an array from a page's `searchParams`;
  // the first one wins, as `URLSearchParams.get` would have it.
  const first = Array.isArray(value) ? value[0] : value;
  return isProfileView(first) ? first : DEFAULT_PROFILE_VIEW;
}

/** The view's rail and title label. */
export function profileViewLabel(view: ProfileView): string {
  return (
    PROFILE_VIEWS.find((entry) => entry.value === view)?.label ??
    PROFILE_VIEWS[0].label
  );
}

/**
 * The active view → the query string, carrying every other parameter through.
 * The default view clears `tab` rather than writing it ("absent is default"),
 * so the bare profile URL stays the canonical Statistics link. Returns a new
 * string; `params` is never mutated.
 */
export function profileViewQuery(
  params: URLSearchParams,
  view: ProfileView,
): string {
  const next = new URLSearchParams(params.toString());
  if (view === DEFAULT_PROFILE_VIEW) next.delete(PROFILE_VIEW_PARAM);
  else next.set(PROFILE_VIEW_PARAM, view);
  return next.toString();
}
