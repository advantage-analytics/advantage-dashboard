import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  LABEL_MARK_META,
  type LabelMark,
  type LabelMarkCode,
  type LabelMarkParams,
  type LabelMarks,
} from "@/lib/services/labels/marks";
import type { LabelPoint } from "@/lib/services/labels/session";
import {
  FIXTURE_POINT_IDS,
  labelSessionFixture,
  editContext,
} from "./fixtures/label-session";
import { createLoader } from "./fixtures/vm-modules";

/** What the rail's rows DRAW of the marks, by tier: a chip for the counted, one quiet line for hints, nothing for hidden. */

const ROW = "src/components/admin/labels/label-black-point-row.tsx";
const WELL = "src/components/admin/labels/label-black-shot-row.tsx";
const FORMAT = "src/components/admin/labels/label-black-format.ts";

/** The fixture session's two players, as the console's `sideNames` has them. */
const NAMES = { p1: "Lee", p2: "Vargas" };

type RowProps = {
  point: LabelPoint;
  open: boolean;
  playing: boolean;
  score: string | null;
  edit: Record<string, unknown>;
  marks?: LabelMarks | null;
};
type WellProps = {
  point: LabelPoint;
  edit: Record<string, unknown>;
  marks?: LabelMarks | null;
};

function mark<C extends LabelMarkCode>(
  code: C,
  params: LabelMarkParams[C],
): LabelMark {
  const meta = LABEL_MARK_META[code];
  return { code, tier: meta.tier, scope: meta.scope, params } as LabelMark;
}

const DISPUTED = mark("winner_disputed", {
  scoreWinner: "p2",
  lastStrokeWinner: "p1",
});
const DISPUTED_HOVER =
  "The score says Vargas won, but the last shot says Lee did. The ending is wrong more often than the winner.";

/**
 * The fixture's second point — Lee's ace, one kept serve — as it was seeded:
 * unchanged and not yet checked. Each test changes what it is about.
 */
function fixturePoint(fields: Partial<LabelPoint> = {}): LabelPoint {
  const seeded = labelSessionFixture().points.find(
    (p) => p.id === FIXTURE_POINT_IDS.P2,
  )!;
  return { ...seeded, checkedAt: null, note: null, ...fields };
}

function marksOf(
  point: LabelPoint,
  pointMarks: LabelMark[],
  shots: Record<string, LabelMark[]> = {},
  suggestions: LabelMarks["suggestions"] = [],
): LabelMarks {
  return {
    points: { [point.id]: pointMarks },
    shots,
    suggestions,
    serveSides: {},
  };
}

function renderRow(point: LabelPoint, marks: LabelMarks | null): string {
  const { BlackPointRow } = createLoader().load(ROW) as {
    BlackPointRow: React.ComponentType<RowProps>;
  };
  return renderToStaticMarkup(
    React.createElement(BlackPointRow, {
      point,
      open: false,
      playing: false,
      score: "15–0",
      edit: editContext(),
      marks,
    }),
  );
}

function renderWell(
  point: LabelPoint,
  marks: LabelMarks | null,
  edit: Record<string, unknown> = {},
): string {
  const { BlackShotsWell } = createLoader().load(WELL) as {
    BlackShotsWell: React.ComponentType<WellProps>;
  };
  return renderToStaticMarkup(
    React.createElement(BlackShotsWell, {
      point,
      edit: { ...editContext(), ...edit },
      marks,
    }),
  );
}

/** The row's tail slot: everything between the two lines and the score. */
function tail(html: string): string {
  const from = html.indexOf("data-row-tail");
  const to = html.indexOf("data-point-score");
  expect(from, "data-row-tail").toBeGreaterThan(-1);
  expect(to).toBeGreaterThan(from);
  return html.slice(from, to);
}

interface Chip {
  state: string;
  /** The accessible name — the hover line. */
  label: string;
  /** The words drawn, or null for the icon-only form. */
  text: string | null;
  /** The opening tag, for its classes. */
  tag: string;
  /** Where the chip starts in the markup it was read from. */
  at: number;
}

const unescape = (s: string) =>
  s
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");

/** Every chip in a stretch of markup, in order. */
function chips(html: string): Chip[] {
  const starts = [...html.matchAll(/<span[^>]*data-mark-chip=""[^>]*>/g)];
  return starts.map((match, i) => {
    const tag = match[0];
    const at = match.index;
    const body = html.slice(
      at + tag.length,
      i + 1 < starts.length ? starts[i + 1].index : html.length,
    );
    const attr = (name: string) =>
      unescape(new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1] ?? "");
    return {
      state: attr("data-mark-state"),
      label: attr("aria-label"),
      text: /data-mark-text=""[^>]*>([^<]*)</.exec(body)?.[1] ?? null,
      tag,
      at,
    };
  });
}

const pencils = (html: string) => html.match(/data-pencil=""/g)?.length ?? 0;

/** The open point's hint line: each hint's code, words and accessible name. */
function hintLine(
  html: string,
): { code: string; text: string; label: string }[] {
  return [
    ...html.matchAll(/<span[^>]*data-point-hint="([^"]*)"[^>]*>([^<]*)</g),
  ].map((m) => ({
    code: m[1],
    text: unescape(m[2]),
    label: unescape(/aria-label="([^"]*)"/.exec(m[0])?.[1] ?? ""),
  }));
}

/** One mark of every code, on the fixture's point and its one stroke. */
const EVERY_HIDDEN: LabelMark[] = [
  mark("same_player_consecutive", { hitter: "p1" }),
  mark("phantom_strokes_dropped", { eventIds: [41], hitter: "p2" }),
  mark("winner_guessed", {}),
  mark("score_frozen", {}),
];
const HIDDEN_ON_SHOT: LabelMark[] = [
  mark("out_ball_rally_continued", { nextHitter: "p2" }),
  mark("geometry_discarded", {}),
];
const EVERY_HINT: LabelMark[] = [
  mark("ending_suspect_line", {}),
  mark("winner_to_error_by_bounce", { loser: "p1" }),
  mark("serve_fault", {}),
  mark("second_serve_called_out", {}),
  mark("result_type_unknown", {}),
];
const NET_HIT = mark("net_hit_contradicts_height", {});

test.describe("the chip on the point row", () => {
  test("open: its words, and the hover with the fixture's names", () => {
    const point = fixturePoint();
    const html = renderRow(point, marksOf(point, [DISPUTED]));
    const [chip, ...rest] = chips(tail(html));
    expect(rest).toHaveLength(0);
    expect(chip.state).toBe("open");
    expect(chip.text).toBe("Check the ending");
    // The accessible name is the tooltip's two lines as one.
    expect(chip.label).toBe(`Check the ending. ${DISPUTED_HOVER}`);
    expect(chip.tag).toContain('role="img"');
    // Untouched and unchecked: no pencil.
    expect(pencils(html)).toBe(0);
    // The chips sit only in the tail.
    expect(chips(html)).toHaveLength(1);
  });

  test("settled by a change: no words, and one pencil", () => {
    const point = fixturePoint({ status: "edited" });
    const html = renderRow(point, marksOf(point, [DISPUTED]));
    const [chip, ...rest] = chips(tail(html));
    expect(rest).toHaveLength(0);
    expect(chip.state).toBe("settled");
    expect(chip.text).toBeNull();
    const { pointSentence } = createLoader().load(FORMAT) as {
      pointSentence: (point: LabelPoint, names: typeof NAMES) => string;
    };
    expect(chip.label).toBe(
      `Check the ending · settled. You changed the ending to ${pointSentence(point, NAMES)}.`,
    );
    // The roll-up's pencil and the row's own are ONE pencil, after the chip.
    expect(pencils(html)).toBe(1);
    const t = tail(html);
    expect(t.indexOf('data-pencil=""')).toBeGreaterThan(chip.at);
  });

  test("three open marks are one chip that counts them", () => {
    const point = fixturePoint();
    const html = renderRow(
      point,
      marksOf(point, [
        DISPUTED,
        mark("pick_winner", {}),
        mark("reserve_after_in", {}),
      ]),
    );
    const all = chips(tail(html));
    expect(all).toHaveLength(1);
    expect(all[0].state).toBe("open");
    expect(all[0].text).toBe("3 to check");
    expect(all[0].tag).toContain('data-mark-count="3"');
    // The hover is every line the chip stands for.
    expect(all[0].label).toContain(DISPUTED_HOVER);
    expect(all[0].label).toContain("Watch the clip and choose.");
    expect(all[0].label).toContain("Could be a let.");
  });
});

test.describe("a closed row draws only what can change the score", () => {
  test("a hint is no chip on the row, and takes nothing from the count beside it", () => {
    const point = fixturePoint();
    const shot = point.shots[0];
    // Hints alone: the row is the row with no marks at all.
    const hintsOnly = renderRow(
      point,
      marksOf(point, EVERY_HINT, { [shot.id]: [NET_HIT] }),
    );
    expect(chips(hintsOnly)).toHaveLength(0);
    expect(hintsOnly).not.toContain("data-point-hint");
    expect(hintsOnly).toBe(renderRow(point, marksOf(point, [])));

    // Beside a counted mark, the chip is that mark's alone — not "N to check".
    const withCount = renderRow(
      point,
      marksOf(point, [DISPUTED, ...EVERY_HINT], { [shot.id]: [NET_HIT] }),
    );
    const [chip, ...rest] = chips(withCount);
    expect(rest).toHaveLength(0);
    expect(chip.text).toBe("Check the ending");
    expect(chip.label).toBe(`Check the ending. ${DISPUTED_HOVER}`);
    expect(withCount).not.toContain("data-point-hint");
  });

  test("a hidden mark is drawn nowhere: not on the row, not in the well, not on a stroke", () => {
    const point = fixturePoint();
    const shot = point.shots[0];
    const marks = marksOf(point, EVERY_HIDDEN, { [shot.id]: HIDDEN_ON_SHOT });
    const none = marksOf(point, []);
    expect(renderRow(point, marks)).toBe(renderRow(point, none));
    expect(renderWell(point, marks)).toBe(renderWell(point, none));
    for (const html of [renderRow(point, marks), renderWell(point, marks)]) {
      expect(html).not.toContain("data-mark-chip");
      expect(html).not.toContain("data-point-hint");
      for (const words of [
        "Missing shot?",
        "shot removed",
        "Winner guessed",
        "Score not read",
        "Out call ignored",
        "No position",
      ]) {
        expect(html, words).not.toContain(words);
      }
    }
  });
});

test.describe("the open point's quiet line", () => {
  test("lists the point's hints by their labels, each with its sentence — and no chip", () => {
    const point = fixturePoint();
    const shot = point.shots[0];
    const html = renderWell(
      point,
      marksOf(
        point,
        [mark("ending_suspect_line", {}), mark("serve_fault", {})],
        {
          [shot.id]: [NET_HIT],
        },
      ),
    );
    expect(hintLine(html)).toEqual([
      {
        code: "ending_suspect_line",
        text: "Close to the line",
        label:
          "Close to the line. The ball before this winner landed within 1 m of a line. Most like this turn out to be errors.",
      },
      {
        code: "serve_fault",
        text: "Serve fault?",
        label:
          "Serve fault? The first serve was called out and only one or two shots followed, with no second serve. It may be a fault the returner hit anyway.",
      },
      {
        code: "net_hit_contradicts_height",
        text: "Net or out?",
        label:
          "Net or out? Marked as hitting the net, but the ball’s height says it cleared it.",
      },
    ]);
    // One line, with a middle dot between two hints and none at either end.
    expect(html.match(/data-point-hints=""/g)).toHaveLength(1);
    const line = html.slice(
      html.indexOf("data-point-hints"),
      html.indexOf('data-row="shot"'),
    );
    expect(line.match(/aria-hidden="true"[^>]*>·</g)).toHaveLength(2);
    expect(chips(html)).toHaveLength(0);
  });
});

test.describe("a stroke row's tail", () => {
  test("holds the pencil alone: no chip on a stroke", () => {
    const point = fixturePoint();
    const shot = point.shots[0];
    const edited: LabelPoint = {
      ...point,
      shots: [{ ...shot, status: "edited" }],
    };
    const html = renderWell(
      edited,
      marksOf(edited, [], { [shot.id]: HIDDEN_ON_SHOT }),
      { selectedShotId: shot.id },
    );
    // The cell holds the pencil — and no chip, whatever the marks say of
    // the stroke.
    const cell = html.slice(
      html.indexOf('data-calculated="result"'),
      html.indexOf("data-shot-actions"),
    );
    expect(cell).toContain("data-shot-marks");
    expect(chips(html)).toHaveLength(0);
    expect(pencils(cell)).toBe(1);
    // An untouched stroke has no slot at all.
    expect(renderWell(point, marksOf(point, []))).not.toContain(
      "data-shot-marks",
    );
  });
});

test.describe("a session with no marks", () => {
  test("the same rows carry nothing: no chip, no hint line, and the pencil as before", () => {
    const point = fixturePoint();
    const shot = point.shots[0];
    const marks = marksOf(point, [DISPUTED, mark("serve_fault", {})], {
      [shot.id]: [NET_HIT],
    });
    expect(renderRow(point, marks)).toContain("data-mark-chip");
    expect(renderWell(point, marks)).toContain("data-point-hints");

    const without = renderRow(point, null);
    expect(without).not.toContain("data-mark-chip");
    expect(without).not.toContain("data-mark-state");
    expect(without).not.toContain(DISPUTED_HOVER);
    expect(pencils(without)).toBe(0);
    // An empty marks object is the same row.
    expect(
      renderRow(point, {
        points: {},
        shots: {},
        suggestions: [],
        serveSides: {},
      }),
    ).toBe(without);

    const well = renderWell(point, null);
    expect(well).not.toContain("data-mark-chip");
    expect(well).not.toContain("data-point-hint");

    // The fixture's edited first point: its one pencil, marks or none.
    const first = labelSessionFixture().points.find(
      (p) => p.id === FIXTURE_POINT_IDS.P1,
    )!;
    expect(pencils(tail(renderRow(first, null)))).toBe(1);
    expect(pencils(tail(renderRow(first, marksOf(first, [DISPUTED]))))).toBe(1);
  });
});

test.describe("the two hints read off the rows, with their one answer", () => {
  const MARK = "src/components/admin/labels/label-black-mark.tsx";
  type Hint = {
    code: string;
    label: string;
    detail: string;
    action?: { label: string; run: () => void };
  };
  type Hints = (
    point: LabelPoint,
    marks: LabelMarks | null,
    names: typeof NAMES,
    edit?: Record<string, unknown>,
  ) => Hint[];

  /** The ace, stored as Vargas's winner: the rows say otherwise. */
  const stale = () => fixturePoint({ ending: "winner", endedBy: "p2" });

  /** Lee's faulted serve, then a serve typed as a first that went in. */
  const retyped = () => {
    const point = fixturePoint();
    const [ace] = point.shots;
    return {
      ...point,
      shots: [
        { ...ace, id: "s-fault", eventId: 200, result: "net" as const },
        { ...ace, id: "s-second", eventId: 201 },
      ],
    };
  };

  test("drawn on the line with the words and the sentence, and a button after each", () => {
    const html = renderWell(stale(), marksOf(stale(), []));
    expect(hintLine(html)).toEqual([
      {
        code: "ending_stale",
        text: "Ending looks stale",
        label: "Ending looks stale. The strokes say an ace by Lee.",
      },
    ]);
    const button =
      /<button[^>]*data-point-hint-action="ending_stale"[^>]*>([^<]*)</.exec(
        html,
      );
    expect(button?.[1]).toBe("Use it");
    // The rail's pressed state, as every text action in it.
    expect(button?.[0]).toContain("active:scale-[0.96]");
    expect(chips(html)).toHaveLength(0);

    const serves = renderWell(retyped(), marksOf(retyped(), []));
    expect(hintLine(serves).map((h) => [h.code, h.text, h.label])).toEqual([
      [
        "second_serve_as_first",
        "Second serve?",
        "Second serve? Follows a faulted serve, so it is the second serve.",
      ],
    ]);
    expect(serves).toMatch(
      /<button[^>]*data-point-hint-action="second_serve_as_first"[^>]*>Make it a second serve</,
    );
  });

  test("the answers are the point patch and the shot patch, through the console's two writes", () => {
    const { pointHints } = createLoader().load(MARK) as { pointHints: Hints };
    const patched: unknown[][] = [];
    const edit = {
      onPatchPoint: (...args: unknown[]) => patched.push(["point", ...args]),
      onPatchShot: (...args: unknown[]) => patched.push(["shot", ...args]),
    };
    const point = stale();
    const [ending] = pointHints(point, marksOf(point, []), NAMES, edit);
    expect(ending.action?.label).toBe("Use it");
    ending.action?.run();
    // The rows settle the winner too — Lee's ace — so the patch carries it.
    expect(patched).toEqual([
      ["point", point.id, { ending: "ace", ended_by: "p1", winner: "p1" }],
    ]);

    patched.length = 0;
    const [second] = pointHints(retyped(), marksOf(retyped(), []), NAMES, edit);
    second.action?.run();
    expect(patched).toEqual([["shot", "s-second", { stroke: "second_serve" }]]);

    // A last stroke with no result settles no winner: none in the patch.
    patched.length = 0;
    const open = {
      ...point,
      shots: [
        ...point.shots,
        {
          ...point.shots[0],
          id: "s-open",
          eventId: 202,
          hitter: "p2" as const,
          stroke: "backhand" as const,
          result: null,
        },
      ],
      winner: "p1" as const,
    };
    const [hint] = pointHints(open, marksOf(open, []), NAMES, edit);
    hint.action?.run();
    expect(patched).toEqual([
      ["point", point.id, { ending: "error", ended_by: "p2" }],
    ]);
  });

  test("nothing without marks, and no button where the console cannot write", () => {
    expect(renderWell(stale(), null)).not.toContain("data-point-hint");
    expect(renderWell(retyped(), null)).not.toContain("data-point-hint");
    const readOnly = renderWell(stale(), marksOf(stale(), []), {
      editable: false,
    });
    expect(hintLine(readOnly).map((h) => h.code)).toEqual(["ending_stale"]);
    expect(readOnly).not.toContain("data-point-hint-action");
    // The rows in step with the ending: no hint at all.
    expect(
      renderWell(fixturePoint(), marksOf(fixturePoint(), [])),
    ).not.toContain("data-point-hint");
  });
});
