import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { LabelMarks } from "@/lib/services/labels/marks";
import { tiebreakFolds } from "@/lib/services/labels/tiebreak-fold";
import type {
  LabelPoint,
  LabelSession,
  LabelStartScore,
} from "@/lib/services/labels/session";
import { tag, text } from "./fixtures/html-probe";
import {
  FIXTURE_POINT_IDS,
  labelPoint,
  labelSessionFixture,
} from "./fixtures/label-session";
import { findWhere } from "./fixtures/react-tree";
import { createLoader } from "./fixtures/vm-modules";

/**
 * Where the video starts (`label_sessions.start_score`) on the points rail:
 * the prompt above point 1, the header menu's item, the inline editor, the
 * saved line, and the console counting every reading from the start.
 */

type Props = Record<string, unknown>;

const CONSOLE = "src/components/admin/labels/label-console.tsx";
const RAIL = "src/components/admin/labels/label-black-rail.tsx";
const START_FILE = "src/components/admin/labels/label-start-score.tsx";
const { P1 } = FIXTURE_POINT_IDS;
const NAMES = { p1: "Lee", p2: "Vargas" };

const START: LabelStartScore = {
  sets: [0, 0],
  games: [2, 0],
  points: [1, 0],
  server: "p1",
};

/** Marks built, with nothing on any row: enough for the mismatch's gate. */
const EMPTY_MARKS: LabelMarks = {
  points: {},
  shots: {},
  suggestions: [],
  serveSides: {},
};

const SAVES = {
  onSaveShot: async () => ({ ok: true, status: "edited" }),
  onSavePoint: async () => ({ ok: true, status: "edited" }),
};

/** Every call each server action received. */
function spies() {
  const calls: Record<string, unknown[][]> = {};
  const record =
    (name: string, answer: (...args: unknown[]) => unknown) =>
    async (...args: unknown[]) => {
      (calls[name] ??= []).push(args);
      return answer(...args);
    };
  const operations = {
    updateSessionFields: record("updateSessionFields", (_id, patch) => ({
      ok: true,
      fields: patch,
    })),
    insertPoint: record("insertPoint", () => ({ error: "not here" })),
  };
  return { calls, operations };
}

/** The console in full screen, as `session` stands. */
function black(
  session: LabelSession,
  /** null renders a console that cannot be written. */
  operations: Props | null = spies().operations,
  marks: LabelMarks | null = EMPTY_MARKS,
): string {
  const { LabelConsole } = createLoader().load(CONSOLE) as {
    LabelConsole: React.ComponentType<Props>;
  };
  return renderToStaticMarkup(
    React.createElement(LabelConsole, {
      session,
      video: null,
      marks,
      initialLayoutMode: "black",
      initialExpandedPointId: null,
      operations: operations ?? undefined,
      ...SAVES,
    }),
  );
}

/** What the console hands its rail: the rail stubbed to keep its props. */
function railProps(session: LabelSession, operations: Props): Props {
  let rail: Props = {};
  const { LabelConsole } = createLoader({
    stubs: {
      "@/components/admin/labels/label-black-rail": {
        LabelBlackRail: (given: Props) => {
          rail = given;
          return null;
        },
      },
    },
  }).load(CONSOLE) as { LabelConsole: React.ComponentType<Props> };
  renderToStaticMarkup(
    React.createElement(LabelConsole, {
      session,
      video: null,
      marks: EMPTY_MARKS,
      initialLayoutMode: "black",
      operations,
      ...SAVES,
    }),
  );
  return rail;
}

function startModule() {
  return createLoader().load(START_FILE) as {
    LabelStartScoreEditor: (props: Props) => React.ReactElement;
    startScorePrompt: (props: Props) => React.ReactElement;
    startScoreError: (start: LabelStartScore, type: string) => string | null;
    startScoreLine: (
      start: LabelStartScore,
      names: Record<string, string>,
      type?: string,
    ) => string;
    formatStartScore: (start: LabelStartScore, type?: string) => string;
  };
}

/** Each band's text, in the rail's order. */
function bands(html: string): string[] {
  return html
    .split(/(?=<div data-game-band=)/)
    .slice(1)
    .map((chunk) => text(chunk.slice(0, chunk.indexOf("</div>"))));
}

const withStart = (): LabelSession => ({
  ...labelSessionFixture(),
  startScore: START,
});

// ── The prompt ─────────────────────────────────────────────────────────────

test.describe("the prompt above point 1", () => {
  test("asks while set 1 doesn't add up and no start is saved, above point 1", () => {
    const html = black(labelSessionFixture());
    const prompt = tag(html, "data-start-score-prompt");
    expect(prompt).toContain(`data-start-score-prompt="${P1}"`);
    expect(html.indexOf("data-start-score-prompt")).toBeLessThan(
      html.indexOf(`data-point-id="${P1}"`),
    );
    expect(text(html)).toContain("Does the video start mid-match?");
    expect(text(html)).toContain(
      "Set 1 adds up to 0–0, but the record says 6–3.",
    );
    expect(html).toContain(">Set the starting score<");
    expect(html).toContain(">It starts at 0–0<");
    // The chip's mismatch is still there: the prompt is a second answer.
    expect(html).toContain("data-score-mismatch");
  });

  test("not when the set adds up, a start is saved, or the rail is read-only", () => {
    const agrees = {
      ...labelSessionFixture(),
      matchScore: { player1: [0], player2: [0] },
    };
    expect(black(agrees)).not.toContain("data-start-score-prompt");
    expect(black(withStart())).not.toContain("data-start-score-prompt");
    expect(black(labelSessionFixture(), null)).not.toContain(
      "data-start-score-prompt",
    );
    const ended = { ...labelSessionFixture(), videoEndsEarly: true };
    expect(black(ended)).not.toContain("data-start-score-prompt");
  });

  test("“It starts at 0–0” saves a 0–0 start for the first server; the other answer opens the editor", () => {
    const { startScorePrompt } = startModule();
    const saved: unknown[] = [];
    let opened = 0;
    const slot = startScorePrompt({
      mismatch: {
        setNumber: 1,
        labelled: "4–6",
        entered: "6–4",
        firstPointId: P1,
        lastPointId: P1,
        reasons: [],
      },
      anchor: P1,
      recordSays: true,
      onSet: () => (opened += 1),
      onStartsAtZero: () => saved.push("zero"),
    });
    const stop = { stopPropagation() {} };
    const zero = findWhere(slot, (p) => "data-start-score-zero" in p);
    const set = findWhere(slot, (p) => "data-start-score-set" in p);
    (zero!.props.onClick as (e: unknown) => void)(stop);
    (set!.props.onClick as (e: unknown) => void)(stop);
    expect(saved).toEqual(["zero"]);
    expect(opened).toBe(1);
    expect(text(renderToStaticMarkup(slot))).toContain(
      "Set 1 adds up to 4–6, but the record says 6–4.",
    );
  });

  test("the rail's 0–0 answer writes start_score through the console", async () => {
    const { calls, operations } = spies();
    const rail = railProps(labelSessionFixture(), operations);
    const save = rail.onSaveStartScore as (start: LabelStartScore) => void;
    save({ sets: [0, 0], games: [0, 0], points: [0, 0], server: "p1" });
    await Promise.resolve();
    expect(calls.updateSessionFields).toEqual([
      [
        labelSessionFixture().id,
        {
          start_score: {
            sets: [0, 0],
            games: [0, 0],
            points: [0, 0],
            server: "p1",
          },
        },
      ],
    ]);
  });
});

// ── The header menu ────────────────────────────────────────────────────────

test.describe("the rail header's session menu", () => {
  test("drawn on an editable rail, prompt or none; not read-only", () => {
    expect(black(labelSessionFixture())).toContain(
      "data-label-rail-session-menu",
    );
    expect(black(withStart())).toContain("data-label-rail-session-menu");
    const agrees = {
      ...labelSessionFixture(),
      matchScore: { player1: [0], player2: [0] },
    };
    const menu = tag(black(agrees), "data-label-rail-session-menu");
    expect(menu).toContain('aria-label="Session actions"');
    expect(menu).toContain('aria-haspopup="menu"');
    expect(black(labelSessionFixture(), null)).not.toContain(
      "data-label-rail-session-menu",
    );
  });

  test("“Video starts mid-match…” closes the menu and opens the editor", () => {
    const { RailSessionMenuRows } = createLoader().load(RAIL) as {
      RailSessionMenuRows: (props: Props) => React.ReactElement<Props>;
    };
    const order: string[] = [];
    const row = RailSessionMenuRows({
      close: () => order.push("close"),
      startScore: null,
      onEditStartScore: () => order.push("edit"),
    });
    expect(row.props.label).toBe("Video starts mid-match…");
    expect(row.props.description).toBe(
      "Set the score before the first point on video",
    );
    (row.props.onSelect as () => void)();
    expect(order).toEqual(["close", "edit"]);
    const saved = RailSessionMenuRows({
      close: () => {},
      startScore: START,
      onEditStartScore: () => {},
    });
    expect(saved.props.description).toBe("Starts at 2–0 · 15–0");
  });
});

// ── The editor ─────────────────────────────────────────────────────────────

/** The markup from the element carrying `from` to the one carrying `to`. */
function between(html: string, from: string, to: string): string {
  return html.slice(
    html.lastIndexOf("<", html.indexOf(from)),
    html.lastIndexOf("<", html.indexOf(to)),
  );
}

/** The editor's tree as one render returns it, and its markup. */
function editor(props: Props): { save: () => void; html: string } {
  const { LabelStartScoreEditor } = startModule();
  let save: () => void = () => {};
  function Probe() {
    const tree = LabelStartScoreEditor(props);
    const button = findWhere(tree, (p) => "data-start-score-save" in p);
    save = button!.props.onClick as () => void;
    return tree;
  }
  return {
    save: () => save(),
    html: renderToStaticMarkup(React.createElement(Probe)),
  };
}

const EDITOR = {
  initial: null,
  defaultServer: "p2",
  names: NAMES,
  gameType: "game",
  onCancel: () => {},
};

test.describe("the inline editor", () => {
  test("sets, games, 0/15/30/40 points per player and the server", () => {
    const { html } = editor({ ...EDITOR, onSave: () => {} });
    expect(text(html)).toContain("Score before the first point on video");
    for (const side of ["p1", "p2"]) {
      expect(html).toContain(`data-start-sets-${side}="0"`);
      expect(html).toContain(`data-start-games-${side}="0"`);
    }
    const points = between(
      html,
      "data-start-points-p1",
      "data-start-points-p2",
    );
    expect(text(points)).toBe("0 15 30 40");
    const server = between(
      html,
      "data-start-server",
      "data-start-score-summary",
    );
    expect(text(server)).toBe("Lee Vargas");
    // Nothing saved: the first game's server is pressed.
    expect(server).toMatch(/aria-pressed="true"[^>]*>Vargas</);
    expect(text(html)).toContain("Starts at 0–0 · 0–0");
    expect(html).toContain(">Cancel<");
    expect(tag(html, "data-start-score-save")).not.toContain(`disabled=""`);
  });

  test("a tiebreak first game takes a count, and refuses one that is already won", () => {
    const tb = editor({ ...EDITOR, gameType: "tiebreak", onSave: () => {} });
    const points = tb.html.slice(
      tb.html.indexOf("data-start-points-p1"),
      tb.html.indexOf("data-start-points-p2"),
    );
    expect(points).toContain('data-start-points-p1="0"');
    expect(text(points)).not.toContain("15");
    const won = editor({
      ...EDITOR,
      gameType: "tiebreak",
      initial: { sets: [0, 0], games: [6, 6], points: [7, 5], server: "p1" },
      onSave: () => {
        throw new Error("a won tiebreak must not save");
      },
    });
    expect(won.html).toContain("data-start-score-error");
    expect(tag(won.html, "data-start-score-save")).toContain(`disabled=""`);
    won.save();
  });

  test("Save hands up the start in the parsed shape", () => {
    const saved: unknown[] = [];
    const { save } = editor({
      ...EDITOR,
      initial: START,
      onSave: (start: unknown) => saved.push(start),
    });
    save();
    expect(saved).toEqual([START]);
    expect(saved[0]).not.toBe(START);
  });

  test("the console's save calls updateSessionFields with start_score", async () => {
    const { calls, operations } = spies();
    const rail = railProps(labelSessionFixture(), operations);
    expect(rail.startScore).toBeNull();
    (rail.onSaveStartScore as (start: LabelStartScore) => void)(START);
    await Promise.resolve();
    expect(calls.updateSessionFields).toEqual([
      [labelSessionFixture().id, { start_score: START }],
    ]);
    // Read-only: nothing to save with.
    const complete = { ...labelSessionFixture(), status: "complete" as const };
    expect(railProps(complete, operations).onSaveStartScore).toBe(undefined);
  });

  test("the overview's scoring saves as ad_scoring, and not on a complete session", async () => {
    const dashboardProps = (
      session: LabelSession,
      operations: Props,
    ): Props => {
      let dashboard: Props = {};
      const { LabelConsole } = createLoader({
        stubs: {
          "@/components/admin/labels/label-dashboard": {
            LabelDashboard: (given: Props) => {
              dashboard = given;
              return null;
            },
          },
        },
      }).load(CONSOLE) as { LabelConsole: React.ComponentType<Props> };
      renderToStaticMarkup(
        React.createElement(LabelConsole, {
          session,
          video: null,
          marks: EMPTY_MARKS,
          initialLayoutMode: "overview",
          operations,
          ...SAVES,
        }),
      );
      return dashboard;
    };
    const { calls, operations } = spies();
    const session = { ...labelSessionFixture(), adScoring: false };
    const dashboard = dashboardProps(session, operations);
    expect(dashboard.adScoring).toBe(false);
    (dashboard.onAdScoringChange as (next: boolean) => void)(true);
    await Promise.resolve();
    expect(calls.updateSessionFields).toEqual([
      [session.id, { ad_scoring: true }],
    ]);
    expect(
      dashboardProps({ ...session, status: "complete" }, operations)
        .onAdScoringChange,
    ).toBe(undefined);
  });

  test("startScoreError: an ordinary game stops at 40; a tiebreak at its target and two clear", () => {
    const { startScoreError } = startModule();
    const at = (points: [number, number]): LabelStartScore => ({
      ...START,
      points,
    });
    expect(startScoreError(at([3, 3]), "game")).toBeNull();
    expect(startScoreError(at([4, 0]), "game")).not.toBeNull();
    expect(startScoreError(at([6, 5]), "tiebreak")).toBeNull();
    expect(startScoreError(at([7, 7]), "tiebreak")).toBeNull();
    expect(startScoreError(at([7, 5]), "tiebreak")).toBe(
      "At 7–5 the tiebreak is already won.",
    );
    expect(startScoreError(at([9, 8]), "match_tiebreak")).toBeNull();
    expect(startScoreError(at([10, 8]), "match_tiebreak")).not.toBeNull();
  });
});

// ── The saved line ─────────────────────────────────────────────────────────

test.describe("the saved line", () => {
  test("replaces the prompt: “Video starts at 2–0 · 15–0, Lee serving”, with Edit", () => {
    const html = black(withStart());
    expect(html).not.toContain("data-start-score-prompt");
    const at = html.indexOf("data-start-score-line");
    expect(at).toBeGreaterThan(html.indexOf("data-label-rail-header"));
    expect(at).toBeLessThan(html.indexOf("data-label-rail-scroller"));
    const line = html.slice(at, html.indexOf("data-label-rail-scroller"));
    expect(text(line)).toContain("Video starts at 2–0 · 15–0, Lee serving");
    expect(tag(line, "data-start-score-edit")).toContain(
      'aria-label="Edit where the video starts"',
    );
    // Read-only: the line alone.
    const readOnly = black(withStart(), null);
    expect(readOnly).toContain("data-start-score-line");
    expect(readOnly).not.toContain("data-start-score-edit");
  });

  test("the line's words: sets lead once one is played, and the receiver can lead the call", () => {
    const { startScoreLine, formatStartScore } = startModule();
    expect(startScoreLine(START, NAMES)).toBe(
      "Video starts at 2–0 · 15–0, Lee serving",
    );
    expect(
      startScoreLine(
        { sets: [1, 0], games: [3, 4], points: [2, 3], server: "p2" },
        NAMES,
      ),
    ).toBe("Video starts at sets 1–0 · 3–4 · 40–30, Vargas serving");
    expect(
      formatStartScore(
        { sets: [0, 0], games: [6, 6], points: [3, 2], server: "p2" },
        "tiebreak",
      ),
    ).toBe("6–6 · 3–2");
  });
});

// ── The console counts from the start ──────────────────────────────────────

test.describe("the console counts from the start", () => {
  test("the first band reads 2–0 and point 1 opens at 15–0", () => {
    expect(bands(black(labelSessionFixture()))[0]).toMatch(/^Set 1 .*0–0 ·/);
    const html = black(withStart());
    expect(bands(html)[0]).toContain("2–0 ·");
    const { operations } = spies();
    const rail = railProps(withStart(), operations);
    expect(rail.startScore).toEqual(START);
    const scores = rail.scores as {
      points: Map<string, { scoreBefore: string | null }>;
      games: { gamesBefore: string }[];
    };
    expect(scores.games[0].gamesBefore).toBe("2–0");
    expect(scores.points.get(P1)?.scoreBefore).toBe("15–0");
  });

  test("tiebreakFolds counts the first set's games from the start", () => {
    // One ordinary game, won by p1: from 6–5 that makes 6–6, so the game
    // after it is the tiebreak.
    const rows: LabelPoint[] = [0, 1, 2, 3].map((i) =>
      labelPoint(`a-${i}`, i, { server: "p1", winner: "p1", gameNumber: 1 }),
    );
    rows.push(
      labelPoint("b-0", 4, { server: "p2", winner: "p2", gameNumber: 2 }),
    );
    expect(tiebreakFolds(rows, true)).toEqual([]);
    const folds = tiebreakFolds(rows, true, null, {
      sets: [0, 0],
      games: [5, 6],
      points: [0, 0],
      server: "p1",
    });
    expect(folds.map((f) => [f.setNumber, f.game.gameNumber])).toEqual([
      [1, 2],
    ]);
  });
});
