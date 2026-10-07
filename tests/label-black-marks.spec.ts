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
import type { LabelPoint } from "@/lib/services/labels/session";
import { tag as tagOf } from "./fixtures/html-probe";
import {
  FIXTURE_POINT_IDS,
  labelSessionFixture,
  editContext,
} from "./fixtures/label-session";
import { createLoader } from "./fixtures/vm-modules";

/**
 * The marks on the black rail's rows (T37, board 08m), by tier: the amber
 * chip in the point row's tail for the marks that can change the score, ONE
 * quiet line in the open point for the hints, and nothing anywhere for a
 * hidden mark — no chip on a stroke, no chip for what the site did by
 * itself. Rendered offline through `fixtures/vm-modules`, nothing stubbed.
 * The words and the life-cycle are pinned in `label-marks-copy.spec.ts`;
 * this pins what is DRAWN.
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

// The rail's palette (`label-rail-tone.ts`): its amber wash, and its ink at
// 14% — written so the light ground can re-point both.
const AMBER = "bg-[var(--rail-amber-wash)]";
const QUIET =
  "shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-white)_14%,transparent)]";

test.describe("the chip on the point row", () => {
  test("open: amber, its words, and the hover with the fixture's names", () => {
    const point = fixturePoint();
    const html = renderRow(point, marksOf(point, [DISPUTED]));
    const [chip, ...rest] = chips(tail(html));
    expect(rest).toHaveLength(0);
    expect(chip.state).toBe("open");
    expect(chip.text).toBe("Check the ending");
    // The accessible name is the tooltip's two lines as one.
    expect(chip.label).toBe(`Check the ending. ${DISPUTED_HOVER}`);
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
    // they are not drawn, and the score's own 52px track never moves.
    const row = html.slice(0, html.indexOf(">") + 1);
    expect(row).toContain("@container");
    expect(row).toContain("grid-cols-[22px_30px_minmax(0,1fr)_auto_52px_22px]");
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

  test("a dismissed suggestion's mark reads dismissed", () => {
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

  test("the names are the session's: “Winner or error?” says who", () => {
    const point = fixturePoint();
    const [hint] = hintLine(
      renderWell(
        point,
        marksOf(point, [mark("winner_to_error_by_bounce", { loser: "p1" })]),
      ),
    );
    expect(hint.text).toBe("Winner or error?");
    expect(hint.label).toBe(
      "Winner or error? The ball before this winner landed out. The point may be an error by Lee instead.",
    );
  });

  test("it is the well's first row, on the quiet line a ghost takes, and arrives with the rally", () => {
    const point = fixturePoint();
    const html = renderWell(point, marksOf(point, [mark("serve_fault", {})]));
    // First inside the well's clipped column, before any stroke.
    const column = html.indexOf("overflow-hidden");
    const lineAt = html.indexOf("data-point-hints");
    expect(lineAt).toBeGreaterThan(column);
    expect(lineAt).toBeLessThan(html.indexOf('data-row="shot"'));
    expect(html.slice(column, lineAt)).not.toContain("data-row=");
    const line = tagOf(html, "data-point-hints");
    for (const cls of [
      "h-[26px]",
      "pl-[44px]",
      "pr-[14px]",
      "text-[11px]",
      "whitespace-nowrap",
      "overflow-hidden",
    ]) {
      expect(line, cls).toContain(cls);
    }
    // The rail's ink at an alpha: white on black, the page's ink on white.
    expect(line).toContain(
      "color:color-mix(in oklab, var(--color-white) 45%, transparent)",
    );
    expect(line).not.toContain("rail-amber");
    // The well's own arrival, as its first row: with the rally, not after.
    expect(line).toContain("film-shot-row-in");
    expect(line).toContain("animation-delay:0ms");
    const firstShot = tagOf(html, 'data-row="shot"');
    expect(firstShot).toContain("film-shot-row-in");
    expect(firstShot).not.toContain("animation-delay:0ms");
    // A well that does not animate has a line that does not either.
    const { BlackShotsWell } = createLoader().load(WELL) as {
      BlackShotsWell: React.ComponentType<WellProps & { animate: boolean }>;
    };
    const still = renderToStaticMarkup(
      React.createElement(BlackShotsWell, {
        point,
        edit: editContext(),
        marks: marksOf(point, [mark("serve_fault", {})]),
        animate: false,
      }),
    );
    expect(tagOf(still, "data-point-hints")).not.toContain("film-shot-row-in");
  });

  test("it is not a control: no button, no tab stop, nothing to dismiss", () => {
    const point = fixturePoint();
    const html = renderWell(point, marksOf(point, EVERY_HINT));
    const line = html.slice(
      html.indexOf("data-point-hints"),
      html.indexOf('data-row="shot"'),
    );
    expect(line).not.toContain("<button");
    expect(line).not.toContain("tabindex");
    expect(line).not.toContain("data-cell");
    expect(line).not.toMatch(/Dismiss/);
    expect(hintLine(html).map((h) => h.code)).toEqual(
      EVERY_HINT.map((m) => m.code),
    );
  });

  test("a point with no hints draws no line: counted and hidden marks are not hints", () => {
    const point = fixturePoint();
    const shot = point.shots[0];
    const bare = renderWell(point, marksOf(point, []));
    expect(bare).not.toContain("data-point-hints");
    expect(
      renderWell(
        point,
        marksOf(point, [DISPUTED, ...EVERY_HIDDEN], {
          [shot.id]: HIDDEN_ON_SHOT,
        }),
      ),
    ).toBe(bare);
  });
});

test.describe("a chip's hover is the dark tooltip's two lines", () => {
  type Hover = {
    hover: string;
    name: string;
    detail?: string | readonly string[];
  };
  type MarkModule = {
    pointRowMarks: (
      point: LabelPoint,
      marks: LabelMarks | null,
      names: typeof NAMES,
      sentence?: string,
    ) => { flag: Hover | null; pencil: boolean } | null;
    pointHints: (
      point: LabelPoint,
      marks: LabelMarks | null,
      names: typeof NAMES,
    ) => { code: string; label: string; detail: string }[];
  };
  const load = () => createLoader().load(MARK) as MarkModule;

  test("one mark: its name over its sentence", () => {
    const { pointRowMarks } = load();
    const point = fixturePoint();
    const open = pointRowMarks(point, marksOf(point, [DISPUTED]), NAMES)!.flag!;
    expect(open.name).toBe("Check the ending");
    expect(open.detail).toBe(DISPUTED_HOVER);
    expect(open.hover).toBe(`Check the ending. ${DISPUTED_HOVER}`);
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
    const { pointRowMarks } = load();
    const point = fixturePoint();
    const three = pointRowMarks(
      point,
      marksOf(point, [
        DISPUTED,
        mark("pick_winner", {}),
        mark("reserve_after_in", {}),
      ]),
      NAMES,
    )!.flag!;
    expect(three.name).toBe("3 to check");
    expect(three.detail).toEqual([
      `Check the ending — ${DISPUTED_HOVER}`,
      "Pick the winner — The score, the last shot and the next serve don’t agree on who won. Watch the clip and choose.",
      "Serve replayed — The first serve was in, then another serve followed. Could be a let.",
    ]);
    expect(three.hover.startsWith("3 to check. Check the ending. ")).toBe(true);
  });

  test("with no marks there is nothing to roll up, and no hints", () => {
    const { pointRowMarks, pointHints } = load();
    const point = fixturePoint();
    expect(pointRowMarks(point, null, NAMES)).toBeNull();
    expect(pointHints(point, null, NAMES)).toEqual([]);
    expect(pointHints(point, marksOf(point, [DISPUTED]), NAMES)).toEqual([]);
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
});

test.describe("a stroke row's tail", () => {
  test("holds the pencil alone, and the row's requests end left of it", () => {
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
    const row = tagOf(html, 'data-row="shot"');
    expect(row).toContain('data-selected=""');
    expect(row).toContain("relative");

    // The result is the row's LAST track, inside 14px of padding: its right
    // edge is the row's at every rail width, and its floor is the tail —
    // read off the well's `--shot-tail` — plus the cell's gap. The tail is
    // the frame's width still, so no track moved when the stroke's disc went.
    const { SHOT_TRACKS, SHOT_TAIL_PX, SHOT_TAIL_AIR_PX } = createLoader().load(
      WELL,
    ) as {
      SHOT_TRACKS: string;
      SHOT_TAIL_PX: number;
      SHOT_TAIL_AIR_PX: number;
    };
    expect(SHOT_TAIL_PX).toBe(33);
    expect(row).toContain(SHOT_TRACKS);
    expect(SHOT_TRACKS).toMatch(
      new RegExp(
        `minmax\\(calc\\(var\\(--shot-tail,${SHOT_TAIL_PX}px\\)_\\+_${SHOT_TAIL_AIR_PX}px\\),[\\d.]+fr\\)\\]$`,
      ),
    );
    expect(row).toContain("px-[14px]");

    // The slot is pinned to that edge, the cell's last child, and holds the
    // pencil — and no chip, whatever the marks say of the stroke.
    const cellAt = html.indexOf('data-calculated="result"');
    const actionsAt = html.indexOf("data-shot-actions");
    expect(actionsAt).toBeGreaterThan(cellAt);
    const cell = html.slice(cellAt, actionsAt);
    const resultTag = tagOf(html, 'data-calculated="result"');
    for (const cls of [
      "grid",
      "grid-cols-[minmax(0,1fr)_auto]",
      "min-w-0",
      "overflow-hidden",
    ]) {
      expect(resultTag, cls).toContain(cls);
    }
    const slot = tagOf(cell, "data-shot-marks");
    expect(slot).toContain("justify-self-end");
    expect(slot).toContain("shrink-0");
    expect(chips(html)).toHaveLength(0);
    expect(pencils(cell)).toBe(1);
    // An untouched stroke has no slot at all.
    expect(renderWell(point, marksOf(point, []))).not.toContain(
      "data-shot-marks",
    );

    // The overlay stops 4px short of the slot at its widest: the row's
    // padding, the well's `--shot-tail` and 4px — the same variable the
    // result's floor reads, set once on the well, so the two cannot drift.
    const overlay = tagOf(html, "data-shot-actions");
    expect(overlay).toContain(
      `right-[calc(14px_+_var(--shot-tail,${SHOT_TAIL_PX}px)_+_4px)]`,
    );
    expect(overlay).not.toMatch(/ right-\[\d+px\]/);
    expect(overlay).toContain("absolute");
    expect(overlay).not.toMatch(/\binset-0\b|\binset-x-0\b|\bleft-/);
    const wellTag = tagOf(html, "data-shots-well");
    expect(wellTag).toContain(`--shot-tail:${SHOT_TAIL_PX}px`);

    // Nothing takes the pointer from the pencil or lifts itself over it.
    for (const tag of [slot, resultTag]) {
      expect(tag).not.toContain("pointer-events-none");
    }
    expect(row + cell + overlay).not.toMatch(/\bz-(\d|\[)/);
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

test("the marks use the palette's tokens and the type scale", () => {
  const scale = new Set([8, 9, 10, 11, 12, 13, 14, 16, 28, 30, 40, 56]);
  const source = readFileSync(MARK, "utf8");
  expect(source.match(/#[0-9a-fA-F]{6}\b/g)).toBeNull();
  expect(source).not.toMatch(/rgba?\(/);
  for (const match of source.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) {
    expect(scale.has(Number(match[1])), match[0]).toBe(true);
  }
});
