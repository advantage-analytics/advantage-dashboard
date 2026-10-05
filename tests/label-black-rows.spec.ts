import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

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
import { createLoader } from "./fixtures/vm-modules";

/**
 * The black full-screen view's rows (T30): the two lines a point reads as
 * (`label-black-format.ts`), and the row and game band that draw them
 * (`label-black-point-row.tsx`) — rendered offline through
 * `fixtures/vm-modules`, nothing stubbed.
 */

type Names = { p1: string; p2: string };

const FORMAT = "src/components/admin/labels/label-black-format.ts";
const ROW = "src/components/admin/labels/label-black-point-row.tsx";

function format() {
  return createLoader().load(FORMAT) as {
    pointSentence: (point: LabelPoint, names: Names) => string;
    pointDetail: (point: LabelPoint, names: Names) => string;
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
    expect(pointDetail(error, FRAME)).toBe(
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
    expect(pointDetail(winner, FRAME)).toBe(
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
    expect(pointDetail(doubleFault, FRAME)).toBe(
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
    expect(pointDetail(ace, FRAME)).toBe(
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
    expect(pointDetail(blank, FRAME)).toBe("serve only");
    // One stroke that is not a serve is a rally of one, not a serve.
    expect(
      pointDetail(
        point({ shots: [shot("a", { stroke: "backhand", videoTime: 5 })] }),
        FRAME,
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
};

function components() {
  return createLoader().load(ROW) as {
    BlackPointRow: React.ComponentType<RowProps>;
    BlackGameBand: React.ComponentType<BandProps>;
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
    openTombstoneIds: new Set<string>(),
    points: session.points,
    scores: labelScores(session.points, session.adScoring).points,
    playingShotId: null,
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
    // The frame's grid.
    expect(row).toContain(
      "grid-cols-[22px_30px_minmax(0,1fr)_auto_48px_auto_22px]",
    );
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
      "color:rgba(255,255,255,0.45)",
    );

    // Won by Vargas: the other player's wash, not the blue.
    expect(tag(html, "data-winner-mark")).toContain('data-winner-mark="p2"');
    expect(tag(html, "data-winner-mark")).toContain("bg-white/[0.14]");
    expect(html).toContain('aria-label="Point 1 won by Vargas"');

    // Edited — and a stroke of it edited, added and deleted: the pencil,
    // in the tail slot.
    const tail = html.slice(
      html.indexOf("data-row-tail"),
      html.indexOf("data-point-score"),
    );
    expect(tail).toContain('aria-label="Changed by you"');
    expect(tail).toContain("text-[var(--blue)]");

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
    const actions = html.indexOf("data-row-actions");
    const tick = html.indexOf("data-check-row");
    expect(score).toBeLessThan(actions);
    expect(actions).toBeLessThan(tick);

    const group = tag(html, "data-row-actions");
    expect(group).toContain("opacity-0");
    expect(group).toContain("group-hover/row:opacity-100");
    // No width until then, so the score keeps the tick's side.
    expect(group).toContain("w-0");
    expect(group).toContain("group-hover/row:w-auto");

    // Note, then the point's ⋯ menu, on the dark tone.
    const inGroup = html.slice(actions, tick);
    expect(inGroup).toContain('aria-label="Point 1 note"');
    expect(inGroup).toContain('aria-label="Point 1 actions"');
    expect(inGroup.indexOf("data-note-action")).toBeLessThan(
      inGroup.indexOf("data-point-menu"),
    );
    expect(tag(html, "data-note-action")).toContain("text-white/55");
    expect(tag(html, "data-point-menu")).toContain("text-white/55");
    expect(tag(html, "data-point-menu")).not.toContain("--ink-");

    // The grip, decorative, in the number's cell.
    const handle = tag(html, "data-row-handle");
    expect(handle).toContain('aria-hidden="true"');
    expect(handle).toContain("cursor-grab");
    expect(handle).toContain("text-white/60");
    expect(handle).toContain("opacity-0");
    expect(handle).toContain("group-hover/row:opacity-100");
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
    expect(html).not.toContain("Changed by you");
    // Won by Lee: p1's blue mark.
    expect(tag(html, "data-winner-mark")).toContain("bg-[var(--blue)]");
    // It has a note: the Note action is white.
    const note = tag(html, "data-note-action");
    expect(note).toContain("data-has-note");
    expect(note).toContain("text-white");
    expect(note).not.toContain("text-white/55");
  });

  test("a playing point: marked, its actions and grip shown, the rule drawn", () => {
    const html = renderRow(FIXTURE_POINT_IDS.P4, {
      playing: true,
      open: true,
      playingWindow: { start: 2500, end: 2512 },
      children: React.createElement("i", { "data-strokes": "" }),
    });
    const row = tag(html, 'data-row="point"');
    expect(row).toContain('data-playing="true"');
    expect(row).toContain("bg-white/[0.08]");
    // Nothing labelled on it yet.
    expect(inner(html, "data-point-sentence")).toBe("Point 4");
    expect(inner(html, "data-point-detail")).toBe("serve only");

    const group = tag(html, "data-row-actions");
    expect(group).toContain("opacity-100");
    expect(group).not.toContain("opacity-0");
    expect(group).not.toContain("w-0");
    expect(tag(html, "data-row-handle")).not.toContain("opacity-0");
    expect(tag(html, "data-check-row")).toContain("text-white/50");

    const rule = tag(html, "data-playing-rule");
    expect(rule).toContain("h-0.5 bg-[var(--blue)]");
    expect(rule).toContain("var(--film-t, 0) - 2500");
    expect(rule).toContain("/ 12 * 100%");

    // Open: its strokes are handed in under it.
    expect(html).toContain(`data-shots-for="${FIXTURE_POINT_IDS.P4}"`);
    expect(html).toContain("data-strokes");
    expect(tag(html, "data-point-fold")).toContain('aria-expanded="true"');
    // A playing row with no window is marked, with no rule.
    expect(renderRow(FIXTURE_POINT_IDS.P4, { playing: true })).not.toContain(
      "data-playing-rule",
    );
  });

  test("read-only: the mark alone, no menu, a tick that cannot be pressed", () => {
    const html = renderRow(FIXTURE_POINT_IDS.P1, {}, false);
    expect(html).toContain('role="img" aria-label="Point 1 won by Vargas"');
    expect(html).not.toContain("data-point-menu");
    // No note to read, and none to write.
    expect(html).not.toContain("data-note-action");
    expect(tag(html, "data-check-row")).toContain("disabled");
    // A point with a note still shows it.
    expect(renderRow(FIXTURE_POINT_IDS.P2, {}, false)).toContain(
      "data-note-action",
    );
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
    const { BlackGameBand } = components();
    const band = labelScores(session.points, session.adScoring).games[index];
    return renderToStaticMarkup(
      React.createElement(BlackGameBand, {
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

test("the black rows use the palette's tokens and the type scale", () => {
  const scale = new Set([8, 9, 10, 11, 12, 13, 14, 16, 28, 30, 40, 56]);
  for (const file of [FORMAT, ROW]) {
    const source = readFileSync(file, "utf8");
    expect(source.match(/#[0-9a-fA-F]{6}\b/g), file).toBeNull();
    for (const match of source.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) {
      expect(scale.has(Number(match[1])), `${file}: ${match[0]}`).toBe(true);
    }
  }
});
