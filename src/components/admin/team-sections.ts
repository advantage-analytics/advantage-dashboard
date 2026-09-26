/**
 * The Admin › Teams detail page's section map — the one place that knows
 * which anchors exist, what each is called, and which column it sits in.
 *
 * The page used to be six routes behind a tab bar. It is now one scroll with
 * nine `<section id>` wrappers, so two things have to agree: the pill row's
 * anchors and the sections they scroll to. Keeping both off this module means
 * a section can never be added to the page without the pill row learning
 * about it, and a pill can never point at an id nothing renders.
 *
 * Nine sections, six pills: `Requests`, `Pilot`, `Conference` and `Details`
 * are short cards a reader reaches by scrolling past the thing above them,
 * and the canvas' toolbar names only the six destinations worth a jump.
 * `Overview` is the sixth — the top of the page, which is not a section at
 * all, hence `target: null`.
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

/**
 * The toolbar, in the canvas' order:
 * `Overview · People · Roster · Schedule & results · Usage · Activity log`.
 *
 * Order is load-bearing twice over — it is the row's reading order, and it is
 * the tie-break `TeamSectionPills` uses when two sections are on screen at
 * once, which they routinely are because the rail runs alongside the main
 * column rather than below it.
 */
export const TEAM_SECTION_PILLS: readonly {
  readonly id: string;
  readonly label: string;
  /** The `<section id>` to scroll to, or `null` for the top of the page. */
  readonly target: TeamSectionId | null;
}[] = [
  { id: "overview", label: "Overview", target: null },
  { id: "people", label: "People", target: "people" },
  { id: "roster", label: "Roster", target: "roster" },
  { id: "schedule", label: "Schedule & results", target: "schedule" },
  { id: "usage", label: "Usage", target: "usage" },
  { id: "activity", label: "Activity log", target: "activity" },
];
