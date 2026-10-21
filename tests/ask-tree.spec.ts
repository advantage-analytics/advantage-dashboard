import { expect, test } from "@playwright/test";

import {
  EMPTY_MATCH_FILTERS,
  parseMatchFilters,
} from "@/components/dashboard/matches/match-detail/match-filters/model";
import type { AskRow } from "@/lib/services/ask/answer-render";
import {
  ASK_VISUAL_WATCH_PREFIX,
  type AskTreeWatch,
  parseTreeWatch,
  treeBranchFilters,
  treeBranchPattern,
  treeBranchWatch,
  treeWatchFields,
} from "@/lib/services/ask/tree";

/**
 * `tree.ts`: the play tree's `WATCH:` line, and what a branch's row opens
 * under it. Pure — a request and a row in, a pattern or a filter out.
 */

const SERVE: AskTreeWatch = {
  kind: "plus-one",
  phase: "serve",
  subject: "mine",
  serveType: null,
};
const RETURN: AskTreeWatch = {
  kind: "plus-one",
  phase: "return",
  subject: "opponent",
  serveType: "second",
};
const PLAYS: AskTreeWatch = { kind: "plays", subject: "opponent" };

test.describe("the WATCH line", () => {
  test("is the server's own keyword", () => {
    expect(ASK_VISUAL_WATCH_PREFIX).toBe("WATCH:");
  });

  test("a request's fields read back as the request", () => {
    for (const watch of [
      SERVE,
      RETURN,
      PLAYS,
      { ...SERVE, serveType: "first" } as const,
      { kind: "plays", subject: "mine" } as const,
      { kind: "plays", subject: "mine", won: true } as const,
      { kind: "plays", subject: "mine", won: true, rally: "short" } as const,
      { kind: "plays", subject: "opponent", rally: "long" } as const,
    ]) {
      expect(parseTreeWatch(treeWatchFields(watch))).toEqual(watch);
    }
    expect(treeWatchFields(SERVE)).toEqual([
      "plus-one",
      "serve",
      "mine",
      "any",
    ]);
    expect(treeWatchFields(RETURN)).toEqual([
      "plus-one",
      "return",
      "opponent",
      "second",
    ]);
    expect(treeWatchFields(PLAYS)).toEqual(["plays", "opponent"]);
    expect(treeWatchFields({ ...PLAYS, won: true })).toEqual([
      "plays",
      "opponent",
      "won",
    ]);
    // Fields arrive trimmed or not.
    expect(parseTreeWatch([" plays ", " mine "])).toEqual({
      kind: "plays",
      subject: "mine",
    });
  });

  test("anything else is no request", () => {
    for (const fields of [
      [],
      ["plus-one"],
      ["plus-one", "serve", "mine"],
      ["plus-one", "volley", "mine", "any"],
      ["plus-one", "serve", "them", "any"],
      ["plus-one", "serve", "mine", "third"],
      ["plus-one", "serve", "mine", "any", "extra"],
      ["plays"],
      ["plays", "mine", "extra"],
      ["plays", "mine", "lost"],
      ["plays", "mine", "won", "extra"],
      ["plays", "mine", "won", "short", "extra"],
      ["plays", "mine", "short", "won"],
      ["plays", "theirs"],
      ["pie", "mine"],
    ]) {
      expect(parseTreeWatch(fields), fields.join("|")).toBeNull();
    }
  });
});

const ROW: AskRow = {
  section: "pattern",
  court: null,
  zone: "T",
  stroke: "Forehand",
  direction: "Crosscourt",
  points: 29,
  won: 14,
  won_pct: 48.3,
};

test.describe("a branch's pattern", () => {
  test("a serve +1 branch: the subject served to the zone, then hit the +1 as the server's shot 3", () => {
    expect(treeBranchPattern(SERVE, ROW)).toEqual({
      serve: { server: "mine", zones: ["T"], type: null },
      returnShot: null,
      plusOne: {
        after: "serve",
        strokes: ["Forehand"],
        directions: ["Crosscourt"],
      },
      shots: [],
    });
    expect(treeBranchFilters(SERVE, ROW)).toEqual({
      ...EMPTY_MATCH_FILTERS,
      server: "you",
      serveZone: ["T"],
      customPlayer: "you",
      customStroke: ["Forehand"],
      customDirection: ["Crosscourt"],
      customRallyShot: [3],
    });
  });

  test("a side, and first or second serves, when the request and the row say so", () => {
    const filters = treeBranchFilters(
      { ...SERVE, serveType: "first" },
      { ...ROW, court: "Ad", zone: "Wide", direction: "Inside Out" },
    );
    expect(filters).toMatchObject({
      court: "ad",
      server: "you",
      serveType: ["first"],
      serveZone: ["Wide"],
      customDirection: ["Inside Out"],
      customRallyShot: [3],
    });
  });

  test("a return +1 branch: the other side served, the subject's return went to the zone, then the returner's shot 4", () => {
    const row = { ...ROW, zone: "Down the Line", stroke: "Backhand" };
    expect(treeBranchPattern(RETURN, row)).toEqual({
      serve: { server: "mine", zones: [], type: "second" },
      returnShot: { strokes: [], zones: ["Down the Line"] },
      plusOne: {
        after: "return",
        strokes: ["Backhand"],
        directions: ["Crosscourt"],
      },
      shots: [],
    });
    expect(treeBranchFilters(RETURN, row)).toEqual({
      ...EMPTY_MATCH_FILTERS,
      server: "you",
      serveType: ["second"],
      returnZone: ["Down the Line"],
      customPlayer: "opponent",
      customStroke: ["Backhand"],
      customDirection: ["Crosscourt"],
      customRallyShot: [4],
    });
  });

  test("a plays branch: the subject's stroke in that direction, anywhere in the point", () => {
    const row: AskRow = {
      section: "rally",
      stroke: "Backhand",
      direction: "Down the Line",
      shots: 48,
      missed: 8,
      miss_pct: 16.7,
    };
    expect(treeBranchPattern(PLAYS, row)).toEqual({
      serve: null,
      returnShot: null,
      plusOne: null,
      shots: [
        {
          player: "opponent",
          strokes: ["Backhand"],
          directions: ["Down the Line"],
          within: null,
        },
      ],
    });
    expect(treeBranchFilters(PLAYS, row)).toEqual({
      ...EMPTY_MATCH_FILTERS,
      customPlayer: "opponent",
      customStroke: ["Backhand"],
      customDirection: ["Down the Line"],
    });
  });

  test("a winning plays branch: only the points the subject won", () => {
    const row: AskRow = {
      section: "play",
      stroke: "Forehand",
      direction: "Crosscourt",
      points: 12,
      winners: 5,
      points_pct: 29.3,
    };
    // Won or lost is the viewer's side's, so the opponent's points won are
    // the viewer's points lost.
    expect(treeBranchFilters({ ...PLAYS, won: true }, row)).toEqual({
      ...EMPTY_MATCH_FILTERS,
      customPlayer: "opponent",
      customStroke: ["Forehand"],
      customDirection: ["Crosscourt"],
      resultOutcome: ["lost"],
    });
    expect(
      treeBranchFilters({ kind: "plays", subject: "mine", won: true }, row),
    ).toMatchObject({ customPlayer: "you", resultOutcome: ["won"] });
    const watch = treeBranchWatch({ ...PLAYS, won: true }, row);
    expect(parseMatchFilters(watch)).toEqual(
      treeBranchFilters({ ...PLAYS, won: true }, row),
    );
    // The rally band the answer counted narrows the film to it.
    expect(
      treeBranchFilters({ ...PLAYS, won: true, rally: "short" }, row),
    ).toMatchObject({ resultOutcome: ["lost"], resultRallyLength: ["short"] });
  });

  test("a value outside the filter's lists is no link rather than a wrong one", () => {
    // The middle is a direction Ask counts and the filter does not offer.
    expect(
      treeBranchPattern(SERVE, { ...ROW, direction: "Middle" }),
    ).toBeNull();
    expect(
      treeBranchPattern(PLAYS, { ...ROW, direction: "Middle" }),
    ).toBeNull();
    expect(treeBranchPattern(SERVE, { ...ROW, stroke: "Serve" })).toBeNull();
    expect(treeBranchPattern(SERVE, { ...ROW, zone: "Deep" })).toBeNull();
    expect(treeBranchPattern(SERVE, { ...ROW, zone: null })).toBeNull();
    expect(treeBranchPattern(SERVE, { ...ROW, court: "Left" })).toBeNull();
    expect(treeBranchPattern(RETURN, { ...ROW, zone: "T" })).toBeNull();
    expect(treeBranchWatch(SERVE, { ...ROW, direction: "Middle" })).toBeNull();
  });

  test("the watch is the filter as the URL carries it, and reads back whole", () => {
    const watch = treeBranchWatch(SERVE, ROW);
    expect(watch).toMatch(/^[a-z0-9._]+$/);
    expect(parseMatchFilters(watch)).toEqual(treeBranchFilters(SERVE, ROW));
    const plays = treeBranchWatch(PLAYS, {
      stroke: "Volley",
      direction: "Inside In",
    });
    expect(parseMatchFilters(plays)).toMatchObject({
      customPlayer: "opponent",
      customStroke: ["Volley"],
      customDirection: ["Inside In"],
    });
  });
});
