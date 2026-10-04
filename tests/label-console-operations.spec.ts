import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

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
      /^– 41:13\.6 Lee Forehand — — — Not a stroke Undo/,
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
