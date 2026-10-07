import { readdirSync, readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  RAIL_DEFAULT_PX,
  RAIL_MAX_PX,
  RAIL_MIN_PX,
} from "@/components/admin/labels/label-layout";
import { labelScores } from "@/lib/services/labels/score";
import type {
  LabelPoint,
  LabelSession,
  LabelShot,
} from "@/lib/services/labels/session";
import {
  FIXTURE_POINT_IDS,
  labelSessionFixture,
} from "./fixtures/label-session";
import { createLoader, renderFunction } from "./fixtures/vm-modules";

/**
 * The black full-screen view's rows (T30): the two lines a point reads as
 * (`label-black-format.ts`), and the row and game band that draw them
 * (`label-black-point-row.tsx`) — rendered offline through
 * `fixtures/vm-modules`, nothing stubbed.
 */

type Names = { p1: string; p2: string };

const FORMAT = "src/components/admin/labels/label-black-format.ts";
const ROW = "src/components/admin/labels/label-black-point-row.tsx";
const BAND = "src/components/admin/labels/label-game-band.tsx";
const MENU_SELECT = "src/components/ui/menu-select.tsx";

function format() {
  return createLoader().load(FORMAT) as {
    pointSentence: (point: LabelPoint, names: Names) => string;
    pointDetail: (point: LabelPoint) => string;
    formatClockTime: (seconds: number) => string;
  };
}

/** The frame's two players. */
const FRAME: Names = { p1: "Ace", p2: "Goodman" };
/** The fixture session's. */
const NAMES: Names = { p1: "Lee", p2: "Vargas" };

function shot(id: string, fields: Partial<LabelShot>): LabelShot {
  return {
    id,
    labelPointId: "p",
    eventId: null,
    afterEventId: null,
    status: "kept",
    statusBeforeDelete: null,
    deleteReason: null,
    hitter: "p1",
    stroke: null,
    result: null,
    spin: null,
    contactX: null,
    contactY: null,
    landingX: null,
    landingY: null,
    videoTime: null,
    siteRemoval: null,
    siteRemovalRestoredAt: null,
    seed: null,
    ...fields,
  };
}

function point(fields: Partial<LabelPoint>): LabelPoint {
  return {
    id: "p",
    pointIndex: 0,
    vendorRallyIds: [],
    setNumber: 1,
    gameNumber: 1,
    server: "p1",
    serveSide: "deuce",
    winner: null,
    ending: null,
    endedBy: null,
    gameType: "game",
    status: "unchanged",
    statusBeforeDelete: null,
    checkedAt: null,
    note: null,
    dismissed: [],
    seed: null,
    shots: [],
    ...fields,
  };
}

test.describe("the two lines", () => {
  test("an error: the last stroke, who made it, and the deciding shot", () => {
    const { pointSentence, pointDetail } = format();
    const error = point({
      pointIndex: 16,
      winner: "p1",
      ending: "error",
      endedBy: "p2",
      shots: [
        shot("a", {
          stroke: "first_serve",
          spin: "flat",
          landingX: 0.4,
          contactX: -0.6,
          videoTime: 765.4,
        }),
        shot("b", { hitter: "p2", stroke: "backhand", videoTime: 766.2 }),
        // A tombstone is not the rally's last stroke, and is not counted.
        shot("x", {
          stroke: "overhead",
          status: "deleted",
          statusBeforeDelete: "kept",
          videoTime: 766.9,
        }),
        shot("c", {
          hitter: "p2",
          stroke: "forehand",
          spin: "flat",
          contactX: 2.4,
          landingX: 3.1,
          videoTime: 767.8,
        }),
      ],
    });
    expect(pointSentence(error, FRAME)).toBe("Forehand error by Goodman");
    expect(pointDetail(error)).toBe(
      "Flat Down the Line · 12:45 · 3 shot rally",
    );
  });

  test("a winner", () => {
    const { pointSentence, pointDetail } = format();
    const winner = point({
      pointIndex: 18,
      winner: "p1",
      ending: "winner",
      endedBy: "p1",
      server: "p2",
      shots: [
        shot("a", { hitter: "p2", stroke: "first_serve", videoTime: 917 }),
        shot("b", {
          stroke: "forehand",
          spin: "topspin",
          contactX: 2.0,
          landingX: -3.0,
          videoTime: 918.1,
        }),
      ],
    });
    expect(pointSentence(winner, FRAME)).toBe("Forehand winner by Ace");
    expect(pointDetail(winner)).toBe(
      "Topspin Crosscourt · 15:17 · 2 shot rally",
    );
    // Nobody named, no stroke named: the sentence still reads.
    expect(
      pointSentence(point({ ending: "winner", endedBy: null }), FRAME),
    ).toBe("Winner");
  });

  test("a double fault names the second serve, and is a serve only", () => {
    const { pointSentence, pointDetail } = format();
    const doubleFault = point({
      pointIndex: 24,
      winner: "p2",
      ending: "double_fault",
      endedBy: "p1",
      shots: [
        shot("a", {
          stroke: "first_serve",
          spin: "flat",
          result: "out",
          landingX: 3.4,
          videoTime: 1150.2,
        }),
        shot("b", {
          stroke: "second_serve",
          spin: "topspin",
          result: "net",
          landingX: 0.5,
          videoTime: 1161,
        }),
      ],
    });
    expect(pointSentence(doubleFault, FRAME)).toBe("Double fault by Ace");
    // A serve's topspin is a Kick, and the serve is named before its box.
    expect(pointDetail(doubleFault)).toBe(
      "Kick Second Serve T · 19:10 · serve only",
    );
  });

  test("a serve-only point, and the endings with no stroke in them", () => {
    const { pointSentence, pointDetail } = format();
    const ace = point({
      ending: "ace",
      endedBy: "p1",
      winner: "p1",
      shots: [
        shot("a", {
          stroke: "first_serve",
          spin: "sidespin",
          landingX: 3.9,
          videoTime: 3723.6,
        }),
      ],
    });
    expect(pointSentence(ace, FRAME)).toBe("Ace by Ace");
    expect(pointDetail(ace)).toBe(
      "Slice First Serve Wide · 1:02:03 · serve only",
    );

    // The server stands in when nobody is named as ending it.
    expect(
      pointSentence(
        point({ ending: "service_winner", endedBy: null, server: "p2" }),
        FRAME,
      ),
    ).toBe("Service winner by Goodman");
    expect(pointSentence(point({ ending: "let_replayed" }), FRAME)).toBe(
      "Let, replayed",
    );
    expect(pointSentence(point({ ending: "not_a_point" }), FRAME)).toBe(
      "Not a point",
    );
    // Not labelled yet: the point's number. No stroke: nothing but the rally.
    const blank = point({ pointIndex: 41 });
    expect(pointSentence(blank, FRAME)).toBe("Point 42");
    expect(pointDetail(blank)).toBe("serve only");
    // One stroke that is not a serve is a rally of one, not a serve.
    expect(
      pointDetail(
        point({ shots: [shot("a", { stroke: "backhand", videoTime: 5 })] }),
      ),
    ).toBe("0:05 · 1 shot rally");
  });

  test("the clock: whole seconds, the hour only past it", () => {
    const { formatClockTime } = format();
    expect(formatClockTime(765)).toBe("12:45");
    expect(formatClockTime(765.9)).toBe("12:45");
    expect(formatClockTime(62)).toBe("1:02");
    expect(formatClockTime(0)).toBe("0:00");
    expect(formatClockTime(-3)).toBe("0:00");
    expect(formatClockTime(3723.4)).toBe("1:02:03");
  });
});

// ── The row and the band ───────────────────────────────────────────────────

type RowProps = {
  point: LabelPoint;
  open: boolean;
  playing: boolean;
  playingWindow?: { start: number; end: number } | null;
  score: string | null;
  edit: Record<string, unknown>;
  onToggle?: (pointId: string) => void;
  children?: React.ReactNode;
};

type BandProps = {
  band: unknown;
  points: readonly LabelPoint[];
  names: Names;
  onSetGameType?: (...args: unknown[]) => void;
  onSetGameServer?: (...args: unknown[]) => void;
  tone?: "light" | "dark";
};

function components() {
  return createLoader().load(ROW) as {
    BlackPointRow: React.ComponentType<RowProps>;
    pointChangedByYou: (point: LabelPoint) => boolean;
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

function editContext(session: LabelSession, editable = true) {
  return {
    editable,
    names: NAMES,
    selectedShotId: null,
    onPatchPoint: noop,
    onPatchShot: noop,
    operations: editable ? OPERATIONS : undefined,
    points: session.points,
    scores: labelScores(session.points, session.adScoring).points,
  };
}

function renderRow(
  pointId: string,
  props: Partial<RowProps> = {},
  editable = true,
): string {
  const session = labelSessionFixture();
  const { BlackPointRow } = components();
  const edit = editContext(session, editable);
  const row = session.points.find((p) => p.id === pointId)!;
  return renderToStaticMarkup(
    React.createElement(BlackPointRow, {
      point: row,
      open: false,
      playing: false,
      score: edit.scores.get(pointId)?.scoreBefore ?? null,
      edit,
      ...props,
    }),
  );
}

function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** The opening tag carrying `attr`. */
function tag(html: string, attr: string): string {
  const at = html.indexOf(attr);
  expect(at, attr).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf("<", at), html.indexOf(">", at) + 1);
}

/** The inner text of the element carrying `attr`. */
function inner(html: string, attr: string): string {
  const at = html.indexOf(attr);
  expect(at, attr).toBeGreaterThan(-1);
  const start = html.indexOf(">", at) + 1;
  return html.slice(start, html.indexOf("<", start));
}

test.describe("the black point row", () => {
  test("the fixture's edited point: its two lines, its tracks, and the pencil", () => {
    const html = renderRow(FIXTURE_POINT_IDS.P1);
    const row = tag(html, 'data-row="point"');
    expect(row).toContain(`data-point-id="${FIXTURE_POINT_IDS.P1}"`);
    expect(row).not.toContain("data-playing");
    // The frame's grid: the actions take no track (they are an overlay).
    expect(row).toContain("grid-cols-[22px_30px_minmax(0,1fr)_auto_52px_22px]");
    for (const cls of ["gap-x-[10px]", "min-h-[52px]", "px-[14px]", "py-1.5"]) {
      expect(row).toContain(cls);
    }

    // Lee's error on the added forehand (no spin recorded), three strokes
    // from the serve at 41:12 — the tombstone between them not counted.
    expect(inner(html, "data-point-sentence")).toBe("Forehand error by Lee");
    expect(inner(html, "data-point-detail")).toBe(
      "Crosscourt · 41:12 · 3 shot rally",
    );
    expect(tag(html, "data-point-detail")).toContain(
      "color:color-mix(in oklab, var(--color-white) 45%, transparent)",
    );

    // Won by Vargas: the other player's wash, not the blue.
    expect(tag(html, "data-winner-mark")).toContain('data-winner-mark="p2"');
    expect(tag(html, "data-winner-mark")).toContain("bg-white/[0.14]");
    expect(html).toContain('aria-label="Point 1 won by Vargas"');

    // Edited — and a stroke of it edited, added and deleted: the pencil,
    // in the tail slot. The point has a seed, so the pencil is its Reset
    // too: a button named for that, the glyph the same blue.
    const tail = html.slice(
      html.indexOf("data-row-tail"),
      html.indexOf("data-point-score"),
    );
    const pencil = tag(tail, "data-reset-pencil");
    expect(pencil).toMatch(/^<button/);
    expect(pencil).toContain('aria-label="Reset point 1"');
    expect(pencil).toContain("data-pencil");
    expect(pencil).toContain("data-cell");
    expect(tail).toContain("text-[var(--blue)]");
    expect(tail).not.toContain('aria-label="Changed by you"');

    // The score before it, mono and right-aligned.
    expect(inner(html, "data-point-score")).toBe("0–0");
    expect(tag(html, "data-point-score")).toContain("text-right");

    // Not checked: the tick is there, unpressed and quiet.
    const tick = tag(html, "data-check-row");
    expect(tick).toContain('aria-pressed="false"');
    expect(tick).toContain('aria-label="Point 1 checked"');
    expect(tick).toContain("text-white/[0.22]");
    expect(tick).not.toContain("--success");

    // Folded: no strokes under it.
    expect(html).not.toContain("data-shots-for");
  });

  test("the actions sit between the score and the tick, hidden until reached", () => {
    const html = renderRow(FIXTURE_POINT_IDS.P1);
    const score = html.indexOf("data-point-score");
    const actions = html.indexOf('data-row-actions=""');
    const tick = html.indexOf("data-check-row");
    expect(score).toBeLessThan(actions);
    expect(actions).toBeLessThan(tick);

    // The Video tab's reveal (`film-row-reveal.ts`): an overlay over the
    // score's right end that fades in, never a track that changes width.
    const group = tag(html, 'data-row-actions=""');
    for (const cls of [
      "absolute",
      "inset-y-0",
      "right-[46px]",
      "transition-opacity",
      "duration-200",
      "opacity-0",
      "group-hover/row:opacity-100",
      "group-focus-within/row:opacity-100",
      "has-[[aria-expanded=true]]:opacity-100",
    ]) {
      expect(group, cls).toContain(cls);
    }
    expect(group).not.toMatch(/\bw-0\b|w-auto/);

    // The point's ⋯ menu alone, on the dark tone: no note control.
    const inGroup = html.slice(actions, tick);
    expect(inGroup).toContain('aria-label="Point 1 actions"');
    expect(html).not.toContain("data-note-action");
    expect(tag(html, "data-point-menu")).toContain("text-white/55");
    expect(tag(html, "data-point-menu")).not.toContain("--ink-");

    // The number stays put: no grip takes its place, and it never fades.
    expect(html).not.toContain("data-row-handle");
    const numberTag = tag(html, "data-point-number");
    expect(numberTag).not.toContain("opacity-0");
    expect(inner(html, "data-point-number")).toBe("1");
  });

  test("a checked, untouched point: the tick is pressed and green, no pencil", () => {
    const html = renderRow(FIXTURE_POINT_IDS.P2);
    expect(inner(html, "data-point-sentence")).toBe("Ace by Lee");
    expect(inner(html, "data-point-detail")).toBe(
      "Flat First Serve · 41:30 · serve only",
    );
    const tick = tag(html, "data-check-row");
    expect(tick).toContain('aria-pressed="true"');
    expect(tick).toContain('aria-label="Point 2 checked"');
    expect(tick).toContain("text-[var(--success)]");
    // Kept as seeded: nothing changed by the labeller.
    expect(html).toContain("data-row-tail");
    expect(html).not.toContain("data-pencil");
    // Won by Lee: p1's blue mark.
    expect(tag(html, "data-winner-mark")).toContain("bg-[var(--blue)]");
    // It has a note stored; the row draws no control for it.
    expect(html).not.toContain("data-note-action");
  });

  test("a playing point: marked, its actions shown, the rule drawn", () => {
    const html = renderRow(FIXTURE_POINT_IDS.P4, {
      playing: true,
      open: true,
      playingWindow: { start: 2500, end: 2512 },
      children: React.createElement("i", { "data-strokes": "" }),
    });
    const row = tag(html, 'data-row="point"');
    expect(row).toContain('data-playing="true"');
    expect(row).toContain("bg-white/[0.08]");
    // Nothing labelled on it yet. Its strokes are untimed, and without the
    // session's marks its ghost is a stroke like any other (the second
    // serve still decides, and the rally still counts from it).
    expect(inner(html, "data-point-sentence")).toBe("Point 4");
    expect(inner(html, "data-point-detail")).toBe("Second Serve · serve only");

    const group = tag(html, 'data-row-actions=""');
    expect(group).toContain("opacity-100");
    expect(group).not.toContain("opacity-0");
    // The playing row holds the reveal: the score stays aside for it.
    expect(tag(html, "data-point-score")).toMatch(/ -translate-x-\[26px\]/);
    expect(tag(html, "data-point-score")).not.toContain("group-hover/row");
    expect(html).not.toContain("data-row-handle");
    expect(inner(html, "data-point-number")).toBe("4");
    expect(tag(html, "data-check-row")).toContain("text-white/50");

    const rule = tag(html, "data-playing-rule");
    expect(rule).toContain("h-0.5 bg-[var(--blue)]");
    expect(rule).toContain("var(--film-t, 0) - 2500");
    expect(rule).toContain("/ 12 * 100%");

    // Open: its strokes are handed in under it.
    expect(html).toContain(`data-shots-for="${FIXTURE_POINT_IDS.P4}"`);
    expect(html).toContain("data-strokes");
    // The two lines are the row's control — go to the point — not a fold.
    expect(tag(html, "data-point-go")).not.toContain("aria-expanded");
    // A playing row with no window is marked, with no rule.
    expect(renderRow(FIXTURE_POINT_IDS.P4, { playing: true })).not.toContain(
      "data-playing-rule",
    );
  });

  test("read-only: the mark alone, no menu, a tick that cannot be pressed", () => {
    const html = renderRow(FIXTURE_POINT_IDS.P1, {}, false);
    expect(html).toContain('role="img" aria-label="Point 1 won by Vargas"');
    expect(html).not.toContain("data-point-menu");
    expect(html).not.toContain("data-note-action");
    expect(tag(html, "data-check-row")).toContain("disabled");
  });

  test("the pencil asks to reset the point, and does not toggle the row", () => {
    const session = labelSessionFixture();
    const { BlackPointRow } = components();
    const asked: unknown[][] = [];
    const edit = {
      ...editContext(session),
      operations: {
        ...OPERATIONS,
        onAskResetPoint: (...args: unknown[]) => asked.push(["reset", ...args]),
      },
    };
    // The row as elements: the pencil is `PencilMark`'s, so that component
    // is entered on the way down; nothing else is called.
    const find = (
      node: React.ReactNode,
      attr: string,
    ): React.ReactElement<Record<string, unknown>> | null => {
      if (Array.isArray(node)) {
        for (const child of node) {
          const hit = find(child, attr);
          if (hit) return hit;
        }
        return null;
      }
      if (!React.isValidElement(node)) return null;
      const el = node as React.ReactElement<Record<string, unknown>>;
      if (attr in el.props) return el;
      if (typeof el.type === "function" && el.type.name === "PencilMark") {
        return find(
          (el.type as (p: unknown) => React.ReactNode)(el.props),
          attr,
        );
      }
      return find(el.props.children as React.ReactNode, attr);
    };
    const first = session.points.find((p) => p.id === FIXTURE_POINT_IDS.P1)!;
    const tree = renderFunction<unknown>(BlackPointRow)({
      point: first,
      open: false,
      playing: false,
      score: null,
      edit,
    });
    const pencil = find(tree, "data-reset-pencil");
    expect(pencil).not.toBeNull();
    expect(pencil!.props["aria-label"]).toBe("Reset point 1");
    (pencil!.props.onClick as (e: unknown) => void)({
      stopPropagation: () => asked.push(["stopped"]),
    });
    expect(asked).toEqual([["stopped"], ["reset", FIXTURE_POINT_IDS.P1]]);

    // Without a seed, or read-only: the pencil is the plain indicator.
    const unseeded = renderToStaticMarkup(
      React.createElement(BlackPointRow, {
        point: { ...first, seed: null },
        open: false,
        playing: false,
        score: null,
        edit: editContext(session),
      }),
    );
    expect(unseeded).toContain('aria-label="Changed by you"');
    expect(unseeded).not.toContain("data-reset-pencil");
    const frozen = renderRow(FIXTURE_POINT_IDS.P1, {}, false);
    expect(frozen).toContain('aria-label="Changed by you"');
    expect(frozen).not.toContain("data-reset-pencil");
  });

  test("what counts as changed by you", () => {
    const { pointChangedByYou } = components();
    expect(pointChangedByYou(point({}))).toBe(false);
    expect(pointChangedByYou(point({ status: "edited" }))).toBe(true);
    expect(pointChangedByYou(point({ status: "added" }))).toBe(true);
    for (const status of ["edited", "added", "deleted"] as const) {
      expect(
        pointChangedByYou(point({ shots: [shot("a", { status })] })),
        status,
      ).toBe(true);
    }
    expect(pointChangedByYou(point({ shots: [shot("a", {})] }))).toBe(false);
  });
});

test.describe("the black game band", () => {
  function renderBand(editable: boolean, index = 0): string {
    const session = labelSessionFixture();
    const { LabelGameBand } = createLoader().load(BAND) as {
      LabelGameBand: React.ComponentType<BandProps>;
    };
    const band = labelScores(session.points, session.adScoring).games[index];
    return renderToStaticMarkup(
      React.createElement(LabelGameBand, {
        band,
        points: session.points,
        names: NAMES,
        ...(editable ? { onSetGameType: noop, onSetGameServer: noop } : {}),
      }),
    );
  }

  test("the game, the set's score before it and who serves, with both menus", () => {
    const html = renderBand(true);
    expect(tag(html, "data-game-band")).toContain('data-game-band="1-1"');
    expect(tag(html, "data-game-band")).toContain(
      "px-[14px] pt-[13px] pb-[5px]",
    );
    expect(text(html)).toBe("Set 1 · Game 1 0–0 · Lee serves");

    const type = tag(html, 'data-game-menu="type"');
    expect(type).toContain('aria-label="Game type: Game 1"');
    expect(type).toContain("text-[9px]");
    expect(type).toContain("tracking-[1.4px]");
    expect(type).toContain("uppercase");
    expect(type).toContain("text-white/45");
    const server = tag(html, 'data-game-menu="server"');
    expect(server).toContain('aria-label="Server: Lee"');
    expect(server).toContain("text-[10px]");
    expect(server).toContain("text-white/40");
    expect(html).not.toContain("--ink-");

    // The second game is Vargas's.
    expect(text(renderBand(true, 1))).toBe(
      "Set 1 · Game 2 1–0 · Vargas serves",
    );
  });

  test("read-only: the same words, no menus", () => {
    const html = renderBand(false);
    expect(text(html)).toBe("Set 1 · Game 1 0–0 · Lee serves");
    expect(html).not.toContain("data-game-menu");
    expect(html).not.toContain("<button");
  });
});

// ── The shots well (T31) ───────────────────────────────────────────────────

const WELL = "src/components/admin/labels/label-black-shot-row.tsx";
const CELLS = "src/components/admin/labels/label-cells.tsx";

type WellProps = {
  point: LabelPoint;
  edit: Record<string, unknown>;
  playingShotId?: string | null;
};

function well() {
  return createLoader().load(WELL) as {
    BlackShotsWell: (props: WellProps) => React.ReactElement;
  };
}

/**
 * The frame's open point, as far as the well reads it: a serve with no
 * landing, a return, the forehand the frame lights, and a faulted first
 * serve ahead of them so the numbering and the muting have something to say.
 */
function rally(): LabelPoint {
  return point({
    id: "p-well",
    shots: [
      shot("w-fault", {
        hitter: "p2",
        stroke: "first_serve",
        spin: "flat",
        result: "net",
        contactX: -0.6,
        contactY: 0.72,
        landingX: 0.4,
        landingY: 11.2,
        videoTime: 950.2,
      }),
      shot("w-serve", {
        hitter: "p2",
        stroke: "second_serve",
        spin: "topspin",
        result: "in",
        contactX: -0.65,
        contactY: 0.7,
        videoTime: 958.1,
      }),
      shot("w-return", {
        hitter: "p1",
        stroke: "forehand",
        spin: "backspin",
        result: "in",
        contactX: 1.76,
        contactY: 23.34,
        landingX: 0.77,
        landingY: 3.9,
        videoTime: 958.9,
        status: "edited",
        // Seeded as a backhand: an edited stroke with a seed can be reset.
        seed: {
          hitter: "p1",
          stroke: "backhand",
          result: "in",
          spin: "backspin",
          contact_x: 1.76,
          contact_y: 23.34,
          landing_x: 0.77,
          landing_y: 3.9,
          video_time: 958.9,
        },
      }),
      shot("w-gone", {
        hitter: "p1",
        stroke: "forehand",
        status: "deleted",
        statusBeforeDelete: "kept",
        deleteReason: "not_a_stroke",
        videoTime: 959.6,
      }),
      shot("w-lit", {
        hitter: "p2",
        stroke: "forehand",
        spin: "flat",
        result: "in",
        contactX: -0.31,
        contactY: -1.82,
        landingX: -1.23,
        landingY: 19.59,
        videoTime: 960.3,
      }),
    ],
  });
}

/** One track of `SHOT_TRACKS`: its floor, and its share of the slack. */
interface Track {
  min: number;
  fr: number;
}

/**
 * `SHOT_TRACKS` read as tracks. A fixed `Npx` is a floor with no share; a
 * `minmax(Npx, Xfr)` is both; the result's `minmax(calc(var(--shot-tail,
 * Tpx) + Apx), Xfr)` floor is read from `floors`, which the component
 * exports beside the string so the two cannot drift.
 */
function shotTracks(spec: string, floors: readonly number[]): Track[] {
  const inner = /grid-cols-\[(.+)\]$/.exec(spec)![1];
  // Split on the underscores between tracks, not the ones inside calc().
  const tracks: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of inner) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "_" && depth === 0) {
      tracks.push(current);
      current = "";
    } else current += ch;
  }
  tracks.push(current);
  return tracks.map((track, i) => {
    const fixed = /^(\d+)px$/.exec(track);
    if (fixed) return { min: Number(fixed[1]), fr: 0 };
    const range = /^minmax\((.+),([\d.]+)fr\)$/.exec(track);
    expect(range, track).not.toBeNull();
    const floor = /^(\d+)px$/.exec(range![1]);
    if (!floor) {
      expect(range![1]).toMatch(/^calc\(var\(--shot-tail,\d+px\)_\+_\d+px\)$/);
    }
    return { min: floor ? Number(floor[1]) : floors[i], fr: Number(range![2]) };
  });
}

/**
 * CSS grid's share-out of `space` over `tracks`: every track starts on its
 * floor, the slack goes to the fr tracks in proportion, and a track that
 * would fall under its floor is pinned there and the rest re-shared.
 */
function distribute(tracks: readonly Track[], space: number): number[] {
  const widths = tracks.map((t) => t.min);
  const free = new Set(
    tracks.map((t, i) => (t.fr > 0 ? i : -1)).filter((i) => i >= 0),
  );
  for (;;) {
    const fixed = tracks.reduce(
      (sum, t, i) => sum + (free.has(i) ? 0 : widths[i]),
      0,
    );
    const frs = [...free].reduce((sum, i) => sum + tracks[i].fr, 0);
    if (frs === 0) return widths;
    const unit = (space - fixed) / frs;
    const pinned = [...free].filter((i) => unit * tracks[i].fr < tracks[i].min);
    if (pinned.length === 0) {
      for (const i of free) widths[i] = unit * tracks[i].fr;
      return widths;
    }
    for (const i of pinned) free.delete(i);
  }
}

function wellEdit(overrides: Record<string, unknown> = {}, editable = true) {
  return { ...editContext(labelSessionFixture(), editable), ...overrides };
}

function renderWell(
  overrides: Record<string, unknown> = {},
  editable = true,
  playingShotId: string | null = null,
): string {
  const { BlackShotsWell } = well();
  return renderToStaticMarkup(
    React.createElement(BlackShotsWell, {
      point: rally(),
      edit: wellEdit(overrides, editable),
      playingShotId,
    }),
  );
}

/** The markup of the stroke row for `shotId`, up to the next row. */
function shotRow(html: string, shotId: string): string {
  const at = html.indexOf(`data-shot-id="${shotId}"`);
  expect(at, shotId).toBeGreaterThan(-1);
  const start = html.lastIndexOf("<div", at);
  const candidates = [
    html.indexOf('<div data-row="shot"', at),
    html.indexOf("data-well-tombstone", at),
    html.indexOf("data-add-shot", at),
  ]
    .filter((i) => i > -1)
    .map((i) => html.lastIndexOf("<", i));
  return html.slice(start, Math.min(html.length, ...candidates));
}

/** The markup of one coordinate cell of a row. */
function xy(row: string, end: "hit" | "landed"): string {
  const at = row.indexOf(`data-xy="${end}"`);
  expect(at, end).toBeGreaterThan(-1);
  const next = row.indexOf("data-xy=", at + 1);
  const stop = row.indexOf("data-calculated", at);
  return row.slice(at, row.lastIndexOf("<", next > -1 ? next : stop));
}

test.describe("the black shots well", () => {
  test("a recessed well with no header row, one row a live stroke, and Add shot", () => {
    const html = renderWell();
    expect(tag(html, "data-shots-well")).toContain('data-shots-well="p-well"');
    // The wash and the hairlines are on the well's inner column — what the
    // outer grid's track clips as the well unfolds.
    const outerEnd = html.indexOf(">", html.indexOf("data-shots-well")) + 1;
    const frame = html.slice(outerEnd, html.indexOf(">", outerEnd) + 1);
    for (const cls of [
      "bg-white/[0.035]",
      "shadow-[inset_0_1px_0_color-mix(in_oklab,var(--color-white)_6%,transparent),inset_0_-1px_0_color-mix(in_oklab,var(--color-white)_6%,transparent)]",
    ]) {
      expect(frame).toContain(cls);
    }
    // No air above the first row or under the last: the rows meet the well's
    // two hairlines.
    expect(frame).not.toMatch(/\bp[ytb]-/);

    // No header: no eyebrow, and the two column names are never text.
    expect(html).not.toContain("eyebrow-sm");
    expect(text(html)).not.toContain("Hit at");
    expect(text(html)).not.toContain("Landed at");
    expect(html).not.toContain("--ink-900");

    // Four live strokes, numbered 1…4 as the light table numbers them; the
    // tombstone between them takes no number.
    const ids = [...html.matchAll(/data-shot-id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(["w-fault", "w-serve", "w-return", "w-lit"]);
    for (const [index, id] of ids.entries()) {
      expect(shotRow(html, id)).toContain(
        `aria-label="Shot ${index + 1} time: `,
      );
    }
    expect(html).toContain('data-tombstone-id="w-gone"');
    expect(html.indexOf('data-tombstone-id="w-gone"')).toBeGreaterThan(
      html.indexOf('data-shot-id="w-return"'),
    );
    expect(html.indexOf('data-tombstone-id="w-gone"')).toBeLessThan(
      html.indexOf('data-shot-id="w-lit"'),
    );

    // Add shot closes the well, on the well's own tracks: the plus under
    // the numbers, the words under the times, at any rail width.
    const add = tag(html, "data-add-shot");
    const { SHOT_TRACKS } = createLoader().load(WELL) as {
      SHOT_TRACKS: string;
    };
    for (const cls of [
      SHOT_TRACKS,
      "text-[11px]",
      "font-medium",
      "text-white/70",
    ]) {
      expect(add).toContain(cls);
    }
    expect(html.slice(html.indexOf("data-add-shot"))).toContain("col-[2/-1]");
    expect(html.indexOf("data-add-shot")).toBeGreaterThan(
      html.indexOf('data-shot-id="w-lit"'),
    );
    expect(text(html.slice(html.indexOf("data-add-shot")))).toContain(
      "Add shot",
    );
    expect(html.slice(html.indexOf("data-add-shot"))).toContain("size-2.5");
  });

  test("Add shot appends to the rally, and only a writable session has it", () => {
    const added: [string, string | null][] = [];
    const { BlackShotsWell } = well();
    const tree = BlackShotsWell({
      point: rally(),
      edit: wellEdit({
        operations: {
          ...OPERATIONS,
          onAddShot: (pointId: string, after: string | null) =>
            added.push([pointId, after]),
        },
      }),
    });
    // The well's outer grid holds one child: the column of rows.
    const column = (tree.props as { children: React.ReactElement }).children;
    const children = React.Children.toArray(
      (column.props as { children: React.ReactNode }).children,
    ) as React.ReactElement<Record<string, unknown>>[];
    const button = children.find((el) => el.props["data-add-shot"] === "");
    expect(button).toBeDefined();
    (button!.props.onClick as () => void)();
    expect(added).toEqual([["p-well", null]]);

    // Frozen: no button. Editable with nothing to ask: none either.
    expect(renderWell({}, false)).not.toContain("data-add-shot");
    expect(renderWell({ operations: undefined })).not.toContain(
      "data-add-shot",
    );
  });

  test("a stroke row: its tracks, its words, and the pencil on a changed one", () => {
    const html = renderWell();
    const row = shotRow(html, "w-return");
    const open = tag(row, 'data-row="shot"');
    for (const cls of ["relative", "gap-x-2", "h-[34px]", "px-[14px]"]) {
      expect(open).toContain(cls);
    }

    // The tracks: the well's one set (`SHOT_TRACKS`), the word columns
    // fractions with floors so the row reads edge to edge at every rail
    // width, the number and the two positions fixed.
    const {
      SHOT_TRACKS,
      SHOT_FLOORS_PX,
      SHOT_GAPS_PX,
      SHOT_PADDING_PX,
      SHOT_TAIL_PX,
    } = createLoader().load(WELL) as {
      SHOT_TRACKS: string;
      SHOT_FLOORS_PX: readonly number[];
      SHOT_GAPS_PX: number;
      SHOT_PADDING_PX: number;
      SHOT_TAIL_PX: number;
    };
    expect(open).toContain(SHOT_TRACKS);
    const tracks = shotTracks(SHOT_TRACKS, SHOT_FLOORS_PX);
    expect(tracks).toHaveLength(9);
    expect(tracks.map((t) => t.min)).toEqual([...SHOT_FLOORS_PX]);
    // number · hit · landed never give: the numbers being checked.
    expect(tracks[0]).toEqual({ min: 22, fr: 0 });
    expect(tracks[5]).toEqual({ min: 88, fr: 0 });
    expect(tracks[6]).toEqual({ min: 88, fr: 0 });
    // Every word column grows.
    for (const i of [1, 2, 3, 4, 7, 8]) expect(tracks[i].fr).toBeGreaterThan(0);
    // The result is never narrower than its marks slot — an 18px disc, a
    // 4px gap and the 11px pencil — plus the cell's gap, so the slot never
    // grows the grid past the rail.
    expect(SHOT_TAIL_PX).toBe(18 + 4 + 11);
    expect(tracks[8].min).toBeGreaterThanOrEqual(SHOT_TAIL_PX + 3);
    // The floors, the gaps and the padding are the rail's narrowest exactly:
    // nothing passes its edge at 520.
    expect(SHOT_GAPS_PX).toBe(8 * 8);
    expect(SHOT_PADDING_PX).toBe(2 * 14);
    expect(
      tracks.reduce((sum, t) => sum + t.min, 0) +
        SHOT_GAPS_PX +
        SHOT_PADDING_PX,
    ).toBe(RAIL_MIN_PX);
    const widthsAt = (rail: number) =>
      distribute(tracks, rail - SHOT_GAPS_PX - SHOT_PADDING_PX);
    // At 520 every track sits on its floor.
    expect(widthsAt(RAIL_MIN_PX)).toEqual([...SHOT_FLOORS_PX]);
    // At the default rail the row is the frame's — 22 · 48 · 54 · 80 · 52 ·
    // 88 · 88 · 80 · 36 — within a few px: the time sits on its 56px floor
    // (room for "1:02:03.4", a match past the hour), the words give it back.
    const FRAME = [22, 48, 54, 80, 52, 88, 88, 80, 36];
    for (const [i, width] of widthsAt(RAIL_DEFAULT_PX).entries()) {
      expect(Math.abs(width - FRAME[i]), `track ${i}`).toBeLessThanOrEqual(
        i === 1 ? 8 : 4,
      );
    }
    // At the widest rail the slack is shared across the word columns in
    // proportion: no column is left on its floor while another takes the
    // whole void, and the fixed ones have not moved.
    const wide = widthsAt(RAIL_MAX_PX);
    expect(wide.reduce((sum, w) => sum + w, 0)).toBeCloseTo(
      RAIL_MAX_PX - SHOT_GAPS_PX - SHOT_PADDING_PX,
      6,
    );
    // (The time keeps to its floor: a tabular time wants no room past its
    // figures.)
    for (const i of [2, 3, 4, 7, 8]) {
      expect(wide[i], `track ${i}`).toBeGreaterThan(tracks[i].min + 8);
    }
    expect([wide[0], wide[5], wide[6]]).toEqual([22, 88, 88]);

    // The time's floor holds an hour-long match's time whole: nine 6px mono
    // figures.
    expect(SHOT_FLOORS_PX[1]).toBeGreaterThanOrEqual("1:02:03.4".length * 6);

    // A word its track can no longer hold truncates.
    expect(tag(row, 'data-calculated="placement"')).toContain("truncate");
    expect(open).not.toContain("data-selected");
    expect(open).not.toContain("data-playing");
    expect(open).not.toContain("bg-white/[0.12]");

    // Number · time to the tenth · player · stroke · spin · … · placement ·
    // result. (The positions are read on their own, below.)
    expect(text(row)).toBe(
      "3 15:58.9 Lee Forehand Backspin 1.76 23.34 0.77 3.90 Middle In",
    );
    expect(row).toContain(
      "color:color-mix(in oklab, var(--color-white) 45%, transparent)",
    );
    expect(row).toContain(
      "color:color-mix(in oklab, var(--color-white) 72%, transparent)",
    );
    // Edited, with a seed: the blue pencil closes the row, and is its Reset.
    const result = row.slice(row.indexOf('data-calculated="result"'));
    const pencil = tag(result, "data-reset-pencil");
    expect(pencil).toMatch(/^<button/);
    expect(pencil).toContain('aria-label="Reset shot 3"');
    expect(result).toContain("text-[var(--blue)]");
    expect(result).not.toContain('aria-label="Changed by you"');
    // Inside the marks slot, not the overlay: the slot's last child.
    const slot = result.slice(result.indexOf("data-shot-marks"));
    expect(slot.indexOf("data-reset-pencil")).toBeGreaterThan(-1);
    expect(slot.indexOf("data-reset-pencil")).toBeLessThan(
      slot.indexOf("data-shot-actions"),
    );
    // A kept stroke has none.
    expect(shotRow(html, "w-lit")).not.toContain("data-pencil");

    // A serve's topspin is a Kick; with no landing it has no placement.
    const serve = shotRow(html, "w-serve");
    expect(text(serve)).toContain("Vargas Second serve Kick");
    expect(serve.slice(serve.indexOf('data-calculated="placement"'))).toContain(
      "No placement",
    );

    // The faulted first serve is muted, as the light table mutes it.
    const fault = shotRow(html, "w-fault");
    expect(tag(fault, 'data-row="shot"')).toContain("data-fault");
    expect(fault).not.toContain(
      "color:color-mix(in oklab, var(--color-white) 72%, transparent)",
    );
    expect(fault).toContain("text-white/35");
    expect(serve).not.toContain("data-fault");
  });

  test("a coordinate: the ring or the dot, then x and y in slots of their own", () => {
    const html = renderWell();
    const lit = shotRow(html, "w-lit");

    const hit = xy(lit, "hit");
    expect(hit).toContain('aria-label="Hit at"');
    expect(hit).toContain("size-[7px]");
    expect(hit).toContain("border-white/50");
    // Two elements, x then y, each right-aligned in a fixed 32px slot.
    const numbers = [...hit.matchAll(/<b class="([^"]*)"[^>]*>([^<]*)<\/b>/g)];
    expect(numbers.map((m) => m[2])).toEqual(["-0.31", "-1.82"]);
    for (const [, cls] of numbers) {
      for (const want of ["mono", "tabular", "w-8", "text-right"]) {
        expect(cls.split(" ")).toContain(want);
      }
      expect(cls).toContain("text-[10px]");
    }

    const landed = xy(lit, "landed");
    expect(landed).toContain('aria-label="Landed at"');
    expect(landed).toContain("size-[5px]");
    expect(landed).toContain("bg-white/50");
    expect(text(landed.slice(landed.indexOf(">") + 1))).toBe("-1.23 19.59");

    // No landing: one em dash under the dot, and an empty second slot.
    const none = xy(shotRow(html, "w-serve"), "landed");
    expect(none).toContain('aria-label="Landed at"');
    expect(none).toContain(
      "color:color-mix(in oklab, var(--color-white) 25%, transparent)",
    );
    expect(text(none.slice(none.indexOf(">") + 1))).toBe("— Not set");
    expect(none).toMatch(/<b class="[^"]*w-8[^"]*" aria-hidden="true"><\/b>/);
  });

  test("the selected row is lit and carries its editors; no other row does", () => {
    const html = renderWell({ selectedShotId: "w-lit" });
    const lit = shotRow(html, "w-lit");
    const open = tag(lit, 'data-row="shot"');
    expect(open).toContain("data-selected");
    expect(open).toContain("bg-white/[0.12]");
    // Player, Stroke, Spin are menus; Time and the two positions are inputs.
    expect(lit.match(/data-select-editor/g)).toHaveLength(3);
    expect(lit.match(/<input/g)).toHaveLength(3);
    expect(lit).toContain('value="-0.31, -1.82"');
    expect(lit).toContain('aria-label="Shot 4 hit at, metres x, y"');
    // On the dark tone, not the light table's field.
    expect(lit).toContain("bg-white/[0.08]");
    expect(lit).not.toContain("--surface-card");
    // The marks stay while the numbers are fields.
    expect(lit).toContain('aria-label="Hit at"');
    expect(lit).toContain('aria-label="Landed at"');

    for (const id of ["w-fault", "w-serve", "w-return"]) {
      const row = shotRow(html, id);
      expect(row, id).not.toContain("data-select-editor");
      expect(row, id).not.toContain("<input");
      // Text a keyboard can open.
      expect(row, id).toContain('role="button"');
    }

    // The playing stroke is lit too, and its stroke reads white.
    const playing = shotRow(renderWell({}, true, "w-lit"), "w-lit");
    expect(tag(playing, 'data-row="shot"')).toContain('data-playing="true"');
    expect(tag(playing, 'data-row="shot"')).toContain("bg-white/[0.12]");
    expect(playing).not.toContain("data-select-editor");
    expect(playing).toMatch(
      /class="text-\[11px\] font-medium text-white">Forehand</,
    );
    expect(shotRow(html, "w-return")).toMatch(
      /class="text-\[11px\] font-medium" style="color:color-mix\(in oklab, var\(--color-white\) 72%, transparent\)">Forehand</,
    );

    // Read-only: nothing to open, even on the selected row.
    const frozen = renderWell({ selectedShotId: "w-lit" }, false);
    expect(frozen).not.toContain("data-select-editor");
    expect(frozen).not.toContain("<input");
    expect(frozen).not.toContain('role="button"');
  });

  test("a click selects the stroke, and each editor sends the light table's patch", () => {
    type Props = Record<string, unknown>;
    type Element = React.ReactElement<Props & { children?: React.ReactNode }>;
    // Every element under `node`; a component that needs hooks cannot run
    // outside a render, so its `display`, `editor` and children are walked.
    function elements(node: React.ReactNode, out: Element[] = []): Element[] {
      if (Array.isArray(node)) {
        for (const child of node) elements(child, out);
        return out;
      }
      if (!React.isValidElement(node)) return out;
      const element = node as Element;
      out.push(element);
      if (typeof element.type === "function") {
        const error = console.error;
        console.error = () => {};
        try {
          const render = element.type as (p: Props) => React.ReactNode;
          return elements(render(element.props), out);
        } catch {
          elements(element.props.editor as React.ReactNode, out);
        } finally {
          console.error = error;
        }
      }
      return elements(element.props.children, out);
    }

    const patches: [string, unknown][] = [];
    const selected: string[] = [];
    const { BlackShotsWell } = well();
    const all = elements(
      BlackShotsWell({
        point: rally(),
        edit: wellEdit({
          onPatchShot: (id: string, patch: unknown) =>
            patches.push([id, patch]),
          onSelectShot: (id: string) => selected.push(id),
        }),
      }),
    );

    const row = all.find((el) => el.props["data-shot-id"] === "w-return");
    (row!.props.onClick as () => void)();
    expect(selected).toEqual(["w-return"]);

    const commit = (label: string, value: unknown) => {
      const input = all.find(
        (el) => el.props.label === label && "parse" in el.props,
      );
      expect(input, label).toBeDefined();
      (input!.props.onCommit as (v: unknown) => void)(value);
    };
    const pick = (label: string, value: string) => {
      const editor = all.find(
        (el) =>
          el.props.label === label &&
          "options" in el.props &&
          // The editor, not the cell that mounts it.
          !("text" in el.props),
      );
      expect(editor, label).toBeDefined();
      (editor!.props.onChange as (v: string) => void)(value);
    };

    commit("Shot 3 time", 959.4);
    pick("Shot 3 player", "p2");
    pick("Shot 3 stroke", "backhand");
    pick("Shot 3 spin", "topspin");
    // Past the singles sideline: the result rides in the same patch.
    commit("Shot 3 landed at, metres x, y", { x: -5, y: 3.9 });
    commit("Shot 3 hit at, metres x, y", null);
    expect(patches).toEqual([
      ["w-return", { video_time: 959.4 }],
      ["w-return", { hitter: "p2" }],
      ["w-return", { stroke: "backhand" }],
      ["w-return", { spin: "topspin" }],
      ["w-return", { landing_x: -5, landing_y: 3.9, result: "out" }],
      ["w-return", { contact_x: null, contact_y: null }],
    ]);
  });

  test("Delete and Reset: hidden at rest, shown on hover or focus, asking the console", () => {
    const html = renderWell({ selectedShotId: "w-return" });
    // The edited, seeded stroke, selected: both, Reset before Delete.
    const edited = shotRow(html, "w-return");
    const group = tag(edited, "data-shot-actions");
    expect(group).toContain("opacity-100");
    expect(group).toContain(" opacity-0");
    // An overlay on the row's right edge, out of the grid: it takes no
    // track, so nothing moves when it appears, and it cannot be cut off by
    // a narrow rail. On the rail's own ground, faded in from the left.
    for (const cls of [
      "absolute",
      "inset-y-0",
      // Short of the tail's marks, so a chip and the pencil stay reachable:
      // the padding, the well's `--shot-tail` and 4px of air.
      "right-[calc(14px_+_var(--shot-tail,33px)_+_4px)]",
      "bg-[var(--rail-ground)]",
      "[mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-8px),transparent)]",
    ]) {
      expect(group, cls).toContain(cls);
    }
    expect(group).not.toContain("ml-auto");
    expect(group).toContain("background-image:linear-gradient(");
    // Not inside the result cell any more: a sibling of it, the row's last.
    const resultCell = edited.slice(
      edited.indexOf('data-calculated="result"'),
      edited.indexOf("data-shot-actions"),
    );
    expect(resultCell.match(/<span/g)?.length ?? 0).toBe(
      resultCell.match(/<\/span>/g)?.length ?? 0,
    );
    expect(edited.indexOf("data-shot-actions")).toBeGreaterThan(
      edited.indexOf('data-calculated="result"'),
    );
    expect(tag(edited, "data-reset-row")).toContain(
      'aria-label="Reset shot 3"',
    );
    const del = tag(edited, "data-delete-row");
    expect(del).toContain('aria-label="Delete shot 3"');
    expect(edited.indexOf("data-reset-row")).toBeLessThan(
      edited.indexOf("data-delete-row"),
    );
    expect(edited.slice(edited.indexOf("data-shot-actions"))).toContain(
      "text-white/[0.45]",
    );

    // A kept stroke, not selected: Delete alone, hidden until reached.
    const kept = shotRow(html, "w-lit");
    expect(kept).toContain('aria-label="Delete shot 4"');
    expect(kept).not.toContain("data-reset-row");
    const hidden = tag(kept, "data-shot-actions");
    expect(hidden).toContain("opacity-0");
    expect(hidden).toContain("pointer-events-none");
    expect(hidden).toContain("absolute");
    expect(hidden).toContain("group-hover/row:opacity-100");
    expect(hidden).toContain("group-focus-within/row:opacity-100");
    expect(tag(kept, 'data-row="shot"')).toContain("group/row");

    // Read-only, or with nothing to ask: neither.
    for (const frozen of [
      renderWell({ selectedShotId: "w-return" }, false),
      renderWell({ selectedShotId: "w-return", operations: undefined }),
    ]) {
      expect(frozen).not.toContain("data-shot-actions");
      expect(frozen).not.toContain("data-delete-row");
      expect(frozen).not.toContain("data-reset-row");
    }

    // Each asks with the light row's arguments, and does not select the row.
    const asked: unknown[][] = [];
    const selected: string[] = [];
    const { BlackShotRow } = createLoader().load(WELL) as {
      BlackShotRow: (props: Record<string, unknown>) => React.ReactElement;
    };
    const find = (
      node: React.ReactNode,
      attr: string,
    ): React.ReactElement<Record<string, unknown>> | null => {
      if (Array.isArray(node)) {
        for (const child of node) {
          const hit = find(child, attr);
          if (hit) return hit;
        }
        return null;
      }
      if (!React.isValidElement(node)) return null;
      const el = node as React.ReactElement<Record<string, unknown>>;
      if (attr in el.props) return el;
      if (
        typeof el.type === "function" &&
        (el.type.name === "RowAction" || el.type.name === "PencilMark")
      ) {
        return find(
          (el.type as (p: unknown) => React.ReactNode)(el.props),
          attr,
        );
      }
      return find(el.props.children as React.ReactNode, attr);
    };
    const row = BlackShotRow({
      shot: rally().shots.find((s) => s.id === "w-return"),
      number: 3,
      pointNumber: 7,
      edit: wellEdit({
        onSelectShot: (id: string) => selected.push(id),
        operations: {
          ...OPERATIONS,
          onAskDeleteShot: (...args: unknown[]) =>
            asked.push(["delete", ...args]),
          onAskResetShot: (...args: unknown[]) =>
            asked.push(["reset", ...args]),
        },
      }),
    });
    const event = { stopPropagation: () => asked.push(["stopped"]) };
    // The pencil in the marks slot is the same ask as the overlay's Reset.
    for (const attr of [
      "data-reset-row",
      "data-delete-row",
      "data-reset-pencil",
    ]) {
      const button = find(row, attr);
      expect(button, attr).not.toBeNull();
      (button!.props.onClick as (e: unknown) => void)(event);
    }
    expect(asked).toEqual([
      ["stopped"],
      ["reset", "w-return", 3, 7],
      ["stopped"],
      ["delete", "w-return", 3, 7],
      ["stopped"],
      ["reset", "w-return", 3, 7],
    ]);
    expect(selected).toEqual([]);
  });

  test("the pencil is a plain mark when the stroke cannot be reset", () => {
    // An added stroke: changed, so the pencil — but nothing seeded to go
    // back to, so no button and no Reset name.
    const { BlackShotsWell } = well();
    const withAdded = point({
      id: "p-well",
      shots: [
        ...rally().shots,
        shot("w-added", { hitter: "p1", stroke: "forehand", status: "added" }),
      ],
    });
    const added = renderToStaticMarkup(
      React.createElement(BlackShotsWell, {
        point: withAdded,
        edit: wellEdit(),
      }),
    );
    const row = shotRow(added, "w-added");
    expect(row).toContain(
      'role="img" data-pencil="" aria-label="Changed by you"',
    );
    expect(row).not.toContain("data-reset-pencil");
    expect(row).not.toContain('aria-label="Reset shot');
    // The edited stroke on a read-only session: the indicator alone.
    const frozen = shotRow(renderWell({}, false), "w-return");
    expect(frozen).toContain('aria-label="Changed by you"');
    expect(frozen).not.toContain("data-reset-pencil");
    // The pencil never changes the marks slot's shape: 11px, no padding.
    const pencil = tag(shotRow(renderWell(), "w-return"), "data-reset-pencil");
    expect(pencil).not.toMatch(/\bp[xy]?-/);
    expect(pencil).toContain("shrink-0");
    expect(pencil).toContain("focus-visible:shadow-[var(--focus-ring)]");
  });

  test("a deleted stroke is one dark line that fits the rail, with Undo", () => {
    const restored: string[] = [];
    const operations = {
      ...OPERATIONS,
      onRestoreShot: (id: string) => restored.push(id),
    };
    const html = renderWell({ operations });
    const at = html.indexOf('data-tombstone-id="w-gone"');
    const line = html.slice(
      html.lastIndexOf("<div", at),
      html.indexOf('<div data-row="shot"', at),
    );
    const open = tag(line, "data-tombstone-id");
    expect(open).toContain('data-row="deleted-shot"');
    expect(open).toContain("data-well-tombstone");
    // Three tracks — the number's, the words, Undo — none of them the
    // light table's, and nothing to fold open.
    expect(open).toContain("grid-cols-[22px_minmax(0,1fr)_auto]");
    expect(open).toContain("px-[14px]");
    expect(line).not.toContain("aria-expanded");
    expect(line).not.toContain("ghost-shot");
    expect(line).not.toContain("overflow-x-auto");
    expect(text(line)).toMatch(/^– Deleted shot( · .+)? Undo$/);
    expect(line).toContain("text-white/45");
    expect(line).toContain("truncate");
    // No light-theme ink.
    expect(line).not.toMatch(/--ink-|--danger|--surface-card/);
    const undo = tag(line, "data-undo-delete");
    expect(undo).toMatch(/aria-label="Undo delete shot( at [\d:.]+)?"/);
    expect(undo).toContain("text-white/70");
    expect(undo).toContain("shrink-0");

    // The same restore the light tombstone asks for, and not a row click.
    const { BlackDeletedShot } = createLoader().load(WELL) as {
      BlackDeletedShot: (props: Record<string, unknown>) => React.ReactElement;
    };
    const gone = rally().shots.find((s) => s.id === "w-gone");
    const tree = BlackDeletedShot({
      shot: gone,
      edit: wellEdit({ operations }),
    });
    const button = (
      React.Children.toArray(
        (tree.props as { children: React.ReactNode }).children,
      ) as React.ReactElement<Record<string, unknown>>[]
    ).at(-1)!;
    const rendered = (button.type as (p: unknown) => React.ReactElement)(
      button.props,
    ) as React.ReactElement<Record<string, unknown>>;
    let stopped = 0;
    (rendered.props.onClick as (e: unknown) => void)({
      stopPropagation: () => (stopped += 1),
    });
    expect(restored).toEqual(["w-gone"]);
    expect(stopped).toBe(1);

    // Read-only, or with nothing to ask: the line, no Undo.
    for (const frozen of [
      renderWell({}, false),
      renderWell({ operations: undefined }),
    ]) {
      expect(frozen).toContain('data-tombstone-id="w-gone"');
      expect(frozen).not.toContain("data-undo-delete");
    }
  });

  test("a deleted point is the same line in the rail", () => {
    const { BlackDeletedPoint } = createLoader().load(ROW) as {
      BlackDeletedPoint: (props: Record<string, unknown>) => React.ReactElement;
    };
    const restored: string[] = [];
    const point = { ...rally(), id: "p-gone", status: "deleted" };
    const html = renderToStaticMarkup(
      React.createElement(BlackDeletedPoint, {
        point,
        edit: wellEdit({
          operations: {
            ...OPERATIONS,
            onRestorePoint: (id: string) => restored.push(id),
          },
        }),
      }),
    );
    const open = tag(html, "data-tombstone-id");
    expect(open).toContain('data-row="deleted-point"');
    expect(open).toContain('data-tombstone-id="p-gone"');
    expect(open).toContain("grid-cols-[22px_minmax(0,1fr)_auto]");
    expect(html).not.toContain("aria-expanded");
    expect(html).not.toMatch(/--ink-|--danger|--surface-card/);
    expect(text(html)).toMatch(/^– Deleted point( · .+)? Undo$/);
    expect(tag(html, "data-undo-delete")).toContain(
      `aria-label="Undo delete point ${point.pointIndex + 1}"`,
    );
    const frozen = renderToStaticMarkup(
      React.createElement(BlackDeletedPoint, {
        point,
        edit: wellEdit({}, false),
      }),
    );
    expect(frozen).toContain("Deleted point");
    expect(frozen).not.toContain("data-undo-delete");
  });

  test("the dark fields: a menu in the dark tone, room for a position, danger while invalid", () => {
    const cells = readFileSync(CELLS, "utf8");
    // The select keeps the rail's compact trigger and hands the menu it
    // opens the rail's tone (`menu`), dark unless told.
    expect(cells).toContain('menu = "dark",');
    expect(cells).toMatch(
      /<MenuSelect[\s\S]*?\btone=\{menu\}[\s\S]*?className=\{SELECT_TRIGGER_DARK\}/,
    );
    const menu = readFileSync(MENU_SELECT, "utf8");
    expect(menu).toContain('tone = "light",');
    expect(menu).toContain("tone?: FloatMenuTone;");
    expect(menu).toMatch(/<FloatMenu\b[\s\S]*?\btone=\{tone\}/);

    // The text field: 3px of padding and tracked-in digits, 9px wider than
    // its cell — thirteen characters of a position in an 88px track.
    const dark = /const FIELD_DARK =\s*"([^"]+)"/.exec(cells)![1];
    expect(dark).toContain("-ml-[4px]");
    expect(dark).toContain("w-[calc(100%+9px)]");
    expect(cells).toContain("px-[3px] text-[10px] tracking-[-0.05em]");
    // 88px track − 7px mark − 6px gap = 75px cell; + 9px, − 2px border,
    // − 6px padding = 76px for 13 characters at 10px mono (0.6em advance)
    // less the tracking, with the caret's 2px.
    const room = 88 - 7 - 6 + 9 - 2 - 6;
    const need = 13 * (6 - 0.5) + 2;
    expect(need).toBeLessThanOrEqual(room);

    // Invalid outranks focus.
    expect(dark).toContain("focus-within:border-[var(--blue)]");
    expect(dark).toContain(
      "data-[invalid]:focus-within:border-[var(--danger)]",
    );
    expect(cells).toContain('data-invalid={invalid ? "" : undefined}');
  });
});

test("the black rows use the palette's tokens and the type scale", () => {
  const scale = new Set([8, 9, 10, 11, 12, 13, 14, 16, 28, 30, 40, 56]);
  for (const file of [FORMAT, ROW, WELL, CELLS]) {
    const source = readFileSync(file, "utf8");
    expect(source.match(/#[0-9a-fA-F]{6}\b/g), file).toBeNull();
    for (const match of source.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) {
      expect(scale.has(Number(match[1])), `${file}: ${match[0]}`).toBe(true);
    }
  }
});

/**
 * Tailwind emits a class only when it can read it WHOLE in the source: a
 * utility whose arbitrary value is put together by a template interpolation —
 * `grid-cols-[22px_${tail}]`, `right-[${inset}px]`, `w-[calc(${a}+4px)]` —
 * is never generated, and the element silently loses the rule (the shot row
 * lost its grid this way). A constant holding the whole class, interpolated
 * as a unit, is fine; so is a selector string such as
 * `[data-point-id="${id}"]`, whose bracket does not follow a utility's `-`.
 */
const INTERPOLATED_ARBITRARY_CLASS = /[A-Za-z0-9]-\[[^\]\s"'`]*\$\{/;

test("no labels component builds an arbitrary-value class from an interpolation", () => {
  for (const [source, expected] of [
    ["`grid ${TRACKS} grid-cols-[22px_${tail}_auto]`", true],
    ["`right-[${inset}px]`", true],
    ["`w-[calc(${width}px_+_4px)]`", true],
    ["`relative grid ${SHOT_TRACKS} items-center h-[34px]`", false],
    ['`[data-point-id="${id}"]`', false],
    ["[`Shot ${lit} of ${count}`, name]", false],
    ['cn("w-[22px]", `text-${tone}`)', false],
  ] as const) {
    expect(INTERPOLATED_ARBITRARY_CLASS.test(source), source).toBe(expected);
  }
  const dir = "src/components/admin/labels";
  for (const file of readdirSync(dir)) {
    const lines = readFileSync(`${dir}/${file}`, "utf8").split("\n");
    lines.forEach((line, index) => {
      expect(
        INTERPOLATED_ARBITRARY_CLASS.test(line),
        `${file}:${index + 1}: ${line.trim()}`,
      ).toBe(false);
    });
  }
});

// ── The rail on a light ground ─────────────────────────────────────────────

const RAIL = "src/components/admin/labels/label-black-rail.tsx";
const RAIL_TONE = "src/components/admin/labels/label-rail-tone.ts";
const PILL = "src/components/admin/labels/label-follow-pill.tsx";

test.describe("the rail's two tones", () => {
  type RailProps = Record<string, unknown>;

  function renderRail(props: RailProps = {}): string {
    const { LabelBlackRail } = createLoader().load(RAIL) as {
      LabelBlackRail: React.ComponentType<RailProps>;
    };
    const session = labelSessionFixture();
    return renderToStaticMarkup(
      React.createElement(LabelBlackRail, {
        player1Name: NAMES.p1,
        player2Name: NAMES.p2,
        checked: 1,
        total: 4,
        saveStatus: { pending: 0, last: { kind: "saved", at: Date.now() } },
        onExit: noop,
        affordance: null,
        onFollow: noop,
        points: session.points,
        scores: labelScores(session.points, session.adScoring),
        names: NAMES,
        expandedPointId: null,
        editable: true,
        operations: OPERATIONS,
        onSetGameServer: noop,
        onSetGameType: noop,
        ...props,
      }),
    );
  }

  function palette() {
    return createLoader().load(RAIL_TONE) as {
      RAIL_TONE_CLASS: Record<"dark" | "light", string>;
      railInk: (alpha: number) => string;
      railAmber: (alpha: number) => string;
    };
  }

  test("the palette: dark keeps the frame's amber, light re-points white at the page's ink", () => {
    const { RAIL_TONE_CLASS, railInk, railAmber } = palette();
    // The same variables in both, so a row never reads one that is not set.
    const names = (classes: string) =>
      [...classes.matchAll(/\[(--rail-[a-z-]+):/g)].map((m) => m[1]).sort();
    expect(names(RAIL_TONE_CLASS.dark)).toEqual(names(RAIL_TONE_CLASS.light));
    expect(names(RAIL_TONE_CLASS.dark)).toEqual([
      "--rail-amber",
      "--rail-amber-line",
      "--rail-amber-wash",
      "--rail-amber-wash-faint",
      "--rail-amber-wash-strong",
      "--rail-ground",
      "--rail-on-accent",
    ]);
    // Dark: exactly what the rows drew before the palette.
    for (const cls of [
      "[--rail-ground:var(--surface-dark)]",
      "[--rail-amber:rgba(252,211,77,1)]",
      "[--rail-amber-wash-faint:rgba(253,230,138,0.06)]",
      "[--rail-amber-wash:rgba(253,230,138,0.14)]",
      "[--rail-amber-wash-strong:rgba(253,230,138,0.22)]",
      "[--rail-amber-line:rgba(252,211,77,0.45)]",
    ]) {
      expect(RAIL_TONE_CLASS.dark, cls).toContain(cls);
    }
    // …and white stays white there.
    expect(RAIL_TONE_CLASS.dark).not.toContain("--color-white");
    // Light: ink for white, the card for the ground, the warning triple.
    for (const cls of [
      "[--color-white:var(--ink-900)]",
      "text-[var(--ink-900)]",
      "[--rail-ground:var(--surface-card)]",
      "[--rail-amber:var(--warning-text)]",
      "[--rail-amber-wash:var(--warning-bg)]",
      "[--rail-amber-line:var(--warning-border)]",
    ]) {
      expect(RAIL_TONE_CLASS.light, cls).toContain(cls);
    }
    // White on both grounds, for a letter on a fill.
    for (const tone of ["dark", "light"] as const) {
      expect(RAIL_TONE_CLASS[tone]).toContain(
        "[--rail-on-accent:rgb(255,255,255)]",
      );
    }
    // An ink set by style follows the same variable a class does.
    expect(railInk(0.45)).toBe(
      "color-mix(in oklab, var(--color-white) 45%, transparent)",
    );
    expect(railInk(0.035)).toBe(
      "color-mix(in oklab, var(--color-white) 3.5%, transparent)",
    );
    expect(railInk(0.12)).toBe(
      "color-mix(in oklab, var(--color-white) 12%, transparent)",
    );
    expect(railAmber(0.8)).toBe(
      "color-mix(in oklab, var(--rail-amber) 80%, transparent)",
    );
  });

  test("dark by default: the palette on a box of no size, the session in the header, the way out", () => {
    const html = renderRail();
    const box = tag(html, "data-rail-palette");
    expect(box).toContain('data-rail-palette="dark"');
    expect(box).toContain("contents");
    expect(box).toContain(palette().RAIL_TONE_CLASS.dark);
    expect(inner(html, "data-label-rail-title")).toBe("Lee vs Vargas");
    expect(html).toContain("data-label-rail-progress");
    // The save line in its dark recipe.
    expect(tag(html, 'data-save-status="saved"')).toContain(
      'data-save-tone="dark"',
    );
    expect(tag(html, "data-label-black-exit")).toContain(
      'aria-label="Exit full screen"',
    );
    expect(html).not.toContain("data-label-rail-full-screen");
  });

  test("light: the same rows under the light palette, the save line in its light recipe", () => {
    const dark = renderRail();
    const light = renderRail({ tone: "light" });
    const box = tag(light, "data-rail-palette");
    expect(box).toContain('data-rail-palette="light"');
    expect(box).toContain(palette().RAIL_TONE_CLASS.light);
    // The save line is the page header's: no dark mark, the light ink.
    const save = tag(light, 'data-save-status="saved"');
    expect(save).not.toContain("data-save-tone");
    expect(save).toContain("color:var(--ink-500)");
    // Everything else is the SAME markup — only the palette differs.
    const rows = (html: string) =>
      html.slice(html.indexOf("data-label-rail-scroller"));
    expect(rows(light)).toBe(rows(dark));
    // p1's initial sits on blue: white on both grounds, not the rail's ink.
    expect(light).toContain("bg-[var(--blue)] text-[var(--rail-on-accent)]");
  });

  test("the tone reaches what leaves the rail through a portal: every menu, the note", () => {
    type Props = Record<string, unknown>;
    type Element = React.ReactElement<Props & { children?: React.ReactNode }>;
    function elements(node: React.ReactNode, out: Element[] = []): Element[] {
      if (Array.isArray(node)) {
        for (const child of node) elements(child, out);
        return out;
      }
      if (!React.isValidElement(node)) return out;
      const element = node as Element;
      out.push(element);
      if (typeof element.type === "function") {
        const error = console.error;
        console.error = () => {};
        try {
          const render = element.type as (p: Props) => React.ReactNode;
          return elements(render(element.props), out);
        } catch {
          elements(element.props.editor as React.ReactNode, out);
        } finally {
          console.error = error;
        }
      }
      return elements(element.props.children, out);
    }

    for (const tone of ["dark", "light"] as const) {
      // The well: compact chrome on either ground, the menu in the tone.
      const { BlackShotsWell } = well();
      const wellElements = elements(
        BlackShotsWell({
          point: rally(),
          edit: wellEdit({ tone, selectedShotId: "w-return" }),
        }),
      );
      const selects = wellElements.filter(
        (el) => "options" in el.props && "menu" in el.props,
      );
      expect(selects.length, tone).toBeGreaterThan(0);
      for (const select of selects) {
        expect(select.props.menu, tone).toBe(tone);
      }

      // The point row: the ⋯ menu.
      const session = labelSessionFixture();
      const edit = { ...editContext(session), tone };
      const row = session.points.find((p) => p.status !== "deleted")!;
      const { BlackPointRow } = components();
      const rowElements = elements(
        renderFunction<RowProps>(BlackPointRow)({
          point: row,
          open: false,
          playing: false,
          score: null,
          edit,
        }),
      );
      const menu = rowElements.find(
        (el) => "operations" in el.props && "menu" in el.props,
      );
      expect(menu, tone).toBeDefined();
      expect(menu!.props.menu, tone).toBe(tone);
    }

    // No tone on the context is the dark rail, as before the palette.
    const { BlackShotsWell } = well();
    const untoned = elements(
      BlackShotsWell({ point: rally(), edit: wellEdit() }),
    ).filter((el) => "options" in el.props && "menu" in el.props);
    for (const select of untoned) expect(select.props.menu).toBe("dark");

    // The rest are read off the source: these menus open inside components
    // that hold state, which cannot be walked outside a render.
    const rail = readFileSync(RAIL, "utf8");
    // The game band keeps the rail's paint and opens menus in the tone.
    expect(rail).toMatch(/<LabelGameBand[\s\S]*?\bmenu=\{tone\}/);
    // The score chip's answers.
    expect(rail).toMatch(/<FloatMenu[\s\S]*?width=\{272\}\s+tone=\{tone\}/);
    expect(rail).not.toContain('tone="dark"');
    const row = readFileSync(ROW, "utf8");
    // Who won.
    expect(row).toContain('tone={edit.tone ?? "dark"}');
    expect(row).not.toContain('tone="dark"');
    expect(readFileSync(WELL, "utf8")).not.toContain('tone="dark"');
    // The band takes it: one paint, menus from `menu`.
    const band = readFileSync(BAND, "utf8");
    expect(band).toContain('menu = "dark",');
    expect(band.match(/\btone=\{menu\}/g)).toHaveLength(1);
  });

  test("showSession off: 'Points' in place of the title, no progress, no save line; the total stays", () => {
    const marks = { points: {}, shots: {}, suggestions: [] };
    const html = renderRail({ showSession: false, tone: "light", marks });
    expect(inner(html, "data-label-rail-title")).toBe("Points");
    expect(html).not.toContain("Lee vs Vargas");
    expect(html).not.toContain("data-label-rail-progress");
    expect(html).not.toContain("data-save-status");
    expect(html).toContain("data-label-rail-to-check");
    expect(html).not.toContain("data-label-rail-fixes");
    // With it on (the default) all three are there.
    const whole = renderRail({ marks });
    expect(whole).toContain("data-label-rail-progress");
    expect(whole).toContain("data-save-status");
    expect(whole).toContain("data-label-rail-to-check");
  });

  test("onFullScreen draws its button; no onExit, no exit button", () => {
    let entered = 0;
    const html = renderRail({
      onExit: undefined,
      onFullScreen: () => {
        entered += 1;
      },
    });
    const button = tag(html, "data-label-rail-full-screen");
    expect(button).toContain("<button");
    expect(button).toContain('aria-label="Full screen"');
    expect(html).toContain("lucide-maximize-2");
    expect(html).not.toContain("data-label-black-exit");
    expect(html).not.toContain("Exit full screen");
    expect(entered).toBe(0);
    // Its tooltip's two lines, and the click, are the source's.
    const rail = readFileSync(RAIL, "utf8");
    expect(rail).toMatch(
      /label="Full screen"\s+detail="Fills the whole screen"[\s\S]*?data-label-rail-full-screen=""\s+aria-label="Full screen"\s+onClick=\{onFullScreen\}/,
    );
    // Both at once, the way in before the way out.
    const both = renderRail({ onFullScreen: noop });
    expect(both.indexOf("data-label-rail-full-screen")).toBeGreaterThan(-1);
    expect(both.indexOf("data-label-rail-full-screen")).toBeLessThan(
      both.indexOf("data-label-black-exit"),
    );
  });

  test("the 'Now playing' pill: the rail's place on either ground, the page's shadow on the light one", () => {
    const affordance = { label: "Now playing", ariaLabel: "Follow" };
    const pill = (props: RailProps) =>
      tag(renderRail({ affordance, ...props }), "data-label-follow-pill");
    const dark = pill({});
    for (const cls of [
      "top-3",
      "z-10",
      "text-white",
      "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]",
    ]) {
      expect(dark, cls).toContain(cls);
    }
    const light = pill({ tone: "light" });
    for (const cls of [
      "top-3",
      "z-10",
      "shadow-[var(--shadow-floating)]",
      // Inside the light rail "white" is ink: the chip's words say white
      // by the palette's own name.
      "text-[var(--rail-on-accent)]",
      "bg-[rgba(13,13,13,0.72)]",
    ]) {
      expect(light, cls).toContain(cls);
    }
    expect(light).not.toMatch(/\btext-white\b/);
    expect(readFileSync(PILL, "utf8")).toContain('tone = "dark",');
  });
});
