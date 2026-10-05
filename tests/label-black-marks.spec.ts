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
  return { points: { [point.id]: pointMarks }, shots, suggestions };
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

function renderWell(point: LabelPoint, marks: LabelMarks | null): string {
  const { BlackShotsWell } = createLoader().load(WELL) as {
    BlackShotsWell: React.ComponentType<WellProps>;
  };
  return renderToStaticMarkup(
    React.createElement(BlackShotsWell, { point, edit: editContext(), marks }),
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

const pencils = (html: string) =>
  html.match(/aria-label="Changed by you"/g)?.length ?? 0;

const AMBER = "bg-[rgba(253,230,138,0.14)]";
const QUIET = "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]";

test.describe("a flag on the point row", () => {
  test("open: amber, its words, and the hover with the fixture's names", () => {
    const point = fixturePoint();
    const html = renderRow(point, marksOf(point, [DISPUTED]));
    const [chip, ...rest] = chips(tail(html));
    expect(rest).toHaveLength(0);
    expect(chip.kind).toBe("flag");
    expect(chip.state).toBe("open");
    expect(chip.text).toBe("Check the ending");
    expect(chip.label).toBe(DISPUTED_HOVER);
    expect(chip.count).toBeNull();
    // The frame's pill: 18px, 10px/500, amber on an amber wash.
    for (const cls of [
      "h-[18px]",
      "rounded-full",
      "text-[10px]",
      "font-medium",
      AMBER,
      "text-[rgba(252,211,77,1)]",
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
    expect(chip.tag).toContain("text-[rgba(255,255,255,0.38)]");
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
    expect(t.indexOf('aria-label="Changed by you"')).toBeGreaterThan(chip.at);
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
    expect(fix.tag).toContain("text-[rgba(255,255,255,0.78)]");
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
      "The vendor called this ball out, but Vargas played the next shot, so it’s stored as in.",
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
      "Marked as hitting the net, but the ball’s height says it cleared it.",
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
    expect(renderRow(point, { points: {}, shots: {}, suggestions: [] })).toBe(
      without,
    );

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
