import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  applyGameWrites,
  planGameServer,
} from "@/lib/services/labels/game-operations";
import { labelScores } from "@/lib/services/labels/score";
import type { LabelSession, LabelVideo } from "@/lib/services/labels/session";
import {
  FIXTURE_POINT_IDS,
  labelSessionFixture,
} from "./fixtures/label-session";
import { createLoader } from "./fixtures/vm-modules";

/**
 * T7 in the console, rendered offline through `fixtures/vm-modules`: the ✕
 * (a stroke's) and the ⋯ menu (a point's) that ask before deleting, the
 * tombstone that expands to a ghost row with Undo, the move question, the
 * point's checked footer, and Reset on an edited row that has a seed.
 *
 * Radix portals render nothing under `renderToStaticMarkup`, so
 * `ConfirmDialog` is stubbed to print its props — and to hand the spec its
 * `onConfirm`, which is how "nothing is written until the dialog's action"
 * is held: the operation spies stay empty through the render, and fill only
 * once that action runs.
 *
 * Clicks in the (stateless) table are pressed by walking its element tree:
 * {@link press} finds a control by its accessible name and calls its
 * `onClick`, exactly as React would, without a DOM. A point's ⋯ menu is a
 * popover with state of its own, which that walk cannot open — its rows are
 * `pointMenuActions`, plain data the menu draws, run here directly.
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

// ── A tiny element walker for the stateless table ─────────────────────────

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

function tableTree(overrides: Props = {}) {
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
  };
  // The hook-free table: `LabelPointsTable` is this plus the scores' memo.
  const { LabelPointsTableView } = loader().load(
    "src/components/admin/labels/label-points-table.tsx",
  ) as { LabelPointsTableView: (p: Props) => React.ReactNode };
  const session: LabelSession = labelSessionFixture();
  const tree = LabelPointsTableView({
    points: session.points,
    scores: labelScores(session.points, session.adScoring).points,
    names: NAMES,
    expandedPointId: P1,
    editable: true,
    operations,
    ...overrides,
  });
  return { tree, asked, operations, session };
}

const NAMES = { p1: "Lee", p2: "Vargas" };

type MenuActions = {
  addAbove: () => void;
  addBelow: () => void;
  move: { label: string; description?: string; run: () => void }[];
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
    const { asked, operations } = tableTree();
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
    let table: Props = {};
    const { LabelConsole } = createLoader({
      stubs: {
        "@/components/ui/confirm-dialog": { ConfirmDialog: PrintProps },
        "@/components/admin/labels/label-points-table": {
          LabelPointsTable: (props: Props) => {
            table = props;
            return null;
          },
        },
      },
    }).load("src/components/admin/labels/label-console.tsx") as {
      LabelConsole: React.ComponentType<Props>;
    };
    const session = labelSessionFixture();
    renderToStaticMarkup(
      React.createElement(LabelConsole, {
        session,
        video: null,
        ...SAVES,
        operations,
      }),
    );
    const rows = table.operations as {
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

  test("delete only asks: the table hands the request up and deletes nothing", () => {
    const { tree, asked } = tableTree();
    press(tree, "Delete shot 2");
    expect(asked).toEqual({ onAskDeleteShot: [["s-return", 2, 1]] });

    const again = tableTree();
    menuActions(P4, again.operations).remove();
    expect(again.asked).toEqual({ onAskDeletePoint: [[P4]] });
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
    expect(String(dialog.description)).toContain(
      "This deletes the row from point 1.",
    );
    // The reason picker: the five reasons, as a radio group.
    const picker = renderToStaticMarkup(dialog.children as React.ReactElement);
    expect(picker).toContain('role="radiogroup"');
    expect(count(picker, /role="radio"/g)).toBe(5);
    expect(text(picker)).toBe(
      "Reason Dead ball after a fault Dead ball after the point Not a stroke Duplicate Other",
    );

    (dialog.onConfirm as () => void)();
    expect(confirmed).toEqual([]);

    (draw("not_a_stroke").dialog.onConfirm as () => void)();
    expect(confirmed).toEqual([[confirm, "not_a_stroke"]]);
  });
});

// ── Tombstones ─────────────────────────────────────────────────────────────

test.describe("tombstones", () => {
  test("the marker expands to a struck-through ghost row with Undo", () => {
    const { operations } = spies();
    const closed = renderConsole({
      ...SAVES,
      operations,
      initialExpandedPointId: P1,
    });
    expect(closed).toMatch(
      /data-tombstone-id="s-phantom"[^>]*>\s*<button[^>]*aria-expanded="false"/,
    );
    expect(closed).not.toContain("data-ghost-id");

    const open = renderConsole({
      ...SAVES,
      operations,
      initialExpandedPointId: P1,
      initialOpenTombstoneIds: ["s-phantom", P3],
    });
    expect(open).toMatch(
      /data-tombstone-id="s-phantom"[^>]*>\s*<button[^>]*aria-expanded="true"/,
    );
    const ghostShot = after(open, 'data-ghost-id="s-phantom"');
    expect(text(ghostShot)).toMatch(
      /^– 41:13\.6 Lee Forehand — — — — — Not a stroke Undo/,
    );
    expect(open).toMatch(
      /data-ghost-id="s-phantom"[^>]*>(?:(?!data-row=)[\s\S])*line-through/,
    );
    expect(open).toContain('aria-label="Undo delete shot at 41:13.6"');

    const ghostPoint = after(open, `data-ghost-id="${P3}"`);
    // No winner, no number, no time, (no score), the ending, no last shot,
    // a rally of 0, no note — then Undo, in the Status column.
    expect(text(ghostPoint)).toMatch(/^— – — Let, replayed — 0 — Undo/);
    expect(open).toContain('aria-label="Undo delete point 3"');
  });

  test("Undo restores, from the table's request", () => {
    const { tree, asked } = tableTree({
      openTombstoneIds: new Set(["s-phantom", P3]),
    });
    press(tree, "Undo delete shot at 41:13.6");
    press(tree, "Undo delete point 3");
    expect(asked).toEqual({
      onRestoreShot: [["s-phantom"]],
      onRestorePoint: [[P3]],
    });
  });

  test("read-only, a ghost row still shows — without Undo", () => {
    const html = renderConsole({
      initialExpandedPointId: P1,
      initialOpenTombstoneIds: ["s-phantom"],
    });
    expect(html).toContain('data-ghost-id="s-phantom"');
    expect(html).not.toContain("Undo");
    expect(html).not.toContain("data-delete-row");
  });
});

// ── Move ───────────────────────────────────────────────────────────────────

test.describe("move point", () => {
  test("the ⋯ menu offers the neighbouring games, where there is one", () => {
    const { operations, asked } = tableTree();
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
      },
    });
    const dialog = dialogs.at(-1)!;
    expect(dialog.title).toBe("Vargas is serving this game, switch players?");
    expect(dialog).toMatchObject({
      confirmLabel: "Switch players",
      tone: "primary",
    });
    expect(calls).toEqual({});

    (dialog.onConfirm as () => void)();
    await Promise.resolve();
    expect(calls).toEqual({
      movePoint: [[P2, { setNumber: 1, gameNumber: 2 }, true]],
    });
  });
});

// ── Checked ────────────────────────────────────────────────────────────────

test.describe("mark point checked", () => {
  test("an unchecked open point offers the primary, with its ↵", () => {
    const { operations } = spies();
    const html = renderConsole({
      ...SAVES,
      operations,
      initialExpandedPointId: P1,
    });
    const footer = after(html, `data-point-footer="${P1}"`);
    expect(html).toMatch(
      /<button[^>]*data-checked-state="unchecked"[^>]*>Mark point checked<kbd[^>]*>↵<\/kbd>/,
    );
    expect(text(footer)).toMatch(/^Mark point checked ↵ Add shot/);
  });

  test("a checked one reads ✓ Point checked · Undo", () => {
    const { operations } = spies();
    const html = renderConsole({
      ...SAVES,
      operations,
      initialExpandedPointId: P2,
    });
    const footer = after(html, `data-point-footer="${P2}"`);
    expect(html).toContain('data-checked-state="checked"');
    expect(text(footer)).toMatch(/^Point checked Undo Add shot/);
    expect(html).not.toContain("Mark point checked");
  });

  test("the footer marks, unmarks and adds through the console", () => {
    const unchecked = tableTree();
    press(unchecked.tree, "Mark point checked");
    press(unchecked.tree, "Add shot");
    expect(unchecked.asked).toEqual({
      onSetChecked: [[P1, true]],
      onAddShot: [[P1, null]],
    });

    const checked = tableTree({ expandedPointId: P2 });
    press(checked.tree, "Undo point 2 checked");
    expect(checked.asked).toEqual({ onSetChecked: [[P2, false]] });

    const selected = tableTree({ selectedShotId: "s-return" });
    press(selected.tree, "Add shot after shot 2");
    expect(selected.asked).toEqual({ onAddShot: [[P1, "s-return"]] });
  });

  test("without operations there is no footer", () => {
    const html = renderConsole({ ...SAVES, initialExpandedPointId: P1 });
    expect(html).not.toContain("data-point-footer");
    expect(html).not.toContain("Mark point checked");
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
    expect(count(html, /data-reset-row/g)).toBe(2);
    for (const name of [
      "Reset shot 1",
      "Reset shot 3",
      "Reset point 2",
      "Reset point 4",
    ]) {
      expect(html).not.toContain(`aria-label="${name}"`);
    }
    // Revealed on the open point and hidden (hover/focus) on the unselected
    // stroke, like the row's ✕.
    expect(html).toMatch(
      /<button[^>]*aria-label="Reset point 1"[^>]*class="[^"]*opacity-100/,
    );
    expect(html).toMatch(
      /<button[^>]*aria-label="Reset shot 2"[^>]*class="[^"]*opacity-0/,
    );
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

    const readOnly = renderConsole({ initialExpandedPointId: P1 });
    expect(readOnly).not.toContain("data-reset-row");
  });

  test("Reset only asks: the table hands the request up", () => {
    const { tree, asked } = tableTree();
    press(tree, "Reset shot 2");
    press(tree, "Reset point 1");
    expect(asked).toEqual({
      onAskResetShot: [["s-return", 2, 1]],
      onAskResetPoint: [[P1]],
    });
  });

  test("the ⋯ menu carries Reset too, on the same rows", () => {
    const { operations, asked } = tableTree();
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

/** Each band's text, in table order. */
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

function renderTable(props: Props): string {
  const { LabelPointsTableView } = loader().load(
    "src/components/admin/labels/label-points-table.tsx",
  ) as { LabelPointsTableView: React.ComponentType<Props> };
  const session = (props.session as LabelSession) ?? labelSessionFixture();
  const scores = labelScores(session.points, session.adScoring);
  return renderToStaticMarkup(
    React.createElement(LabelPointsTableView, {
      points: session.points,
      scores: scores.points,
      games: scores.games,
      names: NAMES,
      expandedPointId: null,
      ...props,
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
    expect(bands(renderTable({ session }))).toEqual([
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
    const html = renderTable({ session });
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
    let table: Props = {};
    const { LabelConsole } = createLoader({
      stubs: {
        "@/components/ui/confirm-dialog": { ConfirmDialog: PrintProps },
        "@/components/admin/labels/label-points-table": {
          LabelPointsTable: (props: Props) => {
            table = props;
            return null;
          },
        },
      },
    }).load("src/components/admin/labels/label-console.tsx") as {
      LabelConsole: React.ComponentType<Props>;
    };
    const session = labelSessionFixture();
    renderToStaticMarkup(
      React.createElement(LabelConsole, {
        session,
        video: null,
        ...SAVES,
        operations,
      }),
    );
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

    // Read-only, the table is handed neither callback.
    renderToStaticMarkup(
      React.createElement(LabelConsole, { session, video: null, ...SAVES }),
    );
    expect(table.onSetGameServer).toBeUndefined();
    expect(table.onSetGameType).toBeUndefined();
  });

  test("swapping a game's server re-derives the Score column and the band", () => {
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
    const before = renderTable({ session });
    const afterSwap = renderTable({ session: swapped });
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

  function consoleTable(props: Props): Props {
    let table: Props = {};
    const { LabelConsole } = createLoader({
      stubs: {
        "@/components/ui/confirm-dialog": { ConfirmDialog: PrintProps },
        "@/components/admin/labels/label-points-table": {
          LabelPointsTable: (tableProps: Props) => {
            table = tableProps;
            return null;
          },
        },
      },
    }).load("src/components/admin/labels/label-console.tsx") as {
      LabelConsole: React.ComponentType<Props>;
    };
    renderToStaticMarkup(
      React.createElement(LabelConsole, {
        session: winnerSession(),
        video: null,
        ...props,
      }),
    );
    return table;
  }

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
