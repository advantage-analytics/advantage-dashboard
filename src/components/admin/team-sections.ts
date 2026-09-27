/**
 * The Admin › Teams detail page's section map — the one place that knows
 * which cards exist, what each is called, which column it sits in, and which
 * view shows it.
 *
 * The pill row FILTERS the main column (decision 2026-09-26, replacing the
 * scroll anchors T8 built): `Overview` shows every main card, each other pill
 * shows only its own. The rail stays on every view — it is the program's
 * standing facts (pilot, usage, conference, details), and an admin reading
 * the roster still wants the pilot beside it. The one rail card with a pill of
 * its own, Usage, moves into the main column on its view rather than showing
 * twice.
 *
 * The view lives in `?view=` so a link lands on it; `Overview` is the absence
 * of the parameter. Every `<section id>` wrapper still renders, so an anchor
 * such as the header's `⋯ › Change conference` (`#conference`) still lands.
 */

export type TeamSectionId =
  | "people"
  | "requests"
  | "roster"
  | "schedule"
  | "activity"
  | "pilot"
  | "usage"
  | "conference"
  | "details";

/** The reading column: who is on the program and what it has played. */
export const TEAM_MAIN_SECTIONS = [
  "people",
  "requests",
  "roster",
  "schedule",
  "activity",
] as const satisfies readonly TeamSectionId[];

/** The 380px rail: the program's own facts and what it is spending. */
export const TEAM_RAIL_SECTIONS = [
  "pilot",
  "usage",
  "conference",
  "details",
] as const satisfies readonly TeamSectionId[];

/**
 * Each section's heading. A section that has no card yet still renders this
 * word, so a pill never scrolls to a blank — see `page.tsx`.
 */
export const TEAM_SECTION_TITLES: Record<TeamSectionId, string> = {
  people: "People",
  requests: "Requests",
  roster: "Roster",
  schedule: "Schedule & results",
  activity: "Activity log",
  pilot: "Pilot",
  usage: "Usage",
  conference: "Conference",
  details: "Details",
};

/** One pill: its label, and the main-column cards its view shows. */
export interface TeamView {
  readonly id: TeamViewId;
  readonly label: string;
  readonly main: readonly TeamSectionId[];
}

export type TeamViewId =
  "overview" | "people" | "roster" | "schedule" | "usage" | "activity";

/**
 * The canvas' six pills, in its order. People carries Requests with it: a
 * join request is a person waiting to be on that list.
 */
export const TEAM_VIEWS: readonly TeamView[] = [
  { id: "overview", label: "Overview", main: TEAM_MAIN_SECTIONS },
  { id: "people", label: "People", main: ["people", "requests"] },
  { id: "roster", label: "Roster", main: ["roster"] },
  { id: "schedule", label: "Schedule & results", main: ["schedule"] },
  { id: "usage", label: "Usage", main: ["usage"] },
  { id: "activity", label: "Activity log", main: ["activity"] },
];

/** `?view=` → a known view, or Overview for anything missing or unknown. */
export function teamViewFrom(value: string | null | undefined): TeamView {
  return TEAM_VIEWS.find((view) => view.id === value) ?? TEAM_VIEWS[0];
}

/** The rail for a view: every rail card the main column is not already showing. */
export function teamRailFor(view: TeamView): TeamSectionId[] {
  return TEAM_RAIL_SECTIONS.filter((id) => !view.main.includes(id));
}

/** "Centennial High School · Roster" — the program alone on Overview. */
export function teamViewTitle(programName: string, view: TeamView): string {
  return view.id === "overview"
    ? programName
    : `${programName} · ${view.label}`;
}
