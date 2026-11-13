/**
 * The Admin › Teams detail page's views — which `?view=` shows what.
 *
 * The page is one centred column (`TeamDetail.dc.html`, 2026-11-12): header,
 * Details, People, Latest matches, then a link to the activity log. There is
 * no pill row and no rail any more. The cards the artboard has no place for —
 * Schedule, the Pilot and per-member Usage cards, Contacts, the Activity log —
 * are kept behind `?view=` rather than deleted, each reached by a link on the
 * default view (`Add hours` → usage, the activity link → activity).
 *
 * `next.config.ts` still redirects the five old sub-routes
 * (`/admin/teams/<id>/<slug>`) to `?view=<slug>`, so every one of those slugs
 * must land somewhere: `roster` has no view of its own now (the roster is part
 * of People on the default view) and resolves to the default, like any value
 * this file does not know.
 */

/** A card the page can render on its own behind a `?view=`. */
export type TeamCardId =
  | "requests"
  | "people"
  | "roster"
  | "contacts"
  | "schedule"
  | "pilot"
  | "usage"
  | "activity";

export type TeamViewId =
  "overview" | "people" | "schedule" | "usage" | "activity";

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

/**
 * The People section as the default view draws it: join requests first, then
 * the members, then the roster. Merged into one list by a later task (T13).
 */
export const TEAM_PEOPLE_CARDS = [
  "requests",
  "people",
  "roster",
] as const satisfies readonly TeamCardId[];

export const TEAM_VIEWS: readonly TeamView[] = [
  { id: "overview", label: "Overview", cards: [] },
  {
    id: "people",
    label: "People",
    cards: [...TEAM_PEOPLE_CARDS, "contacts"],
  },
  { id: "schedule", label: "Schedule & results", cards: ["schedule"] },
  { id: "usage", label: "Usage", cards: ["pilot", "usage"] },
  { id: "activity", label: "Activity log", cards: ["activity"] },
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
