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
import {
  pointEndedEarly,
  reviewFlag,
  type ReviewItem,
} from "@/lib/services/labels/marks-state";
import type { LabelPoint } from "@/lib/services/labels/session";
import {
  FIXTURE_POINT_IDS,
  labelSessionFixture,
  editContext,
  ROW_OPERATIONS,
} from "./fixtures/label-session";
import { tag } from "./fixtures/html-probe";
import { createLoader } from "./fixtures/vm-modules";

/** What the rail's rows DRAW of the marks: one chip for the point's flag, the open point's review block, nothing for hidden. */

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
 * unchanged and not yet checked, with the ace's bounce placed so the line
 * does not ask for it. Each test changes what it is about.
 */
function fixturePoint(fields: Partial<LabelPoint> = {}): LabelPoint {
  const seeded = labelSessionFixture().points.find(
    (p) => p.id === FIXTURE_POINT_IDS.P2,
  )!;
  return {
    ...seeded,
    checkedAt: null,
    note: null,
    shots: seeded.shots.map((s) => ({ ...s, landingX: 0.6, landingY: 17.79 })),
    ...fields,
  };
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

interface ReviewRow {
  id: number;
  /** `open`, `pointer`, `done` or `cleared`. */
  state: string;
  /** The row's words, tags stripped, one space between pieces. */
  text: string;
  /** The row's markup, for its attributes and buttons. */
  html: string;
}

/** The open point's review block, or "" when the well draws none. */
function reviewBlock(html: string): string {
  const from = html.indexOf("data-review-block");
  if (from === -1) return "";
  const to = html.indexOf("data-add-shot", from);
  return html.slice(
    from,
    to === -1 ? undefined : html.lastIndexOf("<button", to),
  );
}

/** The block's rows in order: each item's id, how it is drawn and its words. */
function reviewRows(html: string): ReviewRow[] {
  const block = reviewBlock(html);
  const starts = [
    ...block.matchAll(
      /<div[^>]*data-review-item="(\d)"[^>]*data-review-state="([a-z]+)"[^>]*>/g,
    ),
  ];
  return starts.map((match, i) => {
    const row = block.slice(
      match.index,
      i + 1 < starts.length ? starts[i + 1].index : undefined,
    );
    return {
      id: Number(match[1]),
      state: match[2],
      text: unescape(row.replace(/<[^>]*>/g, " "))
        .replace(/\s+/g, " ")
        .trim(),
      html: row,
    };
  });
}

/** A row's evidence lines, in order. */
const evidence = (row: ReviewRow) =>
  [...row.html.matchAll(/data-review-evidence=""[^>]*>([^<]*)</g)].map((m) =>
    unescape(m[1]),
  );

/** The words of a stretch's buttons carrying `attr`, in order. */
const buttons = (html: string, attr: string) =>
  [
    ...html.matchAll(
      new RegExp(`<button[^>]*${attr}[^>]*>(?:<[^>]*>)*([^<]*)<`, "g"),
    ),
  ].map((m) => unescape(m[1]));

/** One mark of every code, on the fixture's point and its one stroke. */
const EVERY_HIDDEN: LabelMark[] = [
  mark("phantom_strokes_dropped", { eventIds: [41], hitter: "p2" }),
  mark("score_frozen", {}),
  mark("serve_fault", {}),
];
const HIDDEN_ON_SHOT: LabelMark[] = [
  mark("out_ball_rally_continued", { nextHitter: "p2" }),
  mark("geometry_discarded", {}),
];
const EVERY_HINT: LabelMark[] = [
  mark("ending_suspect_line", {}),
  mark("winner_to_error_by_bounce", { loser: "p1" }),
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
    // The chip asks the item the mark sits under, not the mark's own label.
    expect(chip.text).toBe("How did the last ball end?");
    // The accessible name is the tooltip's two lines as one.
    expect(chip.label).toBe(`How did the last ball end? ${DISPUTED_HOVER}`);
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

  test("three open marks on one question are one chip with that question", () => {
    const point = fixturePoint();
    const html = renderRow(
      point,
      marksOf(point, [
        DISPUTED,
        mark("last_call_overruled", { vendorCall: "out", eventId: 201 }),
        mark("last_shot_unresolved", {}),
      ]),
    );
    const all = chips(tail(html));
    expect(all).toHaveLength(1);
    expect(all[0].state).toBe("open");
    // Item 4, asked as the vendor called the last ball.
    expect(all[0].text).toBe("Was the last ball out?");
    // One item: the chip counts items, not marks.
    expect(all[0].tag).toContain('data-mark-count="1"');
    // The hover is the question over every open mark's evidence.
    expect(all[0].label.startsWith("Was the last ball out? ")).toBe(true);
    expect(all[0].label).toContain(DISPUTED_HOVER);
  });

  test("two open items are one chip: Review · 2, a line per item", () => {
    const point = fixturePoint();
    const html = renderRow(
      point,
      marksOf(point, [DISPUTED, mark("pick_winner", {})]),
    );
    const all = chips(tail(html));
    expect(all).toHaveLength(1);
    expect(all[0].state).toBe("open");
    expect(all[0].text).toBe("Review · 2");
    expect(all[0].tag).toContain('data-mark-count="2"');
    expect(all[0].tag).toContain("rail-amber");
    expect(all[0].label).toBe(
      "Review · 2. 4 · How did the last ball end? 5 · Who won?",
    );
  });
});

test.describe("a closed row draws only what can change the score", () => {
  test("hints are the flag's too: a grey chip unless demoted, and one question beside a counted mark", () => {
    const point = fixturePoint();
    const shot = point.shots[0];
    // "No landing on the last shot" alone: a grey, filled chip asking item 4.
    const landing = mark("last_landing_missing", {});
    const greyOnly = renderRow(point, marksOf(point, [landing]));
    const [grey, ...others] = chips(greyOnly);
    expect(others).toHaveLength(0);
    expect(grey.state).toBe("open");
    expect(grey.text).toBe("How did the last ball end?");
    expect(grey.tag).toContain('data-mark-tone="data"');
    expect(grey.tag).toContain("bg-white/[0.10]");
    expect(grey.tag).not.toContain("rail-amber");
    expect(greyOnly).not.toContain("data-point-hint");
    // "Net or out?" alone is a demoted flag: no chip on the closed row, while
    // the open point still asks it.
    const netOnly = marksOf(point, [], { [shot.id]: [NET_HIT] });
    expect(renderRow(point, netOnly)).not.toContain("data-mark-chip");
    // Its block draws the item with its evidence, and no header.
    const demoted = renderWell(point, netOnly);
    expect(reviewBlock(demoted)).toContain('data-review-demoted=""');
    expect(demoted).not.toContain("data-review-header");
    const [asked, ...more] = reviewRows(demoted);
    expect(more).toHaveLength(0);
    expect([asked.id, asked.state]).toEqual([4, "open"]);
    expect(evidence(asked)).toEqual([
      "Marked as hitting the net, but the ball’s height says it cleared it.",
    ]);

    // Beside a counted mark on the same item, the hints are that one question.
    const withCount = renderRow(
      point,
      marksOf(point, [DISPUTED, ...EVERY_HINT], { [shot.id]: [NET_HIT] }),
    );
    const [chip, ...rest] = chips(withCount);
    expect(rest).toHaveLength(0);
    expect(chip.text).toBe("How did the last ball end?");
    expect(chip.tag).toContain('data-mark-count="1"');
    expect(
      chip.label.startsWith(`How did the last ball end? ${DISPUTED_HOVER}`),
    ).toBe(true);
    expect(withCount).not.toContain("data-point-hint");
  });

  test("once checked, the quiet outline is only for a counted mark", () => {
    const point = fixturePoint();
    const shot = point.shots[0];
    const checked = { ...point, checkedAt: "2026-10-12T00:00:00Z" };
    // A hint alone, answered: no chip at all.
    expect(
      renderRow(checked, marksOf(checked, [mark("last_landing_missing", {})])),
    ).not.toContain("data-mark-chip");
    // A flag that would be demoted: none either.
    expect(
      renderRow(checked, marksOf(checked, [], { [shot.id]: [NET_HIT] })),
    ).not.toContain("data-mark-chip");
    // A counted mark settled by a change keeps the quiet outline, no words.
    const settled = { ...checked, status: "edited" as const };
    const [quiet, ...rest] = chips(
      renderRow(settled, marksOf(settled, [DISPUTED])),
    );
    expect(rest).toHaveLength(0);
    expect(quiet.state).toBe("checked");
    expect(quiet.text).toBeNull();
  });

  test("a winner the strokes contradict keeps an amber chip once checked", () => {
    // The ace is the server's; the point says the receiver won it.
    const point = fixturePoint({
      winner: "p2",
      checkedAt: "2026-10-12T00:00:00Z",
    });
    const [chip, ...rest] = chips(renderRow(point, marksOf(point, [])));
    expect(rest).toHaveLength(0);
    expect(chip.state).toBe("open");
    expect(chip.tag).toContain('data-mark-tone="score"');
    expect(chip.tag).toContain("rail-amber");
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
      expect(html).not.toContain("data-review-block");
      for (const words of [
        "shot removed",
        "Score not read",
        "Serve fault?",
        "Out call ignored",
        "No position",
      ]) {
        expect(html, words).not.toContain(words);
      }
    }
  });
});

test.describe("the open point's review block", () => {
  test("replaces the quiet line: a header, then each item with its question and evidence — and no chip", () => {
    const point = fixturePoint();
    const shot = point.shots[0];
    const html = renderWell(
      point,
      marksOf(
        point,
        [mark("ending_suspect_line", {}), mark("serve_fault", {})], // serve_fault is hidden
        {
          [shot.id]: [NET_HIT],
        },
      ),
    );
    expect(html).not.toContain("data-point-hints");
    expect(html.match(/data-review-block=""/g)).toHaveLength(1);
    // Last in the well, under the rally it is about.
    expect(html.indexOf("data-review-block")).toBeGreaterThan(
      html.lastIndexOf('data-row="shot"'),
    );
    const block = reviewBlock(html);
    expect(block).toContain("data-review-header");
    expect(block).toContain("Review · in this order");
    expect(buttons(block, "data-review-looks-right")).toEqual(["Looks right"]);
    const rows = reviewRows(html);
    expect(rows.map((row) => [row.id, row.state])).toEqual([[4, "open"]]);
    expect(rows[0].text.startsWith("4 How did the last ball end?")).toBe(true);
    expect(evidence(rows[0])).toEqual([
      "The ball before this winner landed within 1 m of a line. Most like this turn out to be errors.",
      "Marked as hitting the net, but the ball’s height says it cleared it.",
    ]);
    // Both are hints with a key: the item's Dismiss, and no other answer.
    expect(buttons(rows[0].html, "data-review-answer=")).toEqual([]);
    expect(buttons(rows[0].html, "data-review-dismiss")).toEqual(["Dismiss"]);
    expect(chips(html)).toHaveLength(0);
  });

  test("Dismiss stores every member's key, one call a key; Looks right is the check tick's write", () => {
    const { reviewItemDismiss, reviewLooksRight } = createLoader().load(
      "src/components/admin/labels/label-black-mark.tsx",
    ) as {
      reviewItemDismiss: (
        item: ReviewItem,
        point: { id: string },
        operations: unknown,
      ) => { label: string; run: () => void } | null;
      reviewLooksRight: (
        point: { id: string; checkedAt: string | null },
        operations: unknown,
      ) => { label: string; run: () => void } | null;
    };
    const point = fixturePoint();
    const shot = point.shots[0];
    const marks = marksOf(point, [DISPUTED, mark("ending_suspect_line", {})], {
      [shot.id]: [NET_HIT],
    });
    const [item] = reviewFlag(point, marks, [point])!.items;
    const calls: unknown[][] = [];
    const operations = {
      ...ROW_OPERATIONS,
      onDismissSuggestion: (...args: unknown[]) =>
        calls.push(["dismiss", ...args]),
      onSetChecked: (...args: unknown[]) => calls.push(["checked", ...args]),
    };
    const dismiss = reviewItemDismiss(item, point, operations)!;
    expect(dismiss.label).toBe("Dismiss");
    dismiss.run();
    expect(calls).toEqual([
      ["dismiss", point.id, "hint:winner_disputed"],
      ["dismiss", point.id, "hint:ending_suspect_line"],
      ["dismiss", point.id, "hint:net_hit_contradicts_height"],
    ]);
    // Nothing to write with, nothing offered.
    expect(reviewItemDismiss(item, point, undefined)).toBeNull();

    calls.length = 0;
    const looksRight = reviewLooksRight(point, operations)!;
    expect(looksRight.label).toBe("Looks right");
    looksRight.run();
    expect(calls).toEqual([["checked", point.id, true]]);
    expect(
      reviewLooksRight(
        { ...point, checkedAt: "2026-10-12T00:00:00Z" },
        operations,
      ),
    ).toBeNull();
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
    const resultAt = html.indexOf('data-calculated="result"');
    const nextRow = html.indexOf("data-row=", resultAt);
    const cell = html.slice(resultAt, nextRow === -1 ? undefined : nextRow);
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
  test("the same rows carry nothing: no chip, no review block, and the pencil as before", () => {
    const point = fixturePoint();
    const shot = point.shots[0];
    const marks = marksOf(point, [DISPUTED, mark("serve_fault", {})], {
      [shot.id]: [NET_HIT],
    });
    expect(renderRow(point, marks)).toContain("data-mark-chip");
    expect(renderWell(point, marks)).toContain("data-review-block");

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
    expect(well).not.toContain("data-review-block");

    // The fixture's edited first point: its one pencil, marks or none.
    const first = labelSessionFixture().points.find(
      (p) => p.id === FIXTURE_POINT_IDS.P1,
    )!;
    expect(pencils(tail(renderRow(first, null)))).toBe(1);
    expect(pencils(tail(renderRow(first, marksOf(first, [DISPUTED]))))).toBe(1);
  });
});

test.describe("the hints read off the rows, with their answers", () => {
  const MARK = "src/components/admin/labels/label-black-mark.tsx";
  type Hint = {
    code: string;
    label: string;
    detail: string;
    actions: { label: string; run: () => void }[];
    dismissKey?: string;
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

  test("the ending the strokes add up to is item 4's Then line; a stroke's hint keeps its row under the stroke, and the block points to it", () => {
    const html = renderWell(stale(), marksOf(stale(), []));
    // No row of its own, and never an item of its own.
    expect(html).not.toContain('data-point-hint="ending_stale"');
    const [item, ...more] = reviewRows(html);
    expect(more).toHaveLength(0);
    expect([item.id, item.state]).toEqual([4, "open"]);
    expect(html.indexOf("data-review-block")).toBeGreaterThan(
      html.lastIndexOf('data-row="shot"'),
    );
    expect(tag(item.html, "data-review-then")).toBeTruthy();
    expect(item.text).toContain("Then: an ace by Lee");
    const button = /<button[^>]*data-review-then-action=""[^>]*>([^<]*)</.exec(
      item.html,
    );
    expect(button?.[1]).toBe("Make it an ace");
    // The rail's pressed state, as every text action in it.
    expect(button?.[0]).toContain("active:scale-[0.96]");
    expect(chips(html)).toHaveLength(0);

    // "Second serve?" names its stroke: the row sits right under that serve,
    // with its answer, and the block points to it without a second copy.
    const serves = renderWell(retyped(), marksOf(retyped(), []));
    expect(tag(serves, 'data-point-hint="second_serve_as_first"')).toContain(
      'data-row="suggested-end"',
    );
    expect(
      serves.indexOf('data-point-hint="second_serve_as_first"'),
    ).toBeGreaterThan(serves.indexOf('data-shot-id="s-second"'));
    expect(serves).toMatch(
      /<button[^>]*data-point-hint-action="second_serve_as_first"[^>]*>.*?<span[^>]*>Make it a second serve</,
    );
    const [pointer, ...others] = reviewRows(serves);
    expect(others).toHaveLength(0);
    expect([pointer.id, pointer.state]).toEqual([3, "pointer"]);
    expect(tag(pointer.html, "data-review-item")).toContain(
      'aria-label="3 · Serves — at shot 2"',
    );
    expect(pointer.text).toBe("3 Serves — at shot 2");
    expect(pointer.html).not.toContain("<button");
  });

  test("with no landing on the last ball, its evidence is the vendor's call alone", () => {
    const placed = stale();
    const point = {
      ...placed,
      shots: placed.shots.map((s) => ({
        ...s,
        landingX: null,
        landingY: null,
      })),
    };
    const [ace] = point.shots;
    const marks = marksOf(point, [
      mark("last_call_overruled", { vendorCall: "out", eventId: ace.eventId! }),
    ]);
    const [item] = reviewRows(
      renderWell(point, marks, { onSelectShot: () => {} }),
    );
    expect(item.id).toBe(4);
    const lines = evidence(item);
    expect(lines).toContain(
      "The vendor called the last ball out, and its landing isn’t placed.",
    );
    expect(lines).toContain("Place the last bounce to settle Out, Net or In.");
    expect(lines.some((line) => line.includes("by its landing"))).toBe(false);
  });

  test("item 4 asked as the vendor called the last ball: one answer row, and its Then line", () => {
    const point = stale();
    const [ace] = point.shots;
    const call = mark("last_call_overruled", {
      vendorCall: "out",
      eventId: ace.eventId!,
    });
    const marks = marksOf(point, [call, mark("ending_suspect_line", {})]);
    const html = renderWell(point, marks, { onSelectShot: () => {} });
    // Asked in the block, not under the last ball.
    expect(html).not.toContain('data-point-hint="last_call_overruled"');
    const [item, ...more] = reviewRows(html);
    expect(more).toHaveLength(0);
    expect(item.id).toBe(4);
    expect(item.text.startsWith("4 Was the last ball out?")).toBe(true);
    expect(evidence(item)).toEqual([
      "The last ball is in by its landing, but the vendor called it out. Watch the bounce: if it was out, change the result.",
      "The ball before this winner landed within 1 m of a line. Most like this turn out to be errors.",
      "The shots add up to an ace by Lee, not the ending this point has. Check the clip: change it, or leave it if the shots are what's wrong.",
    ]);
    expect(item.html.match(/data-review-answers=""/g)).toHaveLength(1);
    expect(buttons(item.html, "data-review-answer=")).toEqual([
      "Yes, make it out",
      "It was in",
      "Place the bounce",
    ]);
    expect(buttons(item.html, "data-review-dismiss")).toEqual(["Dismiss"]);
    expect(item.html.match(/data-review-then=""/g)).toHaveLength(1);
    expect(item.text).toContain("Then: an ace by Lee");
    expect(buttons(item.html, "data-review-then-action")).toEqual([
      "Make it an ace",
    ]);

    // The writes: the vendor's call, "in", and the last stroke's landing.
    const { reviewItemAnswers } = createLoader().load(MARK) as {
      reviewItemAnswers: (
        item: ReviewItem,
        point: LabelPoint,
        marks: LabelMarks,
        edit: Record<string, unknown>,
      ) => { label: string; run: () => void }[];
    };
    const calls: unknown[][] = [];
    const edit = {
      onPatchShot: (...args: unknown[]) => calls.push(["shot", ...args]),
      onSelectShot: (...args: unknown[]) => calls.push(["select", ...args]),
    };
    const flagged = reviewFlag(point, marks, [point])!.items[0];
    for (const answer of reviewItemAnswers(flagged, point, marks, edit)) {
      answer.run();
    }
    expect(calls).toEqual([
      ["shot", ace.id, { result: "out" }],
      ["shot", ace.id, { result: "in" }],
      ["select", ace.id, "landing"],
    ]);

    // A call of "in" has no "It was in"; no landing leads with the bounce.
    const outBall = {
      ...point,
      shots: [
        {
          ...ace,
          result: "out" as const,
          seed: { ...ace.seed!, result: "out" as const },
        },
      ],
    };
    const inCall = marksOf(outBall, [
      mark("last_call_overruled", { vendorCall: "in", eventId: ace.eventId! }),
    ]);
    expect(
      reviewItemAnswers(
        reviewFlag(outBall, inCall, [outBall])!.items.find((i) => i.id === 4)!,
        outBall,
        inCall,
        edit,
      ).map((a) => a.label),
    ).toEqual(["Yes, make it in", "Place the bounce"]);
    const unplaced = fixturePoint({
      shots: fixturePoint().shots.map((s) => ({
        ...s,
        landingX: null,
        landingY: null,
      })),
    });
    const landing = marksOf(unplaced, []);
    const [noLanding] = reviewFlag(unplaced, landing, [unplaced])!.items;
    expect(noLanding.id).toBe(4);
    expect(
      reviewItemAnswers(noLanding, unplaced, landing, edit).map((a) => a.label),
    ).toEqual(["Place the bounce"]);
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
    expect(ending.actions.map((a) => a.label)).toEqual(["Make it an ace"]);
    ending.actions[0].run();
    // The rows settle the winner too — Lee's ace — so the patch carries it.
    expect(patched).toEqual([
      ["point", point.id, { ending: "ace", ended_by: "p1", winner: "p1" }],
    ]);

    patched.length = 0;
    const [second] = pointHints(retyped(), marksOf(retyped(), []), NAMES, edit);
    second.actions[0].run();
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
    hint.actions[0].run();
    expect(patched).toEqual([
      ["point", point.id, { ending: "error", ended_by: "p2" }],
    ]);
  });

  test("Was the last ball in? answers with the vendor's call, until the result is changed", () => {
    const { pointHints } = createLoader().load(MARK) as { pointHints: Hints };
    const patched: unknown[][] = [];
    const edit = {
      onPatchShot: (...args: unknown[]) => patched.push(["shot", ...args]),
    };
    const point = fixturePoint();
    const [ace] = point.shots;
    const call = mark("last_call_overruled", {
      vendorCall: "out",
      eventId: ace.eventId!,
    });
    const [hint] = pointHints(point, marksOf(point, [call]), NAMES, edit);
    expect([hint.code, hint.label]).toEqual([
      "last_call_overruled",
      "Was the last ball out?",
    ]);
    expect(hint.actions.map((a) => a.label)).toEqual(["Yes, make it out"]);
    // A question the labeller can answer "no" to, like the rest.
    expect(hint.dismissKey).toBe("hint:last_call_overruled");
    expect(
      pointHints(
        { ...point, dismissed: ["hint:last_call_overruled"] },
        marksOf(point, [call]),
        NAMES,
        edit,
      ).map((h) => h.code),
    ).not.toContain("last_call_overruled");
    hint.actions[0].run();
    expect(patched).toEqual([["shot", ace.id, { result: "out" }]]);

    // A net call reads as one.
    const net = mark("last_call_overruled", {
      vendorCall: "net",
      eventId: ace.eventId!,
    });
    const [netHint] = pointHints(point, marksOf(point, [net]), NAMES, edit);
    expect(netHint.actions.map((a) => a.label)).toEqual(["Yes, make it a net"]);
    expect(netHint.label).toBe("Was the last ball in the net?");

    // Once the labeller changed the result, the chip is settled: no answer.
    const answered = {
      ...point,
      shots: [{ ...ace, result: "out" as const }],
    };
    expect(
      pointHints(answered, marksOf(answered, [call]), NAMES, edit).map(
        (h) => h.code,
      ),
    ).not.toContain("last_call_overruled");

    // Another stroke is now last — the called one deleted, or a stroke after
    // it: nothing is offered, so the call is never written to the wrong ball.
    const after = {
      ...point,
      shots: [ace, { ...ace, id: "s-after", eventId: (ace.eventId ?? 0) + 1 }],
    };
    expect(
      pointHints(after, marksOf(after, [call]), NAMES, edit).map((h) => h.code),
    ).not.toContain("last_call_overruled");
    const deleted = {
      ...point,
      shots: [
        { ...ace, status: "deleted" as const },
        { ...ace, id: "s-before", eventId: (ace.eventId ?? 0) - 1 },
      ],
    };
    expect(
      pointHints(deleted, marksOf(deleted, [call]), NAMES, edit).map(
        (h) => h.code,
      ),
    ).not.toContain("last_call_overruled");
    // A phantom swing after it, with no result, does not hide the answer.
    const phantom = {
      ...point,
      shots: [
        ace,
        {
          ...ace,
          id: "s-phantom",
          eventId: (ace.eventId ?? 0) + 1,
          result: null,
        },
      ],
    };
    expect(
      pointHints(phantom, marksOf(phantom, [call]), NAMES, edit).map(
        (h) => h.code,
      ),
    ).toContain("last_call_overruled");

    // "Net or out?" on that last ball is one question too many beside it —
    // and comes back once the answer is given.
    const netOrOut = mark("net_hit_contradicts_height", {});
    const both = (p: LabelPoint) =>
      pointHints(p, marksOf(p, [call], { [ace.id]: [netOrOut] }), NAMES, edit)
        .map((h) => h.code)
        .filter((c) =>
          ["last_call_overruled", "net_hit_contradicts_height"].includes(c),
        );
    expect(both(point)).toEqual(["last_call_overruled"]);
    expect(both(answered)).toEqual(["net_hit_contradicts_height"]);
  });

  /** Lee's serve in, Vargas's return long, then two swings at the dead ball. */
  const endedEarly = () => {
    const point = fixturePoint();
    const [ace] = point.shots;
    return {
      ...point,
      shots: [
        { ...ace, videoTime: 1 },
        {
          ...ace,
          id: "s-long",
          eventId: 202,
          hitter: "p2" as const,
          stroke: "backhand" as const,
          result: "out" as const,
          videoTime: 2,
        },
        {
          ...ace,
          id: "s-dead-1",
          eventId: 203,
          hitter: "p2" as const,
          stroke: "forehand" as const,
          result: null,
          landingX: null,
          landingY: null,
          videoTime: 3,
        },
      ],
      winner: "p1" as const,
      ending: "error" as const,
      endedBy: "p2" as const,
    };
  };

  /** Lee's serve in, then another serve of his: a let played on. */
  const letPlayed = () => {
    const point = fixturePoint();
    const [ace] = point.shots;
    return {
      ...point,
      shots: [
        { ...ace, videoTime: 1 },
        { ...ace, id: "s-again", eventId: 202, videoTime: 2 },
      ],
    };
  };

  test("“Point ended here” is a suggestion row under the stroke that ended the point; the review block closes the well", () => {
    const point = endedEarly();
    const html = renderWell(point, marksOf(point, []));
    const at = (needle: string) => {
      const i = html.indexOf(needle);
      expect(i, needle).toBeGreaterThan(-1);
      return i;
    };
    const ended = at('data-point-hint="shot_after_point_end"');
    expect(ended).toBeGreaterThan(at('data-shot-id="s-long"'));
    expect(ended).toBeLessThan(at('data-shot-id="s-dead-1"'));
    // "No landing on the last shot" is about the point: item 4 of the block,
    // the well's last row. "Did the point end here?" is item 2, a pointer.
    expect(at('data-review-item="4"')).toBeGreaterThan(
      html.lastIndexOf('data-row="shot"'),
    );
    expect(html.match(/data-review-block=""/g)).toHaveLength(1);
    expect(reviewRows(html).map((row) => [row.id, row.state])).toEqual([
      [2, "pointer"],
      [4, "open"],
    ]);
    expect(reviewRows(html)[0].text).toBe(
      "2 Extra shots / two points in one? — at shot 2",
    );
    expect(tag(html, 'data-row="suggested-end"')).toContain("outline-dashed");
  });

  test("“Point ended here” can be dismissed, and stays gone once it is", () => {
    const calls: unknown[][] = [];
    const point = endedEarly();
    const edit = {
      operations: {
        ...ROW_OPERATIONS,
        onDismissSuggestion: (...args: unknown[]) => calls.push(args),
      },
    };
    const html = renderWell(point, marksOf(point, []), edit);
    expect(tag(html, "data-suggestion-dismiss")).toContain(
      'aria-label="Dismiss: Did the point end here? 1 shot follows"',
    );
    const { pointHints } = createLoader().load(MARK) as { pointHints: Hints };
    const ended = pointHints(point, marksOf(point, []), NAMES).find(
      (h) => h.code === "shot_after_point_end",
    )!;
    expect(ended.dismissKey).toBe("point_ended:s-long");
    // Dismissed: no row, and the point's own hint is untouched.
    const gone = { ...point, dismissed: ["point_ended:s-long"] };
    const after = renderWell(gone, marksOf(gone, []), edit);
    expect(after).not.toContain('data-point-hint="shot_after_point_end"');
    expect(reviewRows(after).map((row) => row.id)).toEqual([4]);
    // Read-only: nothing to dismiss with.
    expect(
      renderWell(point, marksOf(point, []), { editable: false }),
    ).not.toContain("data-suggestion-dismiss");
  });

  test("once a later stroke is settled, the question does not move up to an earlier one", () => {
    const point = endedEarly();
    // A second ball out earlier in the rally: s-early, before s-long.
    const [ace, ...rest] = point.shots;
    const early = {
      ...ace,
      id: "s-early",
      eventId: 150,
      stroke: "forehand" as const,
      result: "out" as const,
      videoTime: 1.5,
    };
    const withEarly = { ...point, shots: [ace, early, ...rest] };
    const asked = (p: LabelPoint) =>
      pointEndedEarly(p, true)?.params.shotId ?? null;
    expect(asked(withEarly)).toBe("s-long");
    // Dismissed at s-long: nothing moves up to s-early.
    expect(
      asked({ ...withEarly, dismissed: ["point_ended:s-long"] }),
    ).toBeNull();
    // Resolved by removing what followed (tombstones after it): the same.
    expect(
      asked({
        ...withEarly,
        shots: withEarly.shots.map((s) =>
          s.id === "s-dead-1" || s.id === "s-dead-2"
            ? {
                ...s,
                status: "deleted" as const,
                statusBeforeDelete: "kept" as const,
              }
            : s,
        ),
      }),
    ).toBeNull();
    // Resolved by correcting s-long's call: edited, so s-early stays quiet.
    expect(
      asked({
        ...withEarly,
        shots: withEarly.shots.map((s) =>
          s.id === "s-long"
            ? { ...s, result: "in" as const, status: "edited" as const }
            : s,
        ),
      }),
    ).toBeNull();
  });

  test("“Point ended here” offers Remove N and Split here; “Serve after a serve in play” Split here — each only with its write", () => {
    const { pointHints } = createLoader().load(MARK) as { pointHints: Hints };
    const calls: unknown[][] = [];
    const edit = {
      onRemoveShotsAfter: (...args: unknown[]) =>
        calls.push(["remove", ...args]),
      operations: {
        ...ROW_OPERATIONS,
        onSplitPoint: (...args: unknown[]) => calls.push(["split", ...args]),
        onDismissSuggestion: (...args: unknown[]) =>
          calls.push(["dismiss", ...args]),
      },
    };
    const point = endedEarly();
    const hints = pointHints(point, marksOf(point, []), NAMES, edit);
    const ended = hints.find((h) => h.code === "shot_after_point_end")!;
    expect(ended.label).toBe("Did the point end here? 1 shot follows");
    expect(ended.actions.map((a) => a.label)).toEqual([
      "Yes, remove 1",
      "Split here",
    ]);
    ended.actions[0].run();
    ended.actions[1].run();
    expect(calls).toEqual([
      ["remove", point.id, "s-long"],
      // Split answers the question for good, then splits.
      ["dismiss", point.id, "point_ended:s-long"],
      ["split", point.id, "s-dead-1"],
    ]);
    // The last swing has no landing: that hint rides beside it, with no answer.
    expect(hints.map((h) => h.code)).toEqual([
      "shot_after_point_end",
      "last_landing_missing",
    ]);
    expect(hints[1].actions).toEqual([]);

    calls.length = 0;
    const let_ = letPlayed();
    const again = pointHints(let_, marksOf(let_, []), NAMES, edit).find(
      (h) => h.code === "serve_after_serve_in",
    )!;
    expect(again.actions.map((a) => a.label)).toEqual(["Split here"]);
    again.actions[0].run();
    expect(calls).toEqual([["split", let_.id, "s-again"]]);

    // Only the writes the console has.
    const removeOnly = pointHints(point, marksOf(point, []), NAMES, {
      onRemoveShotsAfter: edit.onRemoveShotsAfter,
    });
    expect(
      removeOnly
        .find((h) => h.code === "shot_after_point_end")!
        .actions.map((a) => a.label),
    ).toEqual(["Yes, remove 1"]);
    const splitOnly = pointHints(point, marksOf(point, []), NAMES, {
      operations: edit.operations,
    });
    expect(
      splitOnly
        .find((h) => h.code === "shot_after_point_end")!
        .actions.map((a) => a.label),
    ).toEqual(["Split here"]);
    expect(
      pointHints(let_, marksOf(let_, []), NAMES, {}).find(
        (h) => h.code === "serve_after_serve_in",
      )!.actions,
    ).toEqual([]);

    // Drawn: the words with the count, and a button for each answer. The
    // point's own hint leads the well; "Point ended here" follows its stroke.
    const html = renderWell(point, marksOf(point, []), edit);
    expect(evidence(reviewRows(html)[1])).toEqual([
      "Place the last bounce to settle Out, Net or In.",
    ]);
    expect(tag(html, "data-suggestion-text")).toContain(
      "Did the point end here? 1 shot follows",
    );
    // Laid out as the tray lays out its own: Split first, each with its icon.
    const buttons = [
      ...html.matchAll(
        /<button[^>]*data-point-hint-action="([^"]*)"[^>]*aria-label="([^":]*):/g,
      ),
    ].map((m) => [m[1], m[2]]);
    expect(buttons).toEqual([
      ["shot_after_point_end", "Split here"],
      ["shot_after_point_end", "Yes, remove 1"],
    ]);
  });

  test("nothing without marks, and no button where the console cannot write", () => {
    expect(renderWell(stale(), null)).not.toContain("data-point-hint");
    expect(renderWell(retyped(), null)).not.toContain("data-point-hint");
    const readOnly = renderWell(stale(), marksOf(stale(), []), {
      editable: false,
    });
    const [item] = reviewRows(readOnly);
    expect(item.text).toContain("Then: an ace by Lee");
    expect(readOnly).not.toContain("data-point-hint-action");
    expect(readOnly).not.toContain("<button");
    // The rows in step with the ending: no hint at all.
    const inStep = renderWell(fixturePoint(), marksOf(fixturePoint(), []));
    expect(inStep).not.toContain("data-point-hint");
    expect(inStep).not.toContain("data-review-block");
  });
});
