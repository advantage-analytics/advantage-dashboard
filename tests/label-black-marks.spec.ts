import { readFileSync } from "node:fs";

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
import { labelScores } from "@/lib/services/labels/score";
import type { LabelPoint, LabelShot } from "@/lib/services/labels/session";
import {
  FIXTURE_POINT_IDS,
  labelSessionFixture,
} from "./fixtures/label-session";
import { createLoader } from "./fixtures/vm-modules";

/**
 * The marks on the black rail's rows (T37, board 08m): the chip
 * (`label-black-mark.tsx`), the point row's roll-up in its tail and a
 * stroke's own marks after its result — rendered offline through
 * `fixtures/vm-modules`, nothing stubbed. The words and the life-cycle are
 * T35's and pinned in `label-marks-copy.spec.ts`; this pins what is DRAWN.
 */

const MARK = "src/components/admin/labels/label-black-mark.tsx";
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
  return { code, kind: meta.kind, scope: meta.scope, params } as LabelMark;
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

const noop = () => {};
const OPERATIONS = {
  onAskDeleteShot: noop,
  onAskDeletePoint: noop,
  onRestoreShot: noop,
  onRestorePoint: noop,
  onMovePoint: noop,
  onSetChecked: noop,
  onAddShot: noop,
  onAskResetShot: noop,
  onAskResetPoint: noop,
};

function editContext() {
  const session = labelSessionFixture();
  return {
    editable: true,
    names: NAMES,
    selectedShotId: null,
    onPatchPoint: noop,
    onPatchShot: noop,
    operations: OPERATIONS,
    openTombstoneIds: new Set<string>(),
    points: session.points,
    scores: labelScores(session.points, session.adScoring).points,
    playingShotId: null,
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
  kind: string;
  state: string;
  /** The accessible name — the hover line. */
  label: string;
  /** The words drawn, or null for the icon-only form. */
  text: string | null;
  /** The bare count drawn, or null. */
  count: string | null;
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
  const starts = [...html.matchAll(/<span[^>]*data-mark-kind="[^>]*>/g)];
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
      kind: attr("data-mark-kind"),
      state: attr("data-mark-state"),
      label: attr("aria-label"),
      text: /data-mark-text=""[^>]*>([^<]*)</.exec(body)?.[1] ?? null,
      count: /<b[^>]*>(\d+)<\/b>/.exec(body)?.[1] ?? null,
      tag,
      at,
    };
  });
}

/** The opening tag carrying `attr`. */
function tagOf(html: string, attr: string): string {
  const at = html.indexOf(attr);
  expect(at, attr).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf("<", at), html.indexOf(">", at) + 1);
}

const pencils = (html: string) => html.match(/data-pencil=""/g)?.length ?? 0;

// The rail's palette (`label-rail-tone.ts`): its amber wash, and its ink at
// 14% — written so the light ground can re-point both.
const AMBER = "bg-[var(--rail-amber-wash)]";
const QUIET =
  "shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-white)_14%,transparent)]";

test.describe("a flag on the point row", () => {
  test("open: amber, its words, and the hover with the fixture's names", () => {
    const point = fixturePoint();
    const html = renderRow(point, marksOf(point, [DISPUTED]));
    const [chip, ...rest] = chips(tail(html));
    expect(rest).toHaveLength(0);
    expect(chip.kind).toBe("flag");
    expect(chip.state).toBe("open");
    expect(chip.text).toBe("Check the ending");
    // The accessible name is the tooltip's two lines as one.
    expect(chip.label).toBe(`Check the ending. ${DISPUTED_HOVER}`);
    expect(chip.count).toBeNull();
    // The frame's pill: 18px, 10px/500, amber on an amber wash.
    for (const cls of [
      "h-[18px]",
      "rounded-full",
      "text-[10px]",
      "font-medium",
      AMBER,
      "text-[var(--rail-amber)]",
    ]) {
      expect(chip.tag, cls).toContain(cls);
    }
    expect(chip.tag).toContain('role="img"');
    // Untouched and unchecked: no pencil.
    expect(pencils(html)).toBe(0);
    // The chips sit only in the tail.
    expect(chips(html)).toHaveLength(1);
  });

  test("the words give way before the point's two lines do", () => {
    const point = fixturePoint();
    const html = renderRow(point, marksOf(point, [DISPUTED]));
    // The row is the size container the words answer to: under 600px of it
    // they are not drawn, and the score's own 48px track never moves.
    const row = html.slice(0, html.indexOf(">") + 1);
    expect(row).toContain("@container");
    expect(row).toContain(
      "grid-cols-[22px_30px_minmax(0,1fr)_auto_48px_auto_22px]",
    );
    const words = /<span[^>]*data-mark-text=""[^>]*>/.exec(html)![0];
    expect(words).toContain("hidden");
    expect(words).toContain("@min-[600px]:inline");
  });

  test("settled by a change: quiet, no words, and one blue pencil", () => {
    const point = fixturePoint({ status: "edited" });
    const html = renderRow(point, marksOf(point, [DISPUTED]));
    const [chip, ...rest] = chips(tail(html));
    expect(rest).toHaveLength(0);
    expect(chip.state).toBe("settled");
    expect(chip.text).toBeNull();
    expect(chip.count).toBeNull();
    expect(chip.tag).toContain(QUIET);
    expect(chip.tag).toContain("text-white/[0.38]");
    expect(chip.tag).not.toContain(AMBER);
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
    expect(t).toContain("text-[var(--blue)]");
  });

  test("then checked, and checked as it was", () => {
    const changed = fixturePoint({
      status: "edited",
      checkedAt: "2026-10-01T10:00:00Z",
    });
    const checked = renderRow(changed, marksOf(changed, [DISPUTED]));
    expect(chips(tail(checked))[0].state).toBe("checked");
    expect(chips(tail(checked))[0].text).toBeNull();
    expect(pencils(checked)).toBe(1);

    const asIs = fixturePoint({ checkedAt: "2026-10-01T10:00:00Z" });
    const html = renderRow(asIs, marksOf(asIs, [DISPUTED]));
    const [chip] = chips(tail(html));
    expect(chip.state).toBe("checked-as-is");
    expect(chip.text).toBeNull();
    expect(chip.tag).toContain(QUIET);
    expect(chip.label).toBe(
      "Check the ending · checked as is. You confirmed the point without changing it.",
    );
    expect(pencils(html)).toBe(0);
  });

  test("three open flags are one chip that counts them", () => {
    const point = fixturePoint();
    const html = renderRow(
      point,
      marksOf(point, [
        DISPUTED,
        mark("ending_suspect_line", {}),
        mark("second_serve_called_out", {}),
      ]),
    );
    const all = chips(tail(html));
    expect(all).toHaveLength(1);
    expect(all[0].kind).toBe("flag");
    expect(all[0].state).toBe("open");
    expect(all[0].text).toBe("3 to check");
    // The hover is every line the chip stands for.
    expect(all[0].label).toContain(DISPUTED_HOVER);
    expect(all[0].label).toContain("within 1 m of a line");
    expect(all[0].label).toContain("Check whether it was a double fault.");
  });

  test("a dismissed suggestion's flag reads dismissed", () => {
    const point = fixturePoint({ dismissed: ["missing_point"] });
    const html = renderRow(
      point,
      marksOf(point, [mark("service_court_repeat", { side: "ad" })]),
    );
    const [chip] = chips(tail(html));
    expect(chip.state).toBe("dismissed");
    expect(chip.text).toBeNull();
    expect(chip.tag).toContain(QUIET);
    expect(chip.label).toBe("Same side twice · dismissed.");
  });
});

test.describe("a fix on the point row", () => {
  test("beside a flag: the flag keeps its words, the fix folds to its icon", () => {
    const point = fixturePoint();
    const html = renderRow(
      point,
      marksOf(point, [DISPUTED, mark("winner_guessed", {})]),
    );
    const [flag, fix, ...rest] = chips(tail(html));
    expect(rest).toHaveLength(0);
    expect(flag.kind).toBe("flag");
    expect(flag.text).toBe("Check the ending");
    expect(fix.kind).toBe("fix");
    expect(fix.state).toBe("settled");
    expect(fix.text).toBeNull();
    expect(fix.count).toBeNull();
    // Grey, not quiet: the site acted and the point is not checked yet.
    expect(fix.tag).toContain("bg-white/10");
    expect(fix.tag).toContain("text-white/[0.78]");
    expect(fix.tag).toContain("px-1.5");
    expect(fix.label).toContain("That guess is right about 4 times in 5.");
  });

  test("alone it keeps its words; past one of a kind, a bare count", () => {
    const point = fixturePoint();
    const alone = chips(
      tail(renderRow(point, marksOf(point, [mark("winner_guessed", {})]))),
    );
    expect(alone).toHaveLength(1);
    expect(alone[0].text).toBe("Winner guessed");
    expect(alone[0].state).toBe("settled");

    const two = chips(
      tail(
        renderRow(
          point,
          marksOf(point, [
            DISPUTED,
            mark("winner_guessed", {}),
            mark("score_frozen", {}),
          ]),
        ),
      ),
    );
    expect(two.map((c) => c.kind)).toEqual(["flag", "fix"]);
    expect(two[1].text).toBeNull();
    expect(two[1].count).toBe("2");
    expect(tail(renderRow(point, marksOf(point, [DISPUTED])))).not.toContain(
      "<b",
    );
  });

  test("on a checked point it goes quiet: the icon only", () => {
    const point = fixturePoint({ checkedAt: "2026-10-01T10:00:00Z" });
    const [chip] = chips(
      tail(renderRow(point, marksOf(point, [mark("winner_guessed", {})]))),
    );
    expect(chip.kind).toBe("fix");
    expect(chip.state).toBe("checked");
    expect(chip.text).toBeNull();
    expect(chip.tag).toContain(QUIET);
    // The hover still says what the site did.
    expect(chip.label).toContain("the winner comes from the last shot");
  });
});

test.describe("a stroke's own marks", () => {
  const SERVE = "s-ace";
  const IGNORED = mark("out_ball_rally_continued", { nextHitter: "p2" });

  /** The markup of the stroke row for `shotId`. */
  function shotRow(html: string, shotId: string): string {
    const at = html.indexOf(`data-shot-id="${shotId}"`);
    expect(at, shotId).toBeGreaterThan(-1);
    const next = html.indexOf('data-row="shot"', at);
    const add = html.indexOf("data-add-shot", at);
    const ends = [next, add].filter((i) => i > -1);
    return html.slice(
      html.lastIndexOf("<div", at),
      Math.min(html.length, ...ends),
    );
  }

  /** The ace, and a return after it, so there are two rows to tell apart. */
  function twoShots(): LabelPoint {
    const point = fixturePoint();
    const reply: LabelShot = {
      ...point.shots[0],
      id: "s-reply",
      eventId: 202,
      hitter: "p2",
      stroke: "forehand",
      videoTime: 2491.1,
    };
    return { ...point, shots: [...point.shots, reply] };
  }

  test("“Out call ignored” sits in its shot's row, after the result", () => {
    const point = twoShots();
    const marks = marksOf(point, [], { [SERVE]: [IGNORED] });
    const html = renderWell(point, marks);

    const row = shotRow(html, SERVE);
    const result = row.slice(row.indexOf('data-calculated="result"'));
    const [chip, ...rest] = chips(result);
    expect(rest).toHaveLength(0);
    expect(chip.kind).toBe("fix");
    expect(chip.state).toBe("settled");
    // An icon: no words, no count, and an 18px disc at every rail width —
    // the result track has no room for more until the rail passes 640.
    expect(chip.text).toBeNull();
    expect(chip.count).toBeNull();
    expect(chip.tag).toContain("w-[18px]");
    expect(chip.tag).toContain("px-0");
    expect(chip.tag).not.toContain("@min-[600px]");
    expect(chip.tag).not.toContain("data-mark-count");

    // The cell: the word in a column that can go to nothing, the marks in
    // a fixed right-aligned slot, and the cell clips — so the slot never
    // grows the grid and the word truncates before a mark is cut.
    const cell = tagOf(row, 'data-calculated="result"');
    for (const cls of [
      "grid",
      "grid-cols-[minmax(0,1fr)_auto]",
      "min-w-0",
      "overflow-hidden",
    ]) {
      expect(cell, cls).toContain(cls);
    }
    expect(result).toMatch(
      /data-calculated="result"[^>]*><span class="min-w-0 truncate">In<\/span>/,
    );
    const slot = tagOf(result, "data-shot-marks");
    expect(slot).toContain("shrink-0");
    expect(slot).toContain("justify-self-end");
    expect(result.indexOf("data-shot-marks")).toBeLessThan(chip.at);
    expect(chip.label).toBe(
      "Out call ignored. The vendor called this ball out, but Vargas played the next shot, so it’s stored as in.",
    );
    expect(row.slice(0, row.indexOf(">") + 1)).toContain("@container");

    // Nowhere else in the well.
    expect(chips(shotRow(html, "s-reply"))).toHaveLength(0);
    expect(chips(html)).toHaveLength(1);
  });

  test("two or more marks on a stroke collapse to one disc carrying their count", () => {
    const point = twoShots();
    const net = mark("net_hit_contradicts_height", {});
    const html = renderWell(
      point,
      marksOf(point, [], { [SERVE]: [IGNORED, net] }),
    );
    const row = shotRow(html, SERVE);
    const all = chips(row);
    expect(all).toHaveLength(1);
    const [chip] = all;
    // As loud as its loudest member: the open flag.
    expect(chip.kind).toBe("flag");
    expect(chip.state).toBe("open");
    expect(chip.tag).toContain(AMBER);
    expect(chip.tag).toContain("w-[18px]");
    expect(chip.tag).toContain('data-mark-count="2"');
    // The count stands in for the icon; the hover reads both lines.
    expect(chip.count).toBe("2");
    expect(row.slice(chip.at, row.indexOf("</span>", chip.at))).not.toContain(
      "<svg",
    );
    expect(chip.label).toContain("Marked as hitting the net");
    expect(chip.label).toContain("The vendor called this ball out");
    // One slot, the pencil beside it on a changed stroke.
    expect(row.match(/data-shot-marks/g)).toHaveLength(1);
    const edited: LabelPoint = {
      ...point,
      shots: point.shots.map((s) =>
        s.id === SERVE ? { ...s, status: "edited" } : s,
      ),
    };
    const changed = shotRow(
      renderWell(edited, marksOf(edited, [], { [SERVE]: [IGNORED, net] })),
      SERVE,
    );
    const slot = changed.slice(changed.indexOf("data-shot-marks"));
    expect(chips(slot)).toHaveLength(1);
    expect(pencils(slot)).toBe(1);
    // Two fixes: a fix disc, still counted.
    const fixes = chips(
      shotRow(
        renderWell(
          point,
          marksOf(point, [], {
            [SERVE]: [IGNORED, mark("geometry_discarded", {})],
          }),
        ),
        SERVE,
      ),
    );
    expect(fixes).toHaveLength(1);
    expect(fixes[0].kind).toBe("fix");
    expect(fixes[0].count).toBe("2");
  });

  test("it is never raised to the point row; any other shot mark is", () => {
    const point = twoShots();
    const ignoredOnly = renderRow(
      point,
      marksOf(point, [], { [SERVE]: [IGNORED] }),
    );
    expect(ignoredOnly).not.toContain("data-mark-kind");

    const withNet = renderRow(
      point,
      marksOf(point, [], {
        [SERVE]: [IGNORED],
        "s-reply": [mark("net_hit_contradicts_height", {})],
      }),
    );
    const all = chips(tail(withNet));
    expect(all).toHaveLength(1);
    expect(all[0].kind).toBe("flag");
    expect(all[0].text).toBe("Net or out?");
  });

  test("an open flag on a stroke is amber, and settles with its row", () => {
    const point = twoShots();
    const net = mark("net_hit_contradicts_height", {});
    const open = chips(
      renderWell(point, marksOf(point, [], { "s-reply": [net] })),
    );
    expect(open).toHaveLength(1);
    expect(open[0].state).toBe("open");
    expect(open[0].tag).toContain(AMBER);
    expect(open[0].label).toBe(
      "Net or out? Marked as hitting the net, but the ball’s height says it cleared it.",
    );

    const edited: LabelPoint = {
      ...point,
      shots: point.shots.map((s) =>
        s.id === "s-reply" ? { ...s, status: "edited" } : s,
      ),
    };
    const html = renderWell(edited, marksOf(edited, [], { "s-reply": [net] }));
    const [chip] = chips(html);
    expect(chip.state).toBe("settled");
    expect(chip.tag).toContain(QUIET);
    // The stroke's own pencil is still the only one in its row.
    expect(pencils(shotRow(html, "s-reply"))).toBe(1);
  });
});

test.describe("a mark's hover is the dark tooltip's two lines", () => {
  type Hover = {
    hover: string;
    name: string;
    detail?: string | readonly string[];
  };
  type MarkModule = {
    pointRowMarks: (
      point: LabelPoint,
      marks: LabelMarks,
      names: typeof NAMES,
      sentence?: string,
    ) => { flag: Hover | null; fix: Hover | null };
    shotRowMarks: (
      point: LabelPoint,
      shot: LabelShot,
      marks: LabelMarks,
      names: typeof NAMES,
    ) => { name: string; detail: string | null }[];
    collapseShotMarks: (
      marks: readonly { name: string; detail: string | null }[],
    ) => Hover | null;
  };
  const load = () => createLoader().load(MARK) as MarkModule;
  const IGNORED = mark("out_ball_rally_continued", { nextHitter: "p2" });
  const IGNORED_HOVER =
    "The vendor called this ball out, but Vargas played the next shot, so it’s stored as in.";

  test("one mark: its name over its sentence", () => {
    const { pointRowMarks, shotRowMarks } = load();
    const point = fixturePoint();

    const open = pointRowMarks(point, marksOf(point, [DISPUTED]), NAMES)!.flag!;
    expect(open.name).toBe("Check the ending");
    expect(open.detail).toBe(DISPUTED_HOVER);
    expect(open.hover).toBe(`Check the ending. ${DISPUTED_HOVER}`);

    const shot = point.shots[0];
    const [fix] = shotRowMarks(
      point,
      shot,
      marksOf(point, [], { [shot.id]: [IGNORED] }),
      NAMES,
    );
    expect(fix.name).toBe("Out call ignored");
    expect(fix.detail).toBe(IGNORED_HOVER);
  });

  test("a state rides on the name; the sentence is what the labeller did", () => {
    const { pointRowMarks } = load();
    const wrongSide = mark("score_side_mismatch", {
      score: null,
      expected: null,
      actual: null,
    } as LabelMarkParams["score_side_mismatch"]);
    const checked = fixturePoint({ checkedAt: "2026-10-01T10:00:00Z" });
    const asIs = pointRowMarks(
      checked,
      marksOf(checked, [wrongSide]),
      NAMES,
    )!.flag!;
    expect(asIs.name).toBe("Wrong side for the score · checked as is");
    expect(asIs.detail).toBe("You confirmed the point without changing it.");
    expect(asIs.hover).toBe(
      "Wrong side for the score · checked as is. You confirmed the point without changing it.",
    );

    const edited = fixturePoint({ status: "edited" });
    const settled = pointRowMarks(
      edited,
      marksOf(edited, [DISPUTED]),
      NAMES,
      "Lee ace",
    )!.flag!;
    expect(settled.name).toBe("Check the ending · settled");
    expect(settled.detail).toBe("You changed the ending to Lee ace.");

    // Dismissed says everything in its name: no second line.
    const dropped = fixturePoint({ dismissed: ["missing_point"] });
    const dismissed = pointRowMarks(
      dropped,
      marksOf(dropped, [mark("service_court_repeat", { side: "ad" })]),
      NAMES,
    )!.flag!;
    expect(dismissed.name).toBe("Same side twice · dismissed");
    expect(dismissed.detail).toBeUndefined();
    expect(dismissed.hover).toBe("Same side twice · dismissed.");
  });

  test("a chip standing for several names the count, a line per mark", () => {
    const { pointRowMarks, shotRowMarks, collapseShotMarks } = load();
    const point = fixturePoint();
    const three = pointRowMarks(
      point,
      marksOf(point, [
        DISPUTED,
        mark("ending_suspect_line", {}),
        mark("second_serve_called_out", {}),
      ]),
      NAMES,
    )!.flag!;
    expect(three.name).toBe("3 to check");
    expect(three.detail).toEqual([
      `Check the ending — ${DISPUTED_HOVER}`,
      "Close to the line — The ball before this winner landed within 1 m of a line. Most like this turn out to be errors.",
      "Double fault? — The second serve was called out, but one or two shots followed. Check whether it was a double fault.",
    ]);
    expect(three.hover.startsWith("3 to check. Check the ending. ")).toBe(true);

    const shot = point.shots[0];
    const marks = marksOf(point, [], {
      [shot.id]: [IGNORED, mark("net_hit_contradicts_height", {})],
    });
    const disc = collapseShotMarks(shotRowMarks(point, shot, marks, NAMES))!;
    expect(disc.name).toBe("2 marks");
    expect(disc.detail).toEqual([
      `Out call ignored — ${IGNORED_HOVER}`,
      "Net or out? — Marked as hitting the net, but the ball’s height says it cleared it.",
    ]);
  });

  test("the tooltip keeps the name on one line and wraps the sentence under it", () => {
    const inline = ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children);
    const { ChromeTooltip } = createLoader({
      stubs: {
        "@/components/ui/tooltip": {
          Tooltip: inline,
          TooltipTrigger: inline,
          TooltipContent: ({
            className,
            children,
          }: {
            className?: string;
            children?: React.ReactNode;
          }) =>
            React.createElement("div", { "data-tip": "", className }, children),
        },
      },
    }).load("src/components/dashboard/shared/chrome-tooltip.tsx") as {
      ChromeTooltip: React.ComponentType<Record<string, unknown>>;
    };
    const tip = (props: Record<string, unknown>) => {
      const html = renderToStaticMarkup(
        React.createElement(
          ChromeTooltip,
          props,
          React.createElement("i", null),
        ),
      );
      return html.slice(html.indexOf("<div data-tip"));
    };
    const NAME = "flex items-center gap-2.5 whitespace-nowrap";
    const DETAIL =
      "text-[11px] font-normal whitespace-nowrap text-white/[0.64]";
    const WRAPPED =
      "block max-w-[280px] text-[11px] font-normal whitespace-normal text-white/[0.64]";

    // Every other caller: a name, and a detail that runs on one line.
    const plain = tip({ label: "Activity", detail: "2 in progress" });
    expect(plain).toContain(
      `<span class="${NAME}">Activity</span><span class="${DETAIL}">2 in progress</span>`,
    );
    for (const cls of [
      "rounded-[12px]",
      "bg-[var(--ink-900)]",
      "text-[12px]",
      "font-medium",
      "text-white",
      "shadow-[var(--shadow-dropdown)]",
    ]) {
      expect(plain, cls).toContain(cls);
    }

    // A mark: the name as it was, the sentence wrapping inside 280px.
    const mark = tip({ label: "Check the ending", detail: "Why.", wrap: true });
    expect(mark).toContain(
      `<span class="${NAME}">Check the ending</span><span class="${WRAPPED}">Why.</span>`,
    );
    // Several marks: a line each.
    const many = tip({
      label: "2 marks",
      detail: ["One.", "Two."],
      wrap: true,
    });
    expect(many.match(new RegExp("max-w-\\[280px\\]", "g"))).toHaveLength(2);
    expect(many).toContain(`">One.</span><span class="${WRAPPED}">Two.</span>`);

    // A cut text shown whole: with no detail, the label is the sentence.
    const whole = tip({ label: "Down the line", wrap: true });
    expect(whole).toContain(
      '<span class="block max-w-[280px] font-normal whitespace-normal">Down the line</span>',
    );
    expect(whole).not.toContain("text-white/[0.64]");
  });

  test("the pencil names itself, then what a click does — and only as a button", () => {
    const source = readFileSync(MARK, "utf8");
    expect(source).toContain(
      '<ChromeTooltip label="Changed by you" detail="Click to reset" side="top">',
    );
    // The chip passes its two lines apart, and wraps only a sentence.
    expect(source).toContain("label={name}");
    expect(source).toContain("detail={detail}");
    expect(source).toContain("wrap={detail !== undefined}");
    expect(source).toContain("aria-label={hover}");
  });

  test("no raw tooltip is left in the black view", () => {
    for (const file of [
      MARK,
      ROW,
      WELL,
      "src/components/admin/labels/label-black-view.tsx",
      "src/components/admin/labels/label-rail-resize.tsx",
      "src/components/admin/labels/label-point-menu.tsx",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(
        /<Tooltip\b|TooltipContent|TooltipTrigger/,
      );
    }
    // The rail groups its rows under one provider, and draws none itself.
    const rail = readFileSync(
      "src/components/admin/labels/label-black-rail.tsx",
      "utf8",
    );
    expect(rail.match(/<TooltipProvider>/g)).toHaveLength(1);
    expect(rail).not.toMatch(/<Tooltip\b|TooltipContent|TooltipTrigger/);
    expect(rail).toContain('<ChromeTooltip label="Exit full screen"');
  });
});

test.describe("a selected stroke's mark stays in reach", () => {
  test("the row's requests end left of the marks slot, and nothing sits over it", () => {
    const point = fixturePoint();
    const shot = point.shots[0];
    const fix = mark("out_ball_rally_continued", { nextHitter: "p2" });
    const edited: LabelPoint = {
      ...point,
      shots: [{ ...shot, status: "edited" }],
    };
    const html = renderWell(edited, marksOf(edited, [], { [shot.id]: [fix] }), {
      selectedShotId: shot.id,
    });
    const row = tagOf(html, 'data-row="shot"');
    expect(row).toContain('data-selected=""');
    expect(row).toContain("relative");

    // The result is the row's LAST track, inside 14px of padding: its right
    // edge is the row's at every rail width, and its floor is the marks
    // slot — read off the well's `--shot-tail` — plus the cell's gap.
    const { SHOT_TRACKS, SHOT_TAIL_PX, SHOT_TAIL_AIR_PX } = createLoader().load(
      WELL,
    ) as {
      SHOT_TRACKS: string;
      SHOT_TAIL_PX: number;
      SHOT_TAIL_AIR_PX: number;
    };
    expect(row).toContain(SHOT_TRACKS);
    expect(SHOT_TRACKS).toMatch(
      new RegExp(
        `minmax\\(calc\\(var\\(--shot-tail,${SHOT_TAIL_PX}px\\)_\\+_${SHOT_TAIL_AIR_PX}px\\),[\\d.]+fr\\)\\]$`,
      ),
    );
    expect(row).toContain("px-[14px]");

    // The slot is pinned to that edge, the cell's last child, and holds the
    // disc and the pencil — both drawn on the selected row.
    const cellAt = html.indexOf('data-calculated="result"');
    const actionsAt = html.indexOf("data-shot-actions");
    expect(actionsAt).toBeGreaterThan(cellAt);
    const cell = html.slice(cellAt, actionsAt);
    const resultTag = tagOf(html, 'data-calculated="result"');
    const slot = tagOf(cell, "data-shot-marks");
    expect(slot).toContain("justify-self-end");
    expect(slot).toContain("shrink-0");
    const [chip] = chips(cell);
    expect(chip.kind).toBe("fix");
    expect(pencils(cell)).toBe(1);

    // The overlay stops 4px short of the slot at its widest: the row's
    // padding, the well's `--shot-tail` (the disc, the gap and the pencil)
    // and 4px — the same variable the result's floor reads, set once on the
    // well, so the two cannot drift apart.
    const overlay = tagOf(html, "data-shot-actions");
    expect(overlay).toContain(
      `right-[calc(14px_+_var(--shot-tail,${SHOT_TAIL_PX}px)_+_4px)]`,
    );
    expect(overlay).not.toMatch(/ right-\[\d+px\]/);
    expect(overlay).toContain("absolute");
    expect(overlay).not.toMatch(/\binset-0\b|\binset-x-0\b|\bleft-/);
    const wellTag = tagOf(html, "data-shots-well");
    expect(wellTag).toContain(`--shot-tail:${SHOT_TAIL_PX}px`);
    // The slot fits the cell at its floor, gap included.
    const gap = Number(/ gap-\[(\d+)px\]/.exec(resultTag)![1]);
    expect(SHOT_TAIL_PX + gap).toBeLessThanOrEqual(
      SHOT_TAIL_PX + SHOT_TAIL_AIR_PX,
    );

    // Nothing takes the pointer from the chip or lifts itself over it.
    for (const tag of [slot, chip.tag, resultTag]) {
      expect(tag).not.toContain("pointer-events-none");
    }
    expect(row + cell + overlay).not.toMatch(/\bz-(\d|\[)/);
  });
});

test.describe("a session with no marks", () => {
  test("the same rows carry nothing: no chip, and the pencil as before", () => {
    const point = fixturePoint();
    const withMarks = renderRow(
      point,
      marksOf(point, [DISPUTED], {
        "s-ace": [mark("geometry_discarded", {})],
      }),
    );
    expect(withMarks).toContain("data-mark-kind");
    const without = renderRow(point, null);
    expect(without).not.toContain("data-mark-kind");
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

    expect(renderWell(point, null)).not.toContain("data-mark-kind");

    // The fixture's edited first point: its one pencil, marks or none.
    const first = labelSessionFixture().points.find(
      (p) => p.id === FIXTURE_POINT_IDS.P1,
    )!;
    expect(pencils(tail(renderRow(first, null)))).toBe(1);
    expect(pencils(tail(renderRow(first, marksOf(first, [DISPUTED]))))).toBe(1);
  });
});

test("the marks use the palette's tokens and the type scale", () => {
  const scale = new Set([8, 9, 10, 11, 12, 13, 14, 16, 28, 30, 40, 56]);
  const source = readFileSync(MARK, "utf8");
  expect(source.match(/#[0-9a-fA-F]{6}\b/g)).toBeNull();
  for (const match of source.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) {
    expect(scale.has(Number(match[1])), match[0]).toBe(true);
  }
  // The frame's icons, and the DS dark tooltip as every chip's hover.
  for (const name of ["Flag", "WandSparkles", "Pencil", "ChromeTooltip"]) {
    expect(source).toContain(name);
  }
});
