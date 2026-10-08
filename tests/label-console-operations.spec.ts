import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { INITIAL_SAVE_STATUS } from "@/components/admin/labels/save-status";
import {
  applyGameWrites,
  planGameServer,
} from "@/lib/services/labels/game-operations";
import { applyShotSwaps } from "@/lib/services/labels/player-swap";
import { labelScores } from "@/lib/services/labels/score";
import type { LabelSession, LabelVideo } from "@/lib/services/labels/session";
import { count, text } from "./fixtures/html-probe";
import {
  FIXTURE_POINT_IDS,
  labelSessionFixture,
} from "./fixtures/label-session";
import { findByProp } from "./fixtures/react-tree";
import { createLoader, renderFunction } from "./fixtures/vm-modules";

/**
 * The console's operations, rendered offline. `ConfirmDialog` is stubbed to print its props and hand over
 * its `onConfirm`; a point's ⋯ menu is read as `pointMenuActions`; the rail's props by stubbing the rail.
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
    removeShotsAfter: record("removeShotsAfter", { ok: true, removed: [] }),
    restoreShots: record("restoreShots", { ok: true, restored: [] }),
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

/** The markup after the element carrying `attr`'s opening tag. */
function after(html: string, attr: string): string {
  const at = html.indexOf(attr);
  expect(at, attr).toBeGreaterThan(-1);
  return html.slice(html.indexOf(">", at) + 1);
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
  );
  const session: LabelSession = labelSessionFixture();
  const scores = labelScores(session.points, session.adScoring).points;
  const tree = renderFunction<Props>(BlackPointRow)({
    point: session.points.find((point) => point.id === pointId),
    open: false,
    playing: false,
    score: scores.get(pointId)?.scoreBefore ?? null,
    edit: {
      editable: true,
      names: NAMES,
      selectedShotId: null,
      operations,
      points: session.points,
      scores,
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

  test("a writable console draws a menu on every live point; a read-only one has none", () => {
    const { operations } = spies();
    const editable = renderConsole({
      ...SAVES,
      operations,
      initialExpandedPointId: P1,
    });
    expect(count(editable, /data-point-menu/g)).toBe(3);
    // Nothing asks until a row does: no dialog is open.
    expect(editable).not.toContain("data-confirm");
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
});

// ── Switch players ─────────────────────────────────────────────────────────

test.describe("switch players", () => {
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

  test("on a point whose rows contradict its server it says who hits the serve", () => {
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
  });

  test("the console plans the switch on the client and calls the action", async () => {
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

  test("the ⋯ menu's order: a contradicting switch, the adds, the combines, the switch, the endings, the move, the delete", () => {
    const source = readFileSync(
      "src/components/admin/labels/label-point-menu.tsx",
      "utf8",
    );
    const order = [
      "{switchFirst ? (",
      'label="Add point above"',
      'label="Add point below"',
      'label="Combine with point above"',
      'label="Combine with point below"',
      "{switchFirst ? null : switchItem}",
      'label="Mark as a let"',
      'description="Replayed. The score skips it."',
      'label="Not a point"',
      'description="Not part of the match. The score skips it."',
      'label="Count this point"',
      'description="It was played. The score counts it again."',
      'label="Move to game…"',
      'label="Delete point"',
    ].map((needle) => source.indexOf(needle));
    expect(order.every((at) => at > -1)).toBe(true);
    expect(order).toEqual([...order].sort((x, y) => x - y));
    expect(source).toContain('label="Switch players"');
  });
});

// ── Checked ────────────────────────────────────────────────────────────────

test.describe("mark point checked", () => {
  test("the tick marks and unmarks through the console", () => {
    const pressTick = (pointId: string) => {
      const { tree, asked } = pointRowTree(pointId);
      const tick = findByProp(tree, "data-check-row")!;
      (tick.props.onClick as (event: unknown) => void)({
        stopPropagation() {},
        // The tick marks its own element for the check's answer.
        currentTarget: { dataset: {} },
      });
      return asked;
    };
    expect(pressTick(P1)).toEqual({ onSetChecked: [[P1, true]] });
    expect(pressTick(P2)).toEqual({ onSetChecked: [[P2, false]] });
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
      // The band is one flat <div>.
      return text(chunk.slice(0, chunk.indexOf("</div>")));
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
    // Game 1 stops at 15–15, so it is nobody's and its band says so; the
    // last game of the session is still being played, so its band does not.
    expect(bands(html)).toEqual([
      "Set 1 · Game 1 0–0 · Lee serves · Unfinished · 15–15",
      "Set 1 · Game 2 0–0 · Vargas serves",
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
      "Set 1 · Game 1 0–0 · Lee serves · Unfinished · 15–15",
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

  test("swapping a game's server switches the players of a point its serve contradicts, and the rows' scores follow", () => {
    const session = labelSessionFixture();
    const plan = planGameServer(
      session.points,
      { setNumber: 1, gameNumber: 1 },
      "p2",
    );
    if (!("ok" in plan)) throw new Error(plan.error);
    const swapped = {
      ...session,
      points: applyShotSwaps(
        applyGameWrites(session.points, plan.writes),
        plan.shots,
      ),
    };

    // Point 1's serve was Lee's, so serving the game by Vargas means the
    // vendor had the players the wrong way round: its hitters, winner and
    // ended by flip with the server (Vargas won it; now Lee did).
    const p1Before = session.points.find((p) => p.id === P1)!;
    const p1After = swapped.points.find((p) => p.id === P1)!;
    expect(p1Before.winner).toBe("p2");
    expect(p1After.winner).toBe("p1");
    expect(p1After.endedBy).toBe("p2");
    expect(p1After.server).toBe("p2");
    for (const shot of p1After.shots) {
      const was = p1Before.shots.find((s) => s.id === shot.id)!;
      expect(shot.hitter).toBe(was.hitter === "p1" ? "p2" : "p1");
    }

    // Point 2 follows a point the receiver won either way: 0–15 server-first,
    // with Lee serving before and Vargas after.
    const scoreOf = (s: LabelSession) =>
      labelScores(s.points, s.adScoring).points.get(P2)?.scoreBefore;
    expect(scoreOf(session)).toBe("0–15");
    expect(scoreOf(swapped)).toBe("0–15");

    const row = (html: string) =>
      text(after(html, `data-point-id="${P2}"`).split("data-point-id=")[0]);
    const afterSwap = renderRail(swapped);
    expect(row(afterSwap)).toContain("0–15");
    expect(bands(afterSwap)[0]).toContain("Set 1 · Game 1 0–0 · Vargas serves");
  });
});

// ── How it ended follows the shot rows, on the server ──────────────────────

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

  /** Let anything queued behind the shot write go out. */
  const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

  test("flipping the last stroke to out is the shot write alone: the ending is settled in that call, never as a second request", async () => {
    const { shot, point, saves } = saveSpies({
      ok: true,
      status: "edited",
      // What the server answers once the point followed the rows.
      point: { ending: "error", endedBy: "p1", winner: "p2", status: "edited" },
    });
    const table = consoleTable({ ...saves, operations: spies().operations });
    await (table.onPatchShot as PatchShot)("s-added", { result: "out" });
    await settled();
    expect(shot).toEqual([["s-added", { result: "out" }]]);
    expect(point).toEqual([]);
  });

  test("a spin edit, and a shot write that fails, send nothing either", async () => {
    const { shot, point, saves } = saveSpies();
    const table = consoleTable({ ...saves, operations: spies().operations });
    await (table.onPatchShot as PatchShot)("s-added", { spin: "flat" });
    await settled();
    expect(shot).toEqual([["s-added", { spin: "flat" }]]);
    expect(point).toEqual([]);

    const refused = saveSpies({ error: "refused" });
    const again = consoleTable({
      ...refused.saves,
      operations: spies().operations,
    });
    await (again.onPatchShot as PatchShot)("s-added", { result: "out" });
    await settled();
    expect(refused.shot).toHaveLength(1);
    expect(refused.point).toEqual([]);
  });

  test("Undo on the last stroke is the restore alone: its answer carries the point", async () => {
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
    expect(point).toEqual([]);
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

  // ── The dead balls after a rally ball marked out ──────────────────────────

  type RemoveAfter = (pointId: string, shotId: string) => void;
  type RestoreShots = (pointId: string, shotIds: string[]) => void;

  test("the return placed out: the strokes it took come back in the shot write's own answer, never as a delete request", async () => {
    const out = { landing_x: 9, landing_y: 30, result: "out" };
    const { shot, point, saves } = saveSpies({
      ok: true,
      status: "edited",
      removedAfter: [{ id: "s-added", statusBeforeDelete: "added" }],
      point: {
        ending: "service_winner",
        endedBy: "p2",
        winner: "p1",
        status: "edited",
      },
    });
    const { calls, operations } = spies();
    const table = consoleTable({ ...saves, operations });
    await (table.onPatchShot as PatchShot)("s-return", out);
    await settled();
    expect(shot).toEqual([["s-return", out]]);
    expect(point).toEqual([]);
    expect(calls).toEqual({});
  });

  test("Remove and Restore under the hint line each go out as one call, with what the point's rows say is there", async () => {
    const { saves } = saveSpies();
    const { calls, operations } = spies();
    const table = consoleTable({ ...saves, operations });
    // Point 1: serve, return, a tombstone, the added forehand. After the
    // return, one live stroke; the tombstone is the one to put back.
    (table.onRemoveShotsAfter as RemoveAfter)(P1, "s-return");
    (table.onRestoreShots as RestoreShots)(P1, ["s-phantom", "s-serve"]);
    await settled();
    expect(calls.removeShotsAfter).toEqual([["s-return"]]);
    // A live id among them is dropped before the call.
    expect(calls.restoreShots).toEqual([[["s-phantom"]]]);

    // Nothing after the last stroke, and no tombstone among the ids: no call.
    (table.onRemoveShotsAfter as RemoveAfter)(P1, "s-added");
    (table.onRestoreShots as RestoreShots)(P1, ["s-serve"]);
    await settled();
    expect(calls.removeShotsAfter).toHaveLength(1);
    expect(calls.restoreShots).toHaveLength(1);

    // A refused call is reported on the save line and nothing throws.
    const refused = consoleTable({
      ...saves,
      operations: {
        ...operations,
        removeShotsAfter: async () => ({ error: "refused" }),
        restoreShots: async () => ({ error: "refused" }),
      },
    });
    (refused.onRemoveShotsAfter as RemoveAfter)(P1, "s-return");
    (refused.onRestoreShots as RestoreShots)(P1, ["s-phantom"]);
    await settled();
  });

  test("neither goes out for a draft point whose insert is still in flight: its rows settle by the id the server gives it", async () => {
    // A split's draft row, still under its pending id, holding real shots.
    const session = winnerSession();
    const first = session.points[0];
    session.points[0] = { ...first, id: "pending-point-7" };
    const { calls, operations } = spies();
    const table = consoleTable({ ...saveSpies().saves, operations, session });
    (table.onRemoveShotsAfter as RemoveAfter)("pending-point-7", "s-return");
    (table.onRestoreShots as RestoreShots)("pending-point-7", ["s-phantom"]);
    await settled();
    expect(calls).toEqual({});
  });

  test("a shot write lands its answer on the owning row as it stands when the write settles, not as it was when the write went out", () => {
    // A split can replace the draft point a stroke sat in while its write
    // is in flight; the answer's `point` and `removedAfter` must find the
    // saved row. The console is one static render here, so the shape is
    // pinned on the source: the owner is read inside the `setPoints`
    // updater, after the await, and never captured before it.
    const source = readFileSync(
      "src/components/admin/labels/label-console.tsx",
      "utf8",
    );
    const start = source.indexOf("const writeShot = useCallback(");
    const end = source.indexOf("const patchShot = useCallback(");
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, end);
    const awaitAt = body.indexOf("await settle(onSaveShot(");
    expect(body.slice(0, awaitAt)).not.toContain("pointOfShot(rows, shotId)");
    const updater = body.slice(body.indexOf("setPoints((current) =>", awaitAt));
    expect(updater).toContain("const owner = pointOfShot(current, shotId);");
  });

  test("a console that cannot write hands the rail neither", () => {
    const readOnly = railProps({});
    expect(readOnly.onRemoveShotsAfter).toBeUndefined();
    expect(readOnly.onRestoreShots).toBeUndefined();
    const writable = consoleTable({
      ...saveSpies().saves,
      operations: spies().operations,
    });
    expect(typeof writable.onRemoveShotsAfter).toBe("function");
    expect(typeof writable.onRestoreShots).toBe("function");
  });
});
