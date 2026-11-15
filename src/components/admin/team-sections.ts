/**
 * The Admin › Teams detail page's views — which `?view=` shows what.
 *
 * The page is one full-width column (`TeamDetail.dc.html`, 2026-11-12):
 * header, Details, People, Latest matches, then the Activity log (T21 — on the
 * page itself, no longer a view of its own). There is no pill row and no rail
 * any more. The cards the artboard has no place for — Schedule, the Pilot and
 * per-member Usage cards, Contacts — are kept behind `?view=` rather than
 * deleted (`Add hours` → usage).
 *
 * `next.config.ts` still redirects the five old sub-routes
 * (`/admin/teams/<id>/<slug>`) to `?view=<slug>`, so every one of those slugs
 * must land somewhere: `roster` and `activity` have no view of their own now
 * (the roster is part of People on the default view, and the activity log is
 * its last section) and resolve to the default, like any value this file does
 * not know.
 */

/** A card the page can render on its own behind a `?view=`. */
export type TeamCardId = "people" | "contacts" | "schedule" | "pilot" | "usage";

export type TeamViewId = "overview" | "people" | "schedule" | "usage";

export interface TeamView {
  readonly id: TeamViewId;
  /** The view's name in the tab title — "Centennial High School · Usage". */
  readonly label: string;
  /**
   * The cards the view shows, in order. Empty for `overview`, which is the
   * composed column rather than a list of cards.
   */
  readonly cards: readonly TeamCardId[];
}

export const TEAM_VIEWS: readonly TeamView[] = [
  { id: "overview", label: "Overview", cards: [] },
  {
    id: "people",
    label: "People",
    // The one People list (join requests, members and roster players,
    // invitations), then Contacts, which the default view has no place for.
    cards: ["people", "contacts"],
  },
  { id: "schedule", label: "Schedule & results", cards: ["schedule"] },
  { id: "usage", label: "Usage", cards: ["pilot", "usage"] },
];

/** `?view=` → a known view, or the default for anything missing or unknown. */
export function teamViewFrom(value: string | null | undefined): TeamView {
  return TEAM_VIEWS.find((view) => view.id === value) ?? TEAM_VIEWS[0];
}

/** "Centennial High School · Usage" — the program alone on the default view. */
export function teamViewTitle(programName: string, view: TeamView): string {
  return view.id === "overview"
    ? programName
    : `${programName} · ${view.label}`;
}

/** The link to one view of a team's page; the default is the bare path. */
export function teamViewHref(programId: string, view: TeamViewId): string {
  const base = `/admin/teams/${encodeURIComponent(programId)}`;
  return view === "overview" ? base : `${base}?view=${view}`;
}
