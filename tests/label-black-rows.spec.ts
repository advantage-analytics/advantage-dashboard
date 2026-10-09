import { readdirSync, readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { RAIL_MIN_PX } from "@/components/admin/labels/label-layout";
import { labelScores } from "@/lib/services/labels/score";
import type {
  LabelPoint,
  LabelSession,
  LabelShot,
} from "@/lib/services/labels/session";
import { count, inner, tag, text } from "./fixtures/html-probe";
import {
  FIXTURE_POINT_IDS,
  labelSessionFixture,
  editContext as sharedEditContext,
  labelPoint,
  labelShot,
  noop,
  ROW_OPERATIONS as OPERATIONS,
} from "./fixtures/label-session";
import { elements, findByProp } from "./fixtures/react-tree";
import { createLoader, renderFunction } from "./fixtures/vm-modules";

/** The points rail's rows: a point's two lines, its row, the game band and the shots well. */

type Names = { p1: string; p2: string };

const FORMAT = "src/components/admin/labels/label-black-format.ts";
const ROW = "src/components/admin/labels/label-black-point-row.tsx";
const BAND = "src/components/admin/labels/label-game-band.tsx";

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

const shot = (id: string, fields: Partial<LabelShot>) =>
  labelShot(id, "p", fields);
const point = (fields: Partial<LabelPoint>) =>
  labelPoint("p", 0, { vendorRallyIds: [], ...fields });

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

const editContext = (session: LabelSession, editable = true) =>
  sharedEditContext(
    { editable, operations: editable ? OPERATIONS : undefined },
    session,
  );

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

test.describe("the black point row", () => {
  test("the fixture's edited point: its two lines, its winner, score and tick, and the pencil", () => {
    const html = renderRow(FIXTURE_POINT_IDS.P1);
    const row = tag(html, 'data-row="point"');
    expect(row).toContain(`data-point-id="${FIXTURE_POINT_IDS.P1}"`);
    expect(row).not.toContain("data-playing");

    // Lee's error on the added forehand (no spin recorded), three strokes
    // from the serve at 41:12 — the tombstone between them not counted.
    expect(inner(html, "data-point-sentence")).toBe("Forehand error by Lee");
    expect(inner(html, "data-point-detail")).toBe(
      "Crosscourt · 41:12 · 3 shot rally",
    );

    // Won by Vargas.
    expect(tag(html, "data-winner-mark")).toContain('data-winner-mark="p2"');
    expect(html).toContain('aria-label="Point 1 won by Vargas"');

    // Edited — and a stroke of it edited, added and deleted: the pencil,
    // in the tail slot. The point has a seed, so the pencil is its Reset
    // too: a button named for that.
    const tail = html.slice(
      html.indexOf("data-row-tail"),
      html.indexOf("data-point-score"),
    );
    const pencil = tag(tail, "data-reset-pencil");
    expect(pencil).toMatch(/^<button/);
    expect(pencil).toContain('aria-label="Reset point 1"');
    expect(tail).not.toContain('aria-label="Changed by you"');

    // The score before it.
    expect(inner(html, "data-point-score")).toBe("0–0");

    // Not checked: the tick is there, unpressed.
    const tick = tag(html, "data-check-row");
    expect(tick).toContain('aria-pressed="false"');
    expect(tick).toContain('aria-label="Point 1 checked"');

    // Folded: no strokes under it.
    expect(html).not.toContain("data-shots-for");
  });

  test("a checked, untouched point: the tick is pressed, no pencil", () => {
    const html = renderRow(FIXTURE_POINT_IDS.P2);
    expect(inner(html, "data-point-sentence")).toBe("Ace by Lee");
    expect(inner(html, "data-point-detail")).toBe(
      "Flat First Serve · 41:30 · serve only",
    );
    const tick = tag(html, "data-check-row");
    expect(tick).toContain('aria-pressed="true"');
    // Kept as seeded: nothing changed by the labeller.
    expect(html).not.toContain("data-pencil");
    expect(tag(html, "data-winner-mark")).toContain('data-winner-mark="p1"');
  });

  test("a playing point: marked, the rule drawn, its strokes under it", () => {
    const html = renderRow(FIXTURE_POINT_IDS.P4, {
      playing: true,
      open: true,
      playingWindow: { start: 2500, end: 2512 },
      children: React.createElement("i", { "data-strokes": "" }),
    });
    const row = tag(html, 'data-row="point"');
    expect(row).toContain('data-playing="true"');
    // Nothing labelled on it yet. Its strokes are untimed, and without the
    // session's marks its ghost is a stroke like any other (the second
    // serve still decides, and the rally still counts from it).
    expect(inner(html, "data-point-sentence")).toBe("Point 4");
    expect(inner(html, "data-point-detail")).toBe("Second Serve · serve only");

    const rule = tag(html, "data-playing-rule");
    expect(rule).toContain("var(--film-t, 0) - 2500");
    expect(rule).toContain("/ 12 * 100%");

    // Open: its strokes are handed in under it.
    expect(html).toContain(`data-shots-for="${FIXTURE_POINT_IDS.P4}"`);
    expect(html).toContain("data-strokes");
    // A playing row with no window is marked, with no rule.
    expect(renderRow(FIXTURE_POINT_IDS.P4, { playing: true })).not.toContain(
      "data-playing-rule",
    );
  });

  test("read-only: the mark alone, no menu, a tick that cannot be pressed", () => {
    const html = renderRow(FIXTURE_POINT_IDS.P1, {}, false);
    expect(html).toContain('role="img" aria-label="Point 1 won by Vargas"');
    expect(html).not.toContain("data-point-menu");
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
    const first = session.points.find((p) => p.id === FIXTURE_POINT_IDS.P1)!;
    const tree = renderFunction<unknown>(BlackPointRow)({
      point: first,
      open: false,
      playing: false,
      score: null,
      edit,
    });
    // The pencil is `PencilMark`'s, so that component is entered.
    const pencil = findByProp(tree, "data-reset-pencil", ["PencilMark"]);
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
    expect(text(html)).toBe("Set 1 · Game 1 0–0 · Lee serves");

    const type = tag(html, 'data-game-menu="type"');
    expect(type).toContain('aria-label="Game type: Game 1"');
    const server = tag(html, 'data-game-menu="server"');
    expect(server).toContain('aria-label="Server: Lee"');

    // The second game is Vargas's; the first stopped at 15–15, so the
    // running count credits it to nobody.
    expect(text(renderBand(true, 1))).toBe(
      "Set 1 · Game 2 0–0 · Vargas serves",
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

interface Track {
  min: number;
  fr: number;
}

/** `SHOT_TRACKS` read as tracks: each one's floor, and its share of the slack. */
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
  test("one row a live stroke, the tombstone between them, and Add shot", () => {
    const html = renderWell();
    expect(tag(html, "data-shots-well")).toContain('data-shots-well="p-well"');

    // Four live strokes, numbered 1…4; the
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

    expect(html.indexOf("data-add-shot")).toBeGreaterThan(
      html.indexOf('data-shot-id="w-lit"'),
    );
    expect(text(html.slice(html.indexOf("data-add-shot")))).toContain(
      "Add shot",
    );
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

    // The tracks: the well's one set (`SHOT_TRACKS`), the word columns
    // fractions with floors so the row reads edge to edge at every rail
    // width, the number and the two positions fixed.
    const { SHOT_TRACKS, SHOT_FLOORS_PX, SHOT_GAPS_PX, SHOT_PADDING_PX } =
      createLoader().load(WELL) as {
        SHOT_TRACKS: string;
        SHOT_FLOORS_PX: readonly number[];
        SHOT_GAPS_PX: number;
        SHOT_PADDING_PX: number;
      };
    expect(open).toContain(SHOT_TRACKS);
    const tracks = shotTracks(SHOT_TRACKS, SHOT_FLOORS_PX);
    expect(tracks).toHaveLength(9);
    expect(tracks.map((t) => t.min)).toEqual([...SHOT_FLOORS_PX]);
    // number · hit · landed never give: the numbers being checked.
    expect(tracks[0]).toEqual({ min: 22, fr: 0 });
    expect(tracks[5]).toEqual({ min: 88, fr: 0 });
    expect(tracks[6]).toEqual({ min: 88, fr: 0 });
    // The floors, the gaps and the padding are the rail's narrowest exactly:
    // nothing passes its edge at 520.
    expect(
      tracks.reduce((sum, t) => sum + t.min, 0) +
        SHOT_GAPS_PX +
        SHOT_PADDING_PX,
    ).toBe(RAIL_MIN_PX);

    // The time's floor holds an hour-long match's time whole: nine 6px mono
    // figures.
    expect(SHOT_FLOORS_PX[1]).toBeGreaterThanOrEqual("1:02:03.4".length * 6);

    // Number · time to the tenth · player · stroke · spin · … · placement ·
    // result. (The positions are read on their own, below.)
    expect(text(row)).toBe(
      "3 15:58.9 Lee Forehand Backspin 1.76 23.34 0.77 3.90 Middle In",
    );
    // Edited, with a seed: the pencil closes the row, and is its Reset.
    const result = row.slice(row.indexOf('data-calculated="result"'));
    const pencil = tag(result, "data-reset-pencil");
    expect(pencil).toMatch(/^<button/);
    expect(pencil).toContain('aria-label="Reset shot 3"');
    expect(result).not.toContain('aria-label="Changed by you"');
    // A kept stroke has none.
    expect(shotRow(html, "w-lit")).not.toContain("data-pencil");

    // A serve's topspin is a Kick; with no landing it has no placement.
    const serve = shotRow(html, "w-serve");
    expect(text(serve)).toContain("Vargas Second serve Kick");
    expect(serve.slice(serve.indexOf('data-calculated="placement"'))).toContain(
      "No placement",
    );

    // The faulted first serve is marked as one.
    const fault = shotRow(html, "w-fault");
    expect(tag(fault, 'data-row="shot"')).toContain("data-fault");
    expect(serve).not.toContain("data-fault");
  });

  test("a coordinate: x and y in slots of their own, so the columns align", () => {
    const html = renderWell();
    const lit = shotRow(html, "w-lit");

    const hit = xy(lit, "hit");
    expect(hit).toContain('aria-label="Hit at"');
    // Two elements, x then y, each right-aligned in a fixed 32px slot.
    const numbers = [...hit.matchAll(/<b class="([^"]*)"[^>]*>([^<]*)<\/b>/g)];
    expect(numbers.map((m) => m[2])).toEqual(["-0.31", "-1.82"]);
    for (const [, cls] of numbers) {
      for (const want of ["tabular", "w-8", "text-right"]) {
        expect(cls.split(" ")).toContain(want);
      }
    }

    const landed = xy(lit, "landed");
    expect(landed).toContain('aria-label="Landed at"');
    expect(text(landed.slice(landed.indexOf(">") + 1))).toBe("-1.23 19.59");

    // No landing: one em dash under the dot, and an empty second slot.
    const none = xy(shotRow(html, "w-serve"), "landed");
    expect(text(none.slice(none.indexOf(">") + 1))).toBe("— Not set");
    expect(none).toMatch(/<b class="[^"]*w-8[^"]*" aria-hidden="true"><\/b>/);
  });

  test("the selected row is lit and carries its editors; no other row does", () => {
    const html = renderWell({ selectedShotId: "w-lit" });
    const lit = shotRow(html, "w-lit");
    const open = tag(lit, 'data-row="shot"');
    expect(open).toContain("data-selected");
    // Player, Stroke, Spin are menus; Time and the two positions are inputs.
    expect(lit.match(/data-select-editor/g)).toHaveLength(3);
    expect(lit.match(/<input/g)).toHaveLength(3);
    expect(lit).toContain('value="-0.31, -1.82"');
    expect(lit).toContain('aria-label="Shot 4 hit at, metres x, y"');

    for (const id of ["w-fault", "w-serve", "w-return"]) {
      const row = shotRow(html, id);
      expect(row, id).not.toContain("data-select-editor");
      expect(row, id).not.toContain("<input");
      // Text a keyboard can open.
      expect(row, id).toContain('role="button"');
    }

    // The playing stroke is marked too, without editors.
    const playing = shotRow(renderWell({}, true, "w-lit"), "w-lit");
    expect(tag(playing, 'data-row="shot"')).toContain('data-playing="true"');
    expect(playing).not.toContain("data-select-editor");

    // Read-only: nothing to open, even on the selected row.
    const frozen = renderWell({ selectedShotId: "w-lit" }, false);
    expect(frozen).not.toContain("data-select-editor");
    expect(frozen).not.toContain("<input");
    expect(frozen).not.toContain('role="button"');
  });

  test("a click selects the stroke, and each editor sends its patch", () => {
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

  test("Delete and Reset: Reset before Delete, each asking the console", () => {
    const html = renderWell({ selectedShotId: "w-return" });
    // The edited, seeded stroke, selected: both, Reset before Delete.
    const edited = shotRow(html, "w-return");
    expect(tag(edited, "data-reset-row")).toContain(
      'aria-label="Reset shot 3"',
    );
    const del = tag(edited, "data-delete-row");
    expect(del).toContain('aria-label="Delete shot 3"');
    expect(edited.indexOf("data-reset-row")).toBeLessThan(
      edited.indexOf("data-delete-row"),
    );

    // A kept stroke, not selected: Delete alone, hidden until reached.
    const kept = shotRow(html, "w-lit");
    expect(kept).toContain('aria-label="Delete shot 4"');
    expect(kept).not.toContain("data-reset-row");

    // Read-only, or with nothing to ask: neither.
    for (const frozen of [
      renderWell({ selectedShotId: "w-return" }, false),
      renderWell({ selectedShotId: "w-return", operations: undefined }),
    ]) {
      expect(frozen).not.toContain("data-shot-actions");
      expect(frozen).not.toContain("data-delete-row");
      expect(frozen).not.toContain("data-reset-row");
    }

    // Each only asks, and does not select the row.
    const asked: unknown[][] = [];
    const selected: string[] = [];
    const { BlackShotRow } = createLoader().load(WELL) as {
      BlackShotRow: (props: Record<string, unknown>) => React.ReactElement;
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
      const button = findByProp(row, attr, ["RowAction", "PencilMark"]);
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

  test("a deleted stroke is one line, with Undo", () => {
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
    expect(text(line)).toMatch(/^– Deleted shot( · .+)? Undo$/);
    const undo = tag(line, "data-undo-delete");
    expect(undo).toMatch(/aria-label="Undo delete shot( at [\d:.]+)?"/);

    // Undo asks for the restore, and is not a row click.
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

  test("a trailing run of strokes removed as dead balls after the point: Undo N from each but the last puts the run back in one call", () => {
    const { BlackShotsWell, deadBallRunStart } = well() as unknown as {
      BlackShotsWell: React.ComponentType<Record<string, unknown>>;
      deadBallRunStart: (shots: LabelShot[]) => number;
    };
    const dead = (id: string, videoTime: number) =>
      shot(id, {
        hitter: "p1",
        stroke: "forehand",
        status: "deleted",
        statusBeforeDelete: "kept",
        deleteReason: "dead_ball_after_point",
        videoTime,
      });
    const base = rally();
    const point = {
      ...base,
      shots: [
        ...base.shots,
        dead("w-d1", 970),
        dead("w-d2", 971),
        dead("w-d3", 972),
      ],
    };
    // The run is the last three rows; w-gone, before a live row and with
    // another reason, is not in it.
    expect(deadBallRunStart(point.shots)).toBe(base.shots.length);
    expect(deadBallRunStart(base.shots)).toBe(base.shots.length);
    // A double fault's tail, hit after the fault, is a run the same way.
    const afterFault = {
      ...point,
      shots: point.shots.map((s) =>
        s.id.startsWith("w-d")
          ? { ...s, deleteReason: "dead_ball_after_fault" as const }
          : s,
      ),
    };
    expect(deadBallRunStart(afterFault.shots)).toBe(base.shots.length);

    const restored: unknown[][] = [];
    const single: string[] = [];
    const edit = wellEdit({
      operations: {
        ...OPERATIONS,
        onRestoreShot: (id: string) => single.push(id),
      },
      onRestoreShots: (...args: unknown[]) => restored.push(args),
    });
    const html = renderToStaticMarkup(
      React.createElement(BlackShotsWell, { point, edit }),
    );
    const undoOf = (id: string) => {
      const at = html.indexOf(`data-tombstone-id="${id}"`);
      const line = html.slice(at, html.indexOf("</button>", at));
      return [
        tag(line, "data-undo-delete"),
        text(line.slice(line.lastIndexOf(">") + 1)),
      ];
    };
    expect(undoOf("w-d1")[0]).toContain('data-undo-count="3"');
    expect(undoOf("w-d1")[0]).toContain(
      'aria-label="Undo delete of the 3 shots after the point"',
    );
    expect(undoOf("w-d1")[1]).toBe("Undo 3");
    expect(undoOf("w-d2")[0]).toContain('data-undo-count="2"');
    expect(undoOf("w-d2")[1]).toBe("Undo 2");
    // The last of the run, and w-gone outside it: the plain Undo.
    expect(undoOf("w-d3")[0]).not.toContain("data-undo-count");
    expect(undoOf("w-d3")[1]).toBe("Undo");
    expect(undoOf("w-gone")[1]).toBe("Undo");

    // Undo 3 asks for the whole run at once, on the point; Undo on the
    // last row is the single restore.
    const tree = elements(React.createElement(BlackShotsWell, { point, edit }));
    const clickUndo = (id: string) => {
      const row = tree.find((e) => e.props["data-tombstone-id"] === id)!;
      const button = elements(row.props.children).find(
        (e) => "data-undo-delete" in e.props,
      )!;
      (button.props.onClick as (e: unknown) => void)({
        stopPropagation: noop,
      });
    };
    clickUndo("w-d1");
    clickUndo("w-d3");
    expect(restored).toEqual([["p-well", ["w-d1", "w-d2", "w-d3"]]]);
    expect(single).toEqual(["w-d3"]);

    // With no batched restore to call, every row keeps its own Undo.
    const alone = renderToStaticMarkup(
      React.createElement(BlackShotsWell, {
        point,
        edit: wellEdit({ onRestoreShots: undefined }),
      }),
    );
    expect(alone).not.toContain("data-undo-count");
    expect(count(alone, /data-undo-delete/g)).toBe(4);
    // A live row after the tombstones, or another reason among them, ends
    // the run before it starts.
    const broken = {
      ...point,
      shots: [
        ...point.shots.slice(0, -1),
        { ...point.shots.at(-1)!, deleteReason: "other" },
      ],
    };
    expect(deadBallRunStart(broken.shots)).toBe(broken.shots.length);
  });

  test("a deleted point is the same line in the rail", () => {
    const { BlackDeletedPoint } = createLoader().load(ROW) as {
      BlackDeletedPoint: (props: Record<string, unknown>) => React.ReactElement;
    };
    const point = { ...rally(), id: "p-gone", status: "deleted" };
    const html = renderToStaticMarkup(
      React.createElement(BlackDeletedPoint, { point, edit: wellEdit() }),
    );
    const open = tag(html, "data-tombstone-id");
    expect(open).toContain('data-row="deleted-point"');
    expect(open).toContain('data-tombstone-id="p-gone"');
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
