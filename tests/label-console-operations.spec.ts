import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { INITIAL_SAVE_STATUS } from "@/components/admin/labels/save-status";
import {
  applyGameWrites,
  planGameServer,
} from "@/lib/services/labels/game-operations";
import { labelScores } from "@/lib/services/labels/score";
import type {
  LabelPoint,
  LabelSession,
  LabelVideo,
} from "@/lib/services/labels/session";
import {
  FIXTURE_POINT_IDS,
  labelSessionFixture,
} from "./fixtures/label-session";
import { createLoader } from "./fixtures/vm-modules";

/**
 * T7 in the console, rendered offline through `fixtures/vm-modules`: the ✕
 * (a stroke's) and the ⋯ menu (a point's) that ask before deleting, the
 * tombstone's one line with its Undo, the move question, the point's tick,
 * and Reset on an edited row that has a seed. The rows are the points
 * rail's (`label-black-rail.tsx`), in both of the console's layouts; their
 * own paint and presses are `label-black-rows.spec.ts`'s.
 *
 * Radix portals render nothing under `renderToStaticMarkup`, so
 * `ConfirmDialog` is stubbed to print its props — and to hand the spec its
 * `onConfirm`, which is how "nothing is written until the dialog's action"
 * is held: the operation spies stay empty through the render, and fill only
 * once that action runs.
 *
 * A click on a (hook-free) row is pressed by walking its element tree:
 * {@link press} finds a control by its accessible name and calls its
 * `onClick`, exactly as React would, without a DOM. A point's ⋯ menu is a
 * popover with state of its own, which that walk cannot open — its rows are
 * `pointMenuActions`, plain data the menu draws, run here directly. What the
 * console hands its rail is read by stubbing the rail ({@link railProps}).
 */

type Props = Record<string, unknown>;

const { P1, P2, P3, P4 } = FIXTURE_POINT_IDS;

/** Every call each server action received. */
function spies() {
  const calls: Record<string, unknown[][]> = {};
  const record =
    (name: string, answer: unknown) =>
    async (...args: unknown[]) => {
      (calls[name] ??= []).push(args);
      return answer;
    };
  const operations = {
    deleteShot: record("deleteShot", { ok: true, status: "deleted" }),
    restoreShot: record("restoreShot", { ok: true, status: "kept" }),
    deletePoint: record("deletePoint", { ok: true, status: "deleted" }),
    restorePoint: record("restorePoint", { ok: true, status: "unchanged" }),
    addShot: record("addShot", { error: "not in this spec" }),
    movePoint: record("movePoint", { error: "not in this spec" }),
    switchPlayers: record("switchPlayers", { error: "not in this spec" }),
    setChecked: record("setChecked", { ok: true, checkedAt: null }),
    resetShot: record("resetShot", { ok: true, status: "kept" }),
    resetPoint: record("resetPoint", { ok: true, status: "unchanged" }),
    setGameServer: record("setGameServer", { ok: true, points: [] }),
    setGameType: record("setGameType", { ok: true, points: [] }),
    insertPoint: record("insertPoint", { error: "not in this spec" }),
  };
  return { calls, operations };
}

const SAVES = {
  onSaveShot: async () => ({ ok: true, status: "edited" }),
  onSavePoint: async () => ({ ok: true, status: "edited" }),
};

/** The dialog props the stub saw, newest last. */
let dialogs: Props[] = [];

function PrintProps(props: Props) {
  dialogs.push(props);
  const printable = Object.fromEntries(
    Object.entries(props).filter(
      ([key, v]) => typeof v !== "function" && key !== "children",
    ),
  );
  return React.createElement(
    "pre",
    { "data-confirm": "" },
    JSON.stringify(printable),
  );
}

function loader() {
  return createLoader({
    stubs: { "@/components/ui/confirm-dialog": { ConfirmDialog: PrintProps } },
  });
}

function renderConsole(props: Props): string {
  dialogs = [];
  const { LabelConsole } = loader().load(
    "src/components/admin/labels/label-console.tsx",
  ) as { LabelConsole: React.ComponentType<Props> };
  return renderToStaticMarkup(
    React.createElement(LabelConsole, {
      session: labelSessionFixture(),
      video: null as LabelVideo | null,
      ...props,
    }),
  );
}

function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** The markup after the element carrying `attr`'s opening tag. */
function after(html: string, attr: string): string {
  const at = html.indexOf(attr);
  expect(at, attr).toBeGreaterThan(-1);
  return html.slice(html.indexOf(">", at) + 1);
}

function count(html: string, pattern: RegExp): number {
  return html.match(pattern)?.length ?? 0;
}

// ── A tiny element walker for a stateless row ─────────────────────────────

type Element = React.ReactElement<Props & { children?: React.ReactNode }>;

/**
 * Expand `node` into host elements, calling function components as React
 * would. A component that needs hooks (a cell editor, a tooltip root, the
 * move menu) cannot run outside a render, so its children are walked in its
 * place — which is where the controls it wraps live.
 */
function hostElements(node: React.ReactNode, out: Element[] = []): Element[] {
  if (node === null || node === undefined || typeof node === "boolean") {
    return out;
  }
  if (Array.isArray(node)) {
    for (const child of node) hostElements(child, out);
    return out;
  }
  if (!React.isValidElement(node)) return out;
  const element = node as Element;
  if (typeof element.type === "function") {
    let rendered: React.ReactNode;
    // React reports the refused hook call on console.error before it throws.
    const error = console.error;
    console.error = () => {};
    try {
      rendered = (element.type as (p: Props) => React.ReactNode)(element.props);
    } catch {
      return hostElements(element.props.children, out);
    } finally {
      console.error = error;
    }
    return hostElements(rendered, out);
  }
  out.push(element);
  return hostElements(element.props.children, out);
}

function press(tree: React.ReactNode, name: string) {
  const control = hostElements(tree).find(
    (el) =>
      el.props["aria-label"] === name ||
      (typeof el.type === "string" &&
        el.type === "button" &&
        textOf(el.props.children) === name),
  );
  expect(control, `a control named "${name}"`).toBeDefined();
  (control!.props.onClick as (event: unknown) => void)({
    stopPropagation() {},
    preventDefault() {},
  });
}

function textOf(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("").trim();
  if (React.isValidElement(node)) {
    const el = node as Element;
    if (el.type === "kbd" || el.props["aria-hidden"] === "true") return "";
    return textOf(el.props.children);
  }
  return "";
}

/** Row operations that only record what they were asked. */
function askSpies() {
  const asked: Record<string, unknown[][]> = {};
  const ask =
    (name: string) =>
    (...args: unknown[]) => {
      (asked[name] ??= []).push(args);
    };
  const operations = {
    onAskDeleteShot: ask("onAskDeleteShot"),
    onAskDeletePoint: ask("onAskDeletePoint"),
    onRestoreShot: ask("onRestoreShot"),
    onRestorePoint: ask("onRestorePoint"),
    onMovePoint: ask("onMovePoint"),
    onSetChecked: ask("onSetChecked"),
    onAddShot: ask("onAddShot"),
    onAskResetShot: ask("onAskResetShot"),
    onAskResetPoint: ask("onAskResetPoint"),
    onInsertPoint: ask("onInsertPoint"),
    onSwitchPlayers: ask("onSwitchPlayers"),
  };
  return { asked, operations };
}

/**
 * The rail's row for point `pointId` (`BlackPointRow`, hook-free) as an
 * element tree, with row operations that record what they were asked.
 */
function pointRowTree(pointId: string) {
  const { asked, operations } = askSpies();
  const { BlackPointRow } = loader().load(
    "src/components/admin/labels/label-black-point-row.tsx",
  ) as { BlackPointRow: (p: Props) => React.ReactNode };
  const session: LabelSession = labelSessionFixture();
  const scores = labelScores(session.points, session.adScoring).points;
  const tree = BlackPointRow({
    point: session.points.find((point) => point.id === pointId),
    open: false,
    playing: false,
    score: scores.get(pointId)?.scoreBefore ?? null,
    edit: {
      editable: true,
      names: NAMES,
      selectedShotId: null,
      operations,
      openTombstoneIds: new Set<string>(),
      points: session.points,
      scores,
      playingShotId: null,
    },
  });
  return { tree, asked };
}

/**
 * What the console hands its points rail: the console rendered with
 * `LabelBlackRail` stubbed to keep its props — the row operations, the game
 * menus' callbacks and the autosaves, each the console's own.
 */
function railProps(props: Props): Props {
  let rail: Props = {};
  dialogs = [];
  const { LabelConsole } = createLoader({
    stubs: {
      "@/components/ui/confirm-dialog": { ConfirmDialog: PrintProps },
      "@/components/admin/labels/label-black-rail": {
        LabelBlackRail: (railGiven: Props) => {
          rail = railGiven;
          return null;
        },
      },
    },
  }).load("src/components/admin/labels/label-console.tsx") as {
    LabelConsole: React.ComponentType<Props>;
  };
  renderToStaticMarkup(
    React.createElement(LabelConsole, {
      session: labelSessionFixture(),
      video: null,
      ...props,
    }),
  );
  return rail;
}

const NAMES = { p1: "Lee", p2: "Vargas" };

type MenuActions = {
  addAbove: () => void;
  addBelow: () => void;
  move: { label: string; description?: string; run: () => void }[];
  switchPlayers: {
    description: string;
    contradicts: boolean;
    run: () => void;
  } | null;
  reset: (() => void) | null;
  remove: () => void;
};

/** What point `pointId`'s ⋯ menu offers, against the fixture session. */
function menuActions(
  pointId: string,
  operations: Props,
  session: LabelSession = labelSessionFixture(),
): MenuActions {
  const { pointMenuActions } = loader().load(
    "src/components/admin/labels/label-point-menu.tsx",
  ) as {
    pointMenuActions: (
      point: unknown,
      context: unknown,
      operations: unknown,
    ) => MenuActions;
  };
  return pointMenuActions(
    session.points.find((point) => point.id === pointId),
    { points: session.points, names: NAMES },
    operations,
  );
}

// ── Add point above / below ────────────────────────────────────────────────

test.describe("add point above / below", () => {
  test("every live point's menu offers both, each asking for the insert on its side", () => {
    const { asked, operations } = askSpies();
    for (const pointId of [P1, P2, P4]) {
      const actions = menuActions(pointId, operations);
      actions.addAbove();
      actions.addBelow();
    }
    expect(asked).toEqual({
      onInsertPoint: [
        [P1, "before"],
        [P1, "after"],
        [P2, "before"],
        [P2, "after"],
        [P4, "before"],
        [P4, "after"],
      ],
    });
  });

  test("the menu draws them first, before Move to game…, with a glyph each; a read-only console has no menu", () => {
    const source = readFileSync(
      "src/components/admin/labels/label-point-menu.tsx",
      "utf8",
    );
    const above = source.indexOf('label="Add point above"');
    const below = source.indexOf('label="Add point below"');
    const move = source.indexOf('label="Move to game…"');
    expect(above).toBeGreaterThan(-1);
    expect(above).toBeLessThan(below);
    expect(below).toBeLessThan(move);
    expect(source).toContain("ArrowUpToLine");
    expect(source).toContain("ArrowDownToLine");
    // Not behind the marks: the menu asks on every session, so the items
    // do not read `marksEnabled`.
    expect(source).not.toContain("marksEnabled");

    const { operations } = spies();
    const editable = renderConsole({
      ...SAVES,
      operations,
      initialExpandedPointId: P1,
    });
    expect(count(editable, /data-point-menu/g)).toBe(3);
    const complete = { ...labelSessionFixture(), status: "complete" as const };
    for (const readOnly of [
      renderConsole({ initialExpandedPointId: P1 }),
      renderConsole({ ...SAVES, operations, session: complete }),
    ]) {
      expect(readOnly).not.toContain("data-point-menu");
      expect(readOnly).not.toContain("Point 1 actions");
    }
  });

  test("the console plans the slot on the client and calls the action with the position", async () => {
    const { calls, operations } = spies();
    const session = labelSessionFixture();
    const rail = railProps({ session, ...SAVES, operations });
    const rows = rail.operations as {
      onInsertPoint: (id: string, position?: string) => void;
    };
    rows.onInsertPoint(P4, "after");
    await Promise.resolve();
    expect(calls.insertPoint).toEqual([[session.id, P4, "after"]]);
    // No position is "before" — what T40's suggestion slot asks for.
    rows.onInsertPoint(P2);
    await Promise.resolve();
    expect(calls.insertPoint?.at(-1)).toEqual([session.id, P2, "before"]);
    // A tombstone is no anchor: refused on the client, nothing sent.
    rows.onInsertPoint(P3, "after");
    await Promise.resolve();
    expect(calls.insertPoint).toHaveLength(2);
  });
});

// ── Delete asks first ──────────────────────────────────────────────────────

test.describe("delete", () => {
  test("every live stroke carries a ✕, every live point a ⋯, and no dialog is open", () => {
    const { operations } = spies();
    const html = renderConsole({
      ...SAVES,
      operations,
      initialExpandedPointId: P1,
    });
    for (const name of [
      "Point 1 actions",
      "Point 2 actions",
      "Point 4 actions",
      "Delete shot 1",
      "Delete shot 2",
      "Delete shot 3",
    ]) {
      expect(html).toContain(`aria-label="${name}"`);
    }
    expect(count(html, /data-point-menu/g)).toBe(3);
    expect(count(html, /data-delete-row/g)).toBe(3);
    expect(html).not.toContain("data-confirm");
  });

  test("the ⋯ menu's Delete only asks: the request goes up and nothing is deleted", () => {
    // (A stroke's ✕ doing the same is label-black-rows.spec.ts's.)
    const { asked, operations } = askSpies();
    menuActions(P4, operations).remove();
    expect(asked).toEqual({ onAskDeletePoint: [[P4]] });
  });

  test("the confirm asks, and the write waits for its action", async () => {
    const { calls, operations } = spies();
    const html = renderConsole({
      ...SAVES,
      operations,
      initialConfirm: {
        kind: "delete-point",
        pointId: P4,
        pointNumber: 4,
        shotCount: 0,
      },
    });
    const dialog = dialogs.at(-1)!;
    expect(dialog).toMatchObject({
      open: true,
      title: "Delete point 4?",
      confirmLabel: "Delete point",
      tone: "danger",
    });
    expect(String(dialog.description)).toMatch(/^This deletes the row/);
    expect(html).toContain("data-confirm");
    expect(calls).toEqual({});

    (dialog.onConfirm as () => void)();
    await Promise.resolve();
    expect(calls).toEqual({ deletePoint: [[P4]] });
  });

  test("a shot delete asks why, and writes nothing without a reason", () => {
    const confirm = {
      kind: "delete-shot",
      shotId: "s-return",
      shotNumber: 2,
      pointNumber: 1,
    } as const;
    const { LabelConfirmDialog } = loader().load(
      "src/components/admin/labels/label-confirm-dialog.tsx",
    ) as { LabelConfirmDialog: React.ComponentType<Props> };
    const confirmed: unknown[][] = [];
    const draw = (initialReason: string | null) => {
      dialogs = [];
      const html = renderToStaticMarkup(
        React.createElement(LabelConfirmDialog, {
          confirm,
          names: { p1: "Lee", p2: "Vargas" },
          onCancel: () => {},
          onConfirm: (...args: unknown[]) => confirmed.push(args),
          initialReason,
        }),
      );
      return { html, dialog: dialogs.at(-1)! };
    };

    const { dialog } = draw(null);
    expect(dialog).toMatchObject({
      title: "Delete shot 2?",
      confirmLabel: "Delete shot",
      tone: "danger",
    });
    expect(String(dialog.description)).toBe(
      "It comes off point 1 and stops counting in the rally. You can undo this from the point's shots.",
    );
    // The reason picker: the five reasons, as a radio group.
    const picker = renderToStaticMarkup(dialog.children as React.ReactElement);
    expect(picker).toContain('role="radiogroup"');
    expect(count(picker, /role="radio"/g)).toBe(5);
    expect(text(picker)).toBe(
      "Why are you deleting it? Hit after a fault Hit after the point ended Not a shot Counted twice Something else",
    );

    (dialog.onConfirm as () => void)();
    expect(confirmed).toEqual([]);

    (draw("not_a_stroke").dialog.onConfirm as () => void)();
    expect(confirmed).toEqual([[confirm, "not_a_stroke"]]);
  });
});

// ── Tombstones ─────────────────────────────────────────────────────────────

test.describe("tombstones", () => {
  test("a tombstone is one line in the rail, with Undo where the console can write", () => {
    const { operations } = spies();
    const html = renderConsole({
      ...SAVES,
      operations,
      initialExpandedPointId: P1,
    });
    // The deleted stroke, inside its point's well, and the deleted point.
    const shot = after(html, 'data-tombstone-id="s-phantom"');
    expect(text(shot.slice(0, shot.indexOf("</div>")))).toBe(
      "– Deleted shot · 41:13.6 · Not a shot Undo",
    );
    const point = after(html, `data-tombstone-id="${P3}"`);
    expect(text(point.slice(0, point.indexOf("</div>")))).toMatch(
      /^– Deleted point .*Undo$/,
    );
    expect(html).toContain('aria-label="Undo delete shot at 41:13.6"');
    expect(html).toContain('aria-label="Undo delete point 3"');
    expect(count(html, /data-undo-delete/g)).toBe(2);
    // Nothing to expand: no marker button, no ghost row.
    expect(html).not.toMatch(/data-tombstone-id="[^"]*"[^>]*aria-expanded/);
    expect(html).not.toContain("data-ghost-id");
  });

  test("read-only, a tombstone still shows — without Undo", () => {
    const html = renderConsole({
      initialExpandedPointId: P1,
      initialOpenTombstoneIds: ["s-phantom"],
    });
    expect(html).toContain('data-tombstone-id="s-phantom"');
    expect(html).toContain(`data-tombstone-id="${P3}"`);
    expect(text(html)).toContain("Deleted shot · 41:13.6 · Not a shot");
    expect(text(html)).toContain("Deleted point");
    expect(html).not.toContain("Undo");
    expect(html).not.toContain("data-delete-row");
  });
});

// ── Move ───────────────────────────────────────────────────────────────────

test.describe("move point", () => {
  test("the ⋯ menu offers the neighbouring games, where there is one", () => {
    const { operations, asked } = askSpies();
    // P1's neighbours share its game; P2 and P4 each have one to move to.
    expect(menuActions(P1, operations).move).toEqual([]);
    const from2 = menuActions(P2, operations).move;
    expect(from2.map((game) => [game.label, game.description])).toEqual([
      ["Set 1 · Game 2", "Vargas serving"],
    ]);
    expect(menuActions(P4, operations).move.map((game) => game.label)).toEqual([
      "Set 1 · Game 1",
    ]);

    // Picking one only asks: the console owns the "switch players?" confirm.
    from2[0].run();
    expect(asked).toEqual({
      onMovePoint: [[P2, { setNumber: 1, gameNumber: 2 }]],
    });
  });

  test('into a game someone else serves: "<player> is serving this game, switch players?"', async () => {
    const { calls, operations } = spies();
    renderConsole({
      ...SAVES,
      operations,
      initialConfirm: {
        kind: "move-point",
        pointId: P2,
        pointNumber: 2,
        to: { setNumber: 1, gameNumber: 2 },
        server: "p2",
        swaps: "shots-and-winner",
      },
    });
    const dialog = dialogs.at(-1)!;
    expect(dialog.title).toBe("Vargas is serving this game, switch players?");
    expect(dialog).toMatchObject({
      confirmLabel: "Switch players",
      tone: "primary",
      // P2 is Lee's ace: a yes flips the ace and the point to Vargas.
      description:
        "Point 2 moves to set 1, game 2, and Vargas becomes its server. Every shot in this point changes hands, and so does who won it.",
    });
    expect(calls).toEqual({});

    (dialog.onConfirm as () => void)();
    await Promise.resolve();
    expect(calls).toEqual({
      movePoint: [[P2, { setNumber: 1, gameNumber: 2 }, true]],
    });
  });

  test("the question's body says what a yes does: the players, or the server alone", () => {
    const { labelConfirmCopy } = loader().load(
      "src/components/admin/labels/label-confirm.ts",
    ) as {
      labelConfirmCopy: (
        confirm: Record<string, unknown>,
        names: Record<string, string>,
      ) => { title: string; description: string };
    };
    const ask = (swaps: string | null) =>
      labelConfirmCopy(
        {
          kind: "move-point",
          pointId: P2,
          pointNumber: 2,
          to: { setNumber: 1, gameNumber: 2 },
          server: "p2",
          swaps,
        },
        NAMES,
      );
    // The title is the same question either way.
    for (const swaps of ["shots-and-winner", "shots", null]) {
      expect(ask(swaps).title).toBe(
        "Vargas is serving this game, switch players?",
      );
    }
    expect(ask("shots-and-winner").description).toBe(
      "Point 2 moves to set 1, game 2, and Vargas becomes its server. Every shot in this point changes hands, and so does who won it.",
    );
    // A point with no winner yet: the shots alone change hands.
    expect(ask("shots").description).toBe(
      "Point 2 moves to set 1, game 2, and Vargas becomes its server. Every shot in this point changes hands.",
    );
    // Rows that already agree with the new server: only the server changes.
    expect(ask(null).description).toBe(
      "Point 2 moves to set 1, game 2, and Vargas becomes its server.",
    );
  });

  test("the console decides the question from the point's own strokes, and applies the swap to the rows it holds", () => {
    // The console cannot be re-rendered after a click under
    // `renderToStaticMarkup`, so the rows it would hold are the pure apply
    // it runs — over the fixture — and its wiring is read off the source.
    const { planPointMove, applyPointMove } = loader().load(
      "src/lib/services/labels/operations.ts",
    ) as {
      planPointMove: (
        point: unknown,
        to: unknown,
        server: unknown,
        switchServer: boolean,
      ) =>
        | { ok: true; write: Record<string, unknown>; shots: unknown[] }
        | { error: string };
      applyPointMove: (
        point: unknown,
        write: unknown,
      ) => Record<string, unknown>;
    };
    const { applyShotSwaps, moveSwapsPlayers } = loader().load(
      "src/lib/services/labels/player-swap.ts",
    ) as {
      applyShotSwaps: (points: unknown[], shots: unknown[]) => LabelPoint[];
      moveSwapsPlayers: (point: unknown, server: unknown) => boolean;
    };
    const session = labelSessionFixture();
    const p2 = session.points.find((p) => p.id === P2)!;
    expect(moveSwapsPlayers(p2, "p2")).toBe(true);
    const plan = planPointMove(p2, { setNumber: 1, gameNumber: 2 }, "p2", true);
    if ("error" in plan) throw new Error(plan.error);
    const rows = applyShotSwaps(
      session.points.map((p) =>
        p.id === P2 ? applyPointMove(p, plan.write) : p,
      ),
      plan.shots,
    );
    const moved = rows.find((p) => p.id === P2)!;
    expect(moved).toMatchObject({
      gameNumber: 2,
      server: "p2",
      winner: "p2",
      endedBy: "p2",
      status: "edited",
    });
    expect(moved.shots.map((s) => [s.id, s.hitter, s.status])).toEqual([
      ["s-ace", "p2", "edited"],
    ]);
    // Every other row stands.
    for (const id of [P1, P3, P4]) {
      expect(rows.find((p) => p.id === id)).toBe(
        session.points.find((p) => p.id === id),
      );
    }

    const source = readFileSync(
      "src/components/admin/labels/label-console.tsx",
      "utf8",
    );
    const requestMove = source.slice(
      source.indexOf("function requestMove("),
      source.indexOf("function movePoint("),
    );
    expect(requestMove).toContain("moveSwapsPlayers(point, server)");
    const movePoint = source.slice(
      source.indexOf("function movePoint("),
      source.indexOf("function runGameOperation("),
    );
    expect(movePoint).toContain("applyPointMove(p, plan.write)");
    expect(movePoint).toContain("plan.shots");
    expect(movePoint).toContain("result.shots");
    expect(movePoint).toContain("shotSwapsOf(before.shots)");
    expect(movePoint).not.toContain("syncEnding");
    const shiftStart = source.indexOf("function shiftGameOverflow(");
    const shift = source.slice(
      shiftStart,
      source.indexOf("\n  /**", shiftStart),
    );
    expect(shift).toContain("applyShotSwaps(");
    expect(shift).toContain("plan.shots");
    expect(shift).toContain("result.shots");
    expect(shift).not.toContain("syncEnding");
  });
});

// ── Switch players ─────────────────────────────────────────────────────────

test.describe("switch players", () => {
  const MENU = "src/components/admin/labels/label-point-menu.tsx";

  test("the ⋯ menu offers it on every live point with a hitter, saying what it does; not on a point with none", () => {
    const { operations, asked } = askSpies();
    // P2: Lee's ace, won by Lee — the shots and the winner change hands.
    const p2 = menuActions(P2, operations).switchPlayers;
    expect(p2).toMatchObject({
      description: "Every shot changes hands, and so does who won it",
      contradicts: false,
    });
    // P1 has a winner too; P4 has none, so only the shots are named.
    expect(menuActions(P1, operations).switchPlayers?.description).toBe(
      "Every shot changes hands, and so does who won it",
    );
    expect(menuActions(P4, operations).switchPlayers?.description).toBe(
      "Every shot changes hands",
    );
    // Picking it asks the console, which plans and writes.
    p2!.run();
    expect(asked).toEqual({ onSwitchPlayers: [[P2]] });

    // No stroke naming a hitter: not offered.
    const session = labelSessionFixture();
    session.points = session.points.map((point) =>
      point.id === P2
        ? {
            ...point,
            shots: point.shots.map((shot) => ({ ...shot, hitter: null })),
          }
        : point,
    );
    expect(menuActions(P2, operations, session).switchPlayers).toBeNull();
  });

  test("on a point whose rows contradict its server it comes first, and says who hits the serve", () => {
    // P2 moved under Vargas before the swap rule existed: server p2, the
    // ace still Lee's.
    const session = labelSessionFixture();
    session.points = session.points.map((point) =>
      point.id === P2 ? { ...point, server: "p2" as const } : point,
    );
    const { operations } = askSpies();
    expect(menuActions(P2, operations, session).switchPlayers).toMatchObject({
      description: "Vargas serves this game, but Lee hits the serve here",
      contradicts: true,
    });

    // The menu draws a contradicting point's item before everything else,
    // and an agreeing one's after the Combine items, before Move to game….
    const source = readFileSync(MENU, "utf8");
    const first = source.indexOf("{switchFirst ? (");
    const above = source.indexOf('label="Add point above"');
    const combineBelow = source.indexOf('label="Combine with point below"');
    const after = source.indexOf("{switchFirst ? null : switchItem}");
    const move = source.indexOf('label="Move to game…"');
    expect(first).toBeGreaterThan(-1);
    expect(first).toBeLessThan(above);
    expect(combineBelow).toBeLessThan(after);
    expect(after).toBeLessThan(move);
    expect(source).toContain('label="Switch players"');
    expect(source).toContain("ArrowLeftRight");
    // One menu serves both of the rail's grounds.
    expect(source).toContain('tone === "dark"');
  });

  test("read-only, there is no menu to offer it", () => {
    const html = renderConsole({ initialExpandedPointId: P2 });
    expect(html).not.toContain("data-point-menu");
    expect(html).not.toContain("Switch players");
  });

  test("the console plans the switch on the client, calls the action, and applies the flip to the rows it holds — never the ending", async () => {
    const { calls, operations } = spies();
    const rail = railProps({ ...SAVES, operations });
    const rows = rail.operations as { onSwitchPlayers: (id: string) => void };
    rows.onSwitchPlayers(P2);
    await Promise.resolve();
    expect(calls.switchPlayers).toEqual([[P2]]);
    // A tombstone is refused on the client: nothing sent.
    rows.onSwitchPlayers(P3);
    await Promise.resolve();
    expect(calls.switchPlayers).toHaveLength(1);

    const source = readFileSync(
      "src/components/admin/labels/label-console.tsx",
      "utf8",
    );
    const start = source.indexOf("function switchPlayers(");
    expect(start).toBeGreaterThan(-1);
    const fn = source.slice(start, source.indexOf("\n  /**", start));
    expect(fn).toContain("planPlayerSwitch(before)");
    expect(fn).toContain("applyPlayerSwitch(p, plan.write)");
    expect(fn).toContain("plan.shots");
    expect(fn).toContain("result.shots");
    expect(fn).toContain("shotSwapsOf(before.shots)");
    expect(fn).not.toContain("syncEnding");
    expect(fn).not.toContain("server");
    expect(source).toContain("onSwitchPlayers: switchPlayers,");
  });
});

// ── A let, a non-point, and counting it again ──────────────────────────────

test.describe("mark as a let / not a point", () => {
  const MENU = "src/components/admin/labels/label-point-menu.tsx";

  type LetActions = {
    markLet: (() => void) | null;
    markNotAPoint: (() => void) | null;
    countPoint: (() => void) | null;
  };

  /** Point `pointId`'s menu over `session`, and every patch it sent. */
  function letMenu(pointId: string, session = labelSessionFixture()) {
    const patches: unknown[][] = [];
    const { operations, asked } = askSpies();
    const { pointMenuActions } = loader().load(MENU) as {
      pointMenuActions: (
        point: unknown,
        context: unknown,
        operations: unknown,
      ) => LetActions;
    };
    const actions = pointMenuActions(
      session.points.find((point) => point.id === pointId),
      {
        points: session.points,
        names: NAMES,
        onPatchPoint: (...args: unknown[]) => patches.push(args),
      },
      operations,
    );
    return { actions, patches, asked };
  }

  /** The fixture with point `pointId` changed. */
  function sessionWith(pointId: string, fields: Props): LabelSession {
    const session = labelSessionFixture();
    session.points = session.points.map((point) =>
      point.id === pointId ? { ...point, ...fields } : point,
    );
    return session;
  }

  test("a played point offers both, each one point patch of the ending alone", () => {
    for (const pointId of [P1, P2, P4]) {
      const { actions, patches, asked } = letMenu(pointId);
      expect(actions.countPoint).toBeNull();
      actions.markLet!();
      actions.markNotAPoint!();
      // The winner is not in either patch: the point keeps it.
      expect(patches).toEqual([
        [pointId, { ending: "let_replayed" }],
        [pointId, { ending: "not_a_point" }],
      ]);
      // The point autosave only — no operation is asked for.
      expect(asked).toEqual({});
    }
  });

  test("an added point with no shots and no winner is offered them too", () => {
    const blank = sessionWith(P4, {
      status: "added",
      seed: null,
      winner: null,
      ending: null,
      endedBy: null,
      shots: [],
    });
    const { actions, patches } = letMenu(P4, blank);
    actions.markLet!();
    expect(patches).toEqual([[P4, { ending: "let_replayed" }]]);
  });

  test("a let or a non-point shows only Count this point, read off its rows", () => {
    for (const ending of ["let_replayed", "not_a_point"]) {
      // Point 1 ends on Lee's forehand, out: an error by Lee, Vargas's
      // point — which the point already says, so the winner is left out.
      const held = letMenu(P1, sessionWith(P1, { ending }));
      expect(held.actions.markLet).toBeNull();
      expect(held.actions.markNotAPoint).toBeNull();
      held.actions.countPoint!();
      expect(held.patches).toEqual([[P1, { ending: "error", ended_by: "p1" }]]);
    }
  });

  test("when the rows settle a winner the point does not hold, the same patch carries it", () => {
    const { actions, patches } = letMenu(
      P1,
      sessionWith(P1, { ending: "let_replayed", winner: "p1" }),
    );
    actions.countPoint!();
    expect(patches).toEqual([
      [P1, { ending: "error", ended_by: "p1", winner: "p2" }],
    ]);
  });

  test("rows that say nothing fall back to the seeded ending, and to none without a seed", () => {
    // No live stroke: point 1 was seeded as Lee's winner.
    const seeded = letMenu(
      P1,
      sessionWith(P1, { ending: "let_replayed", shots: [] }),
    );
    seeded.actions.countPoint!();
    expect(seeded.patches).toEqual([
      [P1, { ending: "winner", ended_by: "p1" }],
    ]);

    const unseeded = letMenu(
      P1,
      sessionWith(P1, { ending: "not_a_point", shots: [], seed: null }),
    );
    unseeded.actions.countPoint!();
    expect(unseeded.patches).toEqual([[P1, { ending: null }]]);
  });

  test("the menu draws the group after Switch players and the Combine items, before Move to game…", () => {
    const source = readFileSync(MENU, "utf8");
    const at = (needle: string) => {
      const index = source.indexOf(needle);
      expect(index, needle).toBeGreaterThan(-1);
      return index;
    };
    const order = [
      at('label="Combine with point below"'),
      at("{switchFirst ? null : switchItem}"),
      at('label="Mark as a let"'),
      at('description="Replayed. The score skips it."'),
      at('label="Not a point"'),
      at('description="Not part of the match. The score skips it."'),
      at('label="Count this point"'),
      at('description="It was played. The score counts it again."'),
      at('label="Move to game…"'),
      at('label="Delete point"'),
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));
    for (const glyph of ["RotateCcw", "Ban", "Undo2"]) {
      expect(source).toContain(`<${glyph}`);
    }
  });

  test("read-only, there is no menu to offer them", () => {
    expect(renderConsole({ initialExpandedPointId: P1 })).not.toContain(
      "data-point-menu",
    );
  });
});

// ── Checked ────────────────────────────────────────────────────────────────

test.describe("mark point checked", () => {
  test("every live point carries its tick, pressed once checked, and the open point an Add shot", () => {
    // (The tick's paint is label-black-rows.spec.ts's.)
    const { operations } = spies();
    const html = renderConsole({
      ...SAVES,
      operations,
      initialExpandedPointId: P1,
    });
    expect(count(html, /data-check-row/g)).toBe(3);
    for (const [number, pressed] of [
      [1, false],
      [2, true],
      [4, false],
    ]) {
      expect(html).toMatch(
        new RegExp(
          `<button[^>]*data-check-row=""[^>]*aria-pressed="${pressed}"[^>]*aria-label="Point ${number} checked"`,
        ),
      );
    }
    expect(html).not.toMatch(/data-check-row=""[^>]*disabled/);
    // One Add shot, closing the open point's well.
    expect(count(html, /data-add-shot/g)).toBe(1);
    const well = after(html, `data-shots-well="${P1}"`);
    expect(text(after(well, "data-add-shot").split("</button>")[0])).toBe(
      "Add shot",
    );
  });

  test("the tick marks and unmarks through the console", () => {
    const unchecked = pointRowTree(P1);
    press(unchecked.tree, "Point 1 checked");
    expect(unchecked.asked).toEqual({ onSetChecked: [[P1, true]] });

    const checked = pointRowTree(P2);
    press(checked.tree, "Point 2 checked");
    expect(checked.asked).toEqual({ onSetChecked: [[P2, false]] });
  });

  test("without operations the tick cannot be pressed, and there is no Add shot or menu", () => {
    const html = renderConsole({ ...SAVES, initialExpandedPointId: P1 });
    expect(count(html, /data-check-row/g)).toBe(3);
    expect(count(html, /data-check-row=""[^>]*disabled=""/g)).toBe(3);
    expect(html).not.toContain("data-add-shot");
    expect(html).not.toContain("data-point-menu");
    expect(html).not.toContain("Move point");
  });
});

// ── Reset ──────────────────────────────────────────────────────────────────

test.describe("reset", () => {
  test("appears only on an edited row that has a seed", () => {
    const { operations } = spies();
    const html = renderConsole({
      ...SAVES,
      operations,
      initialExpandedPointId: P1,
    });
    // Point 1 and its return (shot 2) are edited with a seed; the kept
    // serve, the added stroke and the unchanged points are not.
    expect(html).toContain('aria-label="Reset point 1"');
    expect(html).toContain('aria-label="Reset shot 2"');
    // Each one's pencil is its Reset; the stroke's row offers it again
    // among its requests.
    expect(count(html, /data-reset-pencil/g)).toBe(2);
    expect(count(html, /data-reset-row/g)).toBe(1);
    expect(count(html, /aria-label="Reset point 1"/g)).toBe(1);
    expect(count(html, /aria-label="Reset shot 2"/g)).toBe(2);
    for (const name of [
      "Reset shot 1",
      "Reset shot 3",
      "Reset point 2",
      "Reset point 4",
    ]) {
      expect(html).not.toContain(`aria-label="${name}"`);
    }
  });

  test("no seed, no Reset — and none on a read-only console", () => {
    const { operations } = spies();
    const session = labelSessionFixture();
    const unseeded: LabelSession = {
      ...session,
      points: session.points.map((point) => ({
        ...point,
        seed: null,
        shots: point.shots.map((shot) => ({ ...shot, seed: null })),
      })),
    };
    const html = renderConsole({
      ...SAVES,
      operations,
      session: unseeded,
      initialExpandedPointId: P1,
    });
    expect(html).not.toContain("data-reset-row");
    expect(html).not.toContain("data-reset-pencil");
    expect(html).not.toMatch(/aria-label="Reset (shot|point) \d+"/);

    const readOnly = renderConsole({ initialExpandedPointId: P1 });
    expect(readOnly).not.toContain("data-reset-row");
    expect(readOnly).not.toContain("data-reset-pencil");
    expect(readOnly).not.toMatch(/aria-label="Reset (shot|point) \d+"/);
  });

  test("the ⋯ menu carries Reset too, on the same rows", () => {
    const { operations, asked } = askSpies();
    expect(menuActions(P2, operations).reset).toBeNull();
    expect(menuActions(P4, operations).reset).toBeNull();
    menuActions(P1, operations).reset?.();
    expect(asked).toEqual({ onAskResetPoint: [[P1]] });
  });

  test("the shot confirm asks, and the reset waits for its action", async () => {
    const { calls, operations } = spies();
    renderConsole({
      ...SAVES,
      operations,
      initialConfirm: {
        kind: "reset-shot",
        shotId: "s-return",
        shotNumber: 2,
        pointNumber: 1,
      },
    });
    const dialog = dialogs.at(-1)!;
    expect(dialog).toMatchObject({
      open: true,
      title: "Reset shot 2 to its original values?",
      confirmLabel: "Reset",
      tone: "primary",
    });
    expect(String(dialog.description)).toMatch(
      /^Your changes to this shot in point 1 are replaced/,
    );
    // No reason picker: a reset asks nothing more.
    expect(dialog.children ?? null).toBeNull();
    expect(calls).toEqual({});

    (dialog.onConfirm as () => void)();
    await Promise.resolve();
    expect(calls).toEqual({ resetShot: [["s-return"]] });
  });

  test("the point confirm asks, and the reset waits for its action", async () => {
    const { calls, operations } = spies();
    renderConsole({
      ...SAVES,
      operations,
      initialConfirm: { kind: "reset-point", pointId: P1, pointNumber: 1 },
    });
    const dialog = dialogs.at(-1)!;
    expect(dialog).toMatchObject({
      title: "Reset point 1 to its original values?",
      confirmLabel: "Reset",
      tone: "primary",
    });
    expect(String(dialog.description)).toContain(
      "Its shots, note and checked mark stay as they are.",
    );
    expect(calls).toEqual({});

    (dialog.onConfirm as () => void)();
    await Promise.resolve();
    expect(calls).toEqual({ resetPoint: [[P1]] });
  });
});

// ── Game bands (T14) ───────────────────────────────────────────────────────

type BandRow = {
  key: string;
  label: string;
  description?: string;
  chosen: boolean;
  run: () => void;
};

/** Each band's text, in the rail's order. */
function bands(html: string): string[] {
  return html
    .split(/(?=<div data-game-band=)/)
    .slice(1)
    .map((chunk) => {
      // The band is one flat <div>: label, spacer and meta are <span>s, with
      // no nested <div> and no server chip.
      const band = chunk.slice(0, chunk.indexOf("</div>"));
      expect(band).not.toContain("data-player-mark");
      return text(band);
    });
}

/** The points rail alone (`LabelBlackRail`), read-only, over `session`. */
function renderRail(session: LabelSession = labelSessionFixture()): string {
  const { LabelBlackRail } = loader().load(
    "src/components/admin/labels/label-black-rail.tsx",
  ) as { LabelBlackRail: React.ComponentType<Props> };
  return renderToStaticMarkup(
    React.createElement(LabelBlackRail, {
      player1Name: session.player1Name,
      player2Name: session.player2Name,
      checked: 0,
      total: 0,
      saveStatus: INITIAL_SAVE_STATUS,
      affordance: null,
      onFollow: () => {},
      points: session.points,
      scores: labelScores(session.points, session.adScoring),
      adScoring: session.adScoring,
      names: NAMES,
      expandedPointId: null,
    }),
  );
}

function bandModule() {
  return loader().load("src/components/admin/labels/label-game-band.tsx") as {
    gameBandModel: (band: unknown, points: unknown) => Props;
    gameBandMenus: (
      model: unknown,
      names: unknown,
      handlers: unknown,
    ) => { type: BandRow[]; server: BandRow[] };
  };
}

test.describe("game bands", () => {
  test("one band above the first live point of each game: set, game in set, games before, server", () => {
    const html = renderConsole({ ...SAVES, operations: spies().operations });
    expect(bands(html)).toEqual([
      "Set 1 · Game 1 0–0 · Lee serves",
      "Set 1 · Game 2 1–0 · Vargas serves",
    ]);
    // Above its game's first live point: band 1, points 1–2, band 2, point 4.
    const at = (attr: string) => html.indexOf(attr);
    expect(at('data-game-band="1-1"')).toBeLessThan(
      at(`data-point-id="${P1}"`),
    );
    expect(at(`data-point-id="${P2}"`)).toBeLessThan(
      at('data-game-band="1-2"'),
    );
    expect(at('data-game-band="1-2"')).toBeLessThan(
      at(`data-point-id="${P4}"`),
    );
  });

  test("the game's number is its rank in the set; a tiebreak and a match tiebreak say so", () => {
    const session = labelSessionFixture();
    const [first, second, , last] = session.points;
    session.points = [
      first,
      second,
      // The vendor's match-cumulative numbering: set 2 opens with game 7.
      { ...last, id: "p-set2", pointIndex: 3, setNumber: 2, gameNumber: 7 },
      {
        ...last,
        id: "p-tb",
        pointIndex: 4,
        setNumber: 2,
        gameNumber: 8,
        gameType: "tiebreak",
      },
      {
        ...last,
        id: "p-mtb",
        pointIndex: 5,
        setNumber: 3,
        gameNumber: 9,
        gameType: "match_tiebreak",
        server: "p1",
      },
    ];
    expect(bands(renderRail(session))).toEqual([
      "Set 1 · Game 1 0–0 · Lee serves",
      "Set 2 · Game 1 0–0 · Vargas serves",
      "Set 2 · Tiebreak 0–0 · Vargas serves first",
      "Match tiebreak 0–0 · Lee serves first",
    ]);
  });

  test("a game with only deleted points has no band", () => {
    const session = labelSessionFixture();
    session.points = session.points.map((point) =>
      point.id === P4 ? { ...point, status: "deleted" as const } : point,
    );
    const html = renderRail(session);
    expect(bands(html)).toEqual(["Set 1 · Game 1 0–0 · Lee serves"]);
    expect(html).not.toContain('data-game-band="1-2"');
  });

  test("the two menus: Game / Tiebreak / Match tiebreak, and both players", () => {
    const session = labelSessionFixture();
    const { gameBandModel, gameBandMenus } = bandModule();
    const asked: unknown[][] = [];
    const menus = gameBandMenus(
      gameBandModel(labelScores(session.points, true).games[0], session.points),
      NAMES,
      {
        onSetGameType: (...args: unknown[]) => asked.push(["type", ...args]),
        onSetGameServer: (...args: unknown[]) =>
          asked.push(["server", ...args]),
      },
    );
    expect(menus.type.map((row) => [row.label, row.chosen])).toEqual([
      ["Game", true],
      ["Tiebreak", false],
      ["Match tiebreak", false],
    ]);
    expect(menus.type[0].description).toBe("Points to 4, deuce at 40–40");
    expect(menus.server.map((row) => [row.label, row.chosen])).toEqual([
      ["Lee", true],
      ["Vargas", false],
    ]);
    expect(menus.server[0].description).toBeUndefined();
    expect(menus.server[1].description).toBe(
      "Changes the server on all 2 points and recalculates the scores after them",
    );

    // The chosen row asks for nothing; another hands the game to the console.
    menus.type[0].run();
    menus.server[0].run();
    expect(asked).toEqual([]);
    menus.type[1].run();
    menus.server[1].run();
    const game = { setNumber: 1, gameNumber: 1 };
    expect(asked).toEqual([
      ["type", game, "tiebreak"],
      ["server", game, "p2"],
    ]);
  });

  test("the menus' triggers render only when the console can write", () => {
    const { operations } = spies();
    const editable = renderConsole({ ...SAVES, operations });
    expect(count(editable, /data-game-menu="type"/g)).toBe(2);
    expect(count(editable, /data-game-menu="server"/g)).toBe(2);
    expect(editable).toContain('aria-label="Game type: Game 1"');
    expect(editable).toContain('aria-label="Server: Vargas"');

    const complete = { ...labelSessionFixture(), status: "complete" as const };
    for (const readOnly of [
      renderConsole({}),
      renderConsole({ ...SAVES }),
      renderConsole({ ...SAVES, operations, session: complete }),
    ]) {
      expect(readOnly).not.toContain("data-game-menu");
      // The band itself still reads.
      expect(bands(readOnly)).toHaveLength(2);
    }
  });

  test("the console plans the game on the client, then calls the action with the session", async () => {
    const { calls, operations } = spies();
    const session = labelSessionFixture();
    const table = railProps({ session, ...SAVES, operations });
    const game = { setNumber: 1, gameNumber: 1 };
    (table.onSetGameServer as (...args: unknown[]) => void)(game, "p2");
    (table.onSetGameType as (...args: unknown[]) => void)(game, "tiebreak");
    await Promise.resolve();
    expect(calls).toEqual({
      setGameServer: [[session.id, game, "p2"]],
      setGameType: [[session.id, game, "tiebreak"]],
    });

    // A game the planner refuses is never sent.
    (table.onSetGameServer as (...args: unknown[]) => void)(
      { setNumber: 9, gameNumber: 9 },
      "p1",
    );
    await Promise.resolve();
    expect(calls.setGameServer).toHaveLength(1);

    // Read-only, the rail is handed neither callback — nor any row operation.
    const frozen = railProps({ session, ...SAVES });
    expect(frozen.points).toBe(session.points);
    expect(frozen.onSetGameServer).toBeUndefined();
    expect(frozen.onSetGameType).toBeUndefined();
    expect(frozen.operations).toBeUndefined();
  });

  test("swapping a game's server re-derives the rows' scores and the band", () => {
    const session = labelSessionFixture();
    const plan = planGameServer(
      session.points,
      { setNumber: 1, gameNumber: 1 },
      "p2",
    );
    if (!("ok" in plan)) throw new Error(plan.error);
    const swapped = {
      ...session,
      points: applyGameWrites(session.points, plan.writes),
    };

    // Point 2 follows a point Vargas won: server-first, 0–15 with Lee
    // serving and 15–0 once Vargas is.
    const scoreOf = (s: LabelSession) =>
      labelScores(s.points, s.adScoring).points.get(P2)?.scoreBefore;
    expect(scoreOf(session)).toBe("0–15");
    expect(scoreOf(swapped)).toBe("15–0");

    const row = (html: string) =>
      text(after(html, `data-point-id="${P2}"`).split("data-point-id=")[0]);
    const before = renderRail(session);
    const afterSwap = renderRail(swapped);
    expect(row(before)).toContain("0–15");
    expect(row(before)).not.toContain("15–0");
    expect(row(afterSwap)).toContain("15–0");
    expect(row(afterSwap)).not.toContain("0–15");
    expect(bands(afterSwap)[0]).toBe("Set 1 · Game 1 0–0 · Vargas serves");
  });
});

// ── How it ended follows the shot rows (T28) ───────────────────────────────

test.describe("how it ended follows the shot rows", () => {
  /** Every write the console hands each autosave, in order. */
  function saveSpies(shotAnswer: unknown = { ok: true, status: "edited" }) {
    const shot: unknown[][] = [];
    const point: unknown[][] = [];
    return {
      shot,
      point,
      saves: {
        onSaveShot: async (...args: unknown[]) => {
          shot.push(args);
          return shotAnswer;
        },
        onSavePoint: async (...args: unknown[]) => {
          point.push(args);
          return { ok: true, status: "edited" };
        },
      },
    };
  }

  /**
   * The fixture with point 1 ending on Lee's winner: serve, return, and a
   * last forehand by Lee that stayed in.
   */
  function winnerSession(): LabelSession {
    const session = labelSessionFixture();
    const first = session.points[0];
    session.points[0] = {
      ...first,
      winner: "p1",
      ending: "winner",
      endedBy: "p1",
      shots: first.shots.map((shot) =>
        shot.id === "s-added" ? { ...shot, result: "in" } : shot,
      ),
    };
    return session;
  }

  /** What the console hands its rail, over the winner session. */
  const consoleTable = (props: Props): Props =>
    railProps({ session: winnerSession(), ...props });

  type PatchShot = (shotId: string, patch: Props) => Promise<void>;

  /** Let the point patch, sent once the shot write has settled, go out. */
  const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

  test("flipping the last stroke to out sends exactly one point patch", async () => {
    const { shot, point, saves } = saveSpies();
    const table = consoleTable({ ...saves, operations: spies().operations });
    await (table.onPatchShot as PatchShot)("s-added", { result: "out" });
    await settled();
    expect(shot).toEqual([["s-added", { result: "out" }]]);
    // Lee (p1) hit the last ball and was labelled the winner of the point; the
    // ball missed, so Vargas won, and the same patch says so.
    expect(point).toEqual([
      [P1, { ending: "error", ended_by: "p1", winner: "p2" }],
    ]);
  });

  test("the winner in that one patch is what moves the next point's score", async () => {
    const { point, saves } = saveSpies();
    const table = consoleTable({ ...saves, operations: spies().operations });
    await (table.onPatchShot as PatchShot)("s-added", { result: "out" });
    await settled();
    // The harness renders once, so the re-render is read through the scoreboard:
    // exactly one point write, and applying its patch re-scores the next point.
    expect(point).toHaveLength(1);
    const patch = point[0][1] as Record<string, unknown>;
    expect(patch).toHaveProperty("winner", "p2");

    const session = winnerSession();
    const scoreOf = (s: LabelSession) =>
      labelScores(s.points, s.adScoring).points.get(P2)?.scoreBefore;
    const patched = {
      ...session,
      points: session.points.map((row) =>
        row.id === P1 ? { ...row, winner: "p2" as const } : row,
      ),
    };
    expect(scoreOf(session)).toBe("15–0");
    expect(scoreOf(patched)).toBe("0–15");
  });

  test("a spin edit sends none", async () => {
    const { shot, point, saves } = saveSpies();
    const table = consoleTable({ ...saves, operations: spies().operations });
    await (table.onPatchShot as PatchShot)("s-added", { spin: "flat" });
    await settled();
    expect(shot).toEqual([["s-added", { spin: "flat" }]]);
    expect(point).toEqual([]);
  });

  test("a shot write that fails leaves the ending alone", async () => {
    const { shot, point, saves } = saveSpies({ error: "refused" });
    const table = consoleTable({ ...saves, operations: spies().operations });
    await (table.onPatchShot as PatchShot)("s-added", { result: "out" });
    await settled();
    expect(shot).toHaveLength(1);
    expect(point).toEqual([]);
  });

  test("Undo on the last stroke moves the ending back onto it, once", async () => {
    // Lee's last forehand is a tombstone: the point ends on Vargas's return,
    // which stayed in, so Vargas won it.
    const session = winnerSession();
    const first = session.points[0];
    session.points[0] = {
      ...first,
      winner: "p2",
      endedBy: "p2",
      shots: first.shots.map((shot) =>
        shot.id === "s-added"
          ? { ...shot, status: "deleted", statusBeforeDelete: "added" }
          : shot,
      ),
    };
    const { point, saves } = saveSpies();
    const { calls, operations } = spies();
    const table = consoleTable({ ...saves, operations, session });
    const rows = table.operations as Record<string, (id: string) => void>;

    rows.onRestoreShot("s-added");
    await settled();
    expect(calls.restoreShot).toEqual([["s-added"]]);
    // In, so Lee wins it with his forehand: the ending and the winner both move
    // back onto the restored stroke.
    expect(point).toEqual([
      [P1, { ending: "winner", ended_by: "p1", winner: "p1" }],
    ]);
  });

  test("a point reset is not a shot change: no ending patch follows it", async () => {
    const { point, saves } = saveSpies();
    const { calls, operations } = spies();
    consoleTable({
      ...saves,
      operations,
      initialConfirm: { kind: "reset-point", pointId: P1, pointNumber: 1 },
    });
    (dialogs.at(-1)!.onConfirm as () => void)();
    await settled();
    expect(calls).toEqual({ resetPoint: [[P1]] });
    expect(point).toEqual([]);
  });
});
