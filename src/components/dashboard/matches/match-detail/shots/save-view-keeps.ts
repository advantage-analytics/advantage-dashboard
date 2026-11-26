import type { WorkspaceKind } from "@/lib/workspace/types";
import {
  storedCourtEnds,
  type Chart,
  type CourtEnds,
  type Cut,
  type VizFilters,
} from "./viz-model";
import { activeFilterEntries } from "./viz-url";
import { CHART_LABEL, CUT_LABEL } from "./viz-labels";

/**
 * "What this view keeps" (plan §10, board Final-11): the Save popover's
 * definition list, one row per fact a saved view carries or implies. A view
 * stores its cut, chart and filters only — these rows say so in words, and
 * the Matches row says which matches it reads when it is opened here.
 */
export interface SaveViewKeepsRow {
  term: "Chart" | "Shots" | "Matches" | "Opens on";
  value: string;
}

/**
 * Where the dialog was opened: a match report (the view reads that match),
 * or the player page, whose match scope a view opened there inherits —
 * `words` are the scope's own words ("Won", "Left-handed", "3 matches"),
 * empty for the whole season.
 */
export type SaveViewMatches =
  { kind: "match" } | { kind: "page"; words: readonly string[] };

const ENDS_LABEL: Record<CourtEnds, string> = {
  placement: "Placement",
  contact: "Contact",
  both: "Both",
};

/** The Shots row with no filter on: every shot of the cut, by its noun. */
const ALL_SHOTS: Record<Cut, string> = {
  serve: "All serves",
  returnPlacement: "All returns",
  returnContact: "All returns",
  rallyPosition: "All shots",
  rallyPlacement: "All shots",
  errors: "All errors",
  approaches: "All approaches",
};

export function saveViewKeeps({
  cut,
  chart,
  filters,
  errorSplitJudged,
  matches,
  workspaceKind,
}: {
  cut: Cut;
  chart: Chart;
  filters: VizFilters;
  /** The match's `errorSplitJudged`; `false` names one "Errors" token. */
  errorSplitJudged?: boolean;
  matches: SaveViewMatches;
  workspaceKind: WorkspaceKind;
}): SaveViewKeepsRow[] {
  // The chart, then the court's ends when the view keeps one away from the
  // cut's default (Returns in Contact), then the kind.
  const ends = storedCourtEnds(cut, filters.ends);
  const chartValue = [
    CUT_LABEL[cut],
    ...(ends ? [ENDS_LABEL[ends]] : []),
    CHART_LABEL[chart],
  ].join(" · ");

  // The applied-filter sentence, in the strip's own words. A view opens on
  // any match, so the player reads "Opponent", never one match's name.
  const shots = activeFilterEntries(
    { cut, chart, filters, viewId: null },
    undefined,
    { errorSplitJudged },
  ).map((e) => e.label);

  const matchesValue =
    matches.kind === "match"
      ? "This match"
      : [
          ...(matches.words.length > 0 ? matches.words : ["All matches"]),
          "From this page",
        ].join(" · ");

  return [
    { term: "Chart", value: chartValue },
    {
      term: "Shots",
      value: shots.length > 0 ? shots.join(" · ") : ALL_SHOTS[cut],
    },
    { term: "Matches", value: matchesValue },
    {
      term: "Opens on",
      // A personal workspace has no player profiles to open it on.
      value:
        workspaceKind === "team"
          ? "Every match and player profile"
          : "Every match",
    },
  ];
}
