import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { AdminClient } from "@/lib/supabase/admin";
import {
  LABEL_MARK_META,
  type LabelMark,
  type LabelMarks,
  type LabelSuggestion,
} from "@/lib/services/labels/marks";
import { markState } from "@/lib/services/labels/marks-state";
import { planAddedShot } from "@/lib/services/labels/operations";
import type {
  LabelPoint,
  LabelSession,
  LabelShot,
} from "@/lib/services/labels/session";
import {
  applyDismiss,
  planDismiss,
  suggestionState,
} from "@/lib/services/labels/suggestions";
import {
  dismissLabelSuggestion,
  writeLabelSuggestionDismiss,
} from "@/lib/services/labels/suggestions-session";
import {
  FIXTURE_POINT_IDS,
  labelSessionFixture,
  labelShot,
  editContext as sharedEditContext,
  noop,
} from "./fixtures/label-session";
import { createLoader } from "./fixtures/vm-modules";

const WELL = "src/components/admin/labels/label-black-shot-row.tsx";
const CONSOLE = "src/components/admin/labels/label-console.tsx";

const POINT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const { P4 } = FIXTURE_POINT_IDS;
const KEY = "missing_shot:502";

function pairPoint(): LabelPoint {
  const point = labelSessionFixture().points.find((p) => p.id === P4)!;
  const shot = (
    id: string,
    eventId: number,
    hitter: "p1" | "p2",
    stroke: LabelShot["stroke"],
    videoTime: number,
  ): LabelShot =>
    labelShot(id, P4, { eventId, hitter, stroke, videoTime, result: "in" });
  return {
    ...point,
    server: "p1",
    shots: [
      shot("s-a", 501, "p1", "first_serve", 1679.4),
      shot("s-b", 502, "p2", "backhand", 1680.3),
      shot("s-c", 503, "p2", "forehand", 1682.7),
      shot("s-d", 504, "p1", "backhand", 1684.0),
    ],
  };
}

const SUGGESTION: Extract<LabelSuggestion, { kind: "missing_shot" }> = {
  kind: "missing_shot",
  key: KEY,
  pointId: P4,
  afterShotId: "s-b",
  hitter: "p1",
  videoTime: 1681.5,
};

function pairMark(): LabelMark {
  const meta = LABEL_MARK_META.same_player_consecutive;
  return {
    code: "same_player_consecutive",
    tier: meta.tier,
    scope: meta.scope,
    params: { hitter: "p2" },
  } as LabelMark;
}

function marksOf(point: LabelPoint): LabelMarks {
  return {
    points: { [point.id]: [pairMark()] },
    shots: {},
    suggestions: [SUGGESTION],
    serveSides: {},
  };
}

/** The point after "Add shot": the row the existing operation plans. */
function withAdded(point: LabelPoint): LabelPoint {
  const plan = planAddedShot(point, SUGGESTION.afterShotId);
  if ("error" in plan) throw new Error(plan.error);
  const added: LabelShot = {
    ...point.shots[0],
    id: "s-new",
    eventId: null,
    afterEventId: plan.write.after_event_id,
    status: plan.write.status,
    hitter: plan.write.hitter,
    stroke: null,
    result: null,
    spin: null,
    videoTime: plan.write.video_time,
  };
  const [a, b, c, d] = point.shots;
  return { ...point, shots: [a, b, added, c, d] };
}

// ── The pure rules ─────────────────────────────────────────────────────────

test.describe("the existing add operation is what Add shot runs", () => {
  test("planAddedShot times the new row at the pair's midpoint and credits the opponent", () => {
    const plan = planAddedShot(pairPoint(), SUGGESTION.afterShotId);
    expect(plan).toEqual({
      ok: true,
      write: {
        event_id: null,
        after_event_id: 502,
        status: "added",
        // Vargas hit both of the pair: the missing stroke is Lee's.
        hitter: "p1",
        // (1680.3 + 1682.7) / 2 — what the marks proposed.
        video_time: SUGGESTION.videoTime,
      },
    });
    expect(SUGGESTION.hitter).toBe("p1");
  });
});

test.describe("suggestionState", () => {
  test("open, then done once a live added stroke follows the pair's first", () => {
    const point = pairPoint();
    expect(suggestionState(SUGGESTION, point)).toBe("open");

    const added = withAdded(point);
    expect(suggestionState(SUGGESTION, added)).toBe("done");

    // A stroke added somewhere else in the rally answers nothing.
    const elsewhere: LabelPoint = {
      ...added,
      shots: added.shots.map((s) =>
        s.id === "s-new" ? { ...s, afterEventId: 504 } : s,
      ),
    };
    expect(suggestionState(SUGGESTION, elsewhere)).toBe("open");

    // The labeller deletes what they added: the question is open again.
    const undone: LabelPoint = {
      ...added,
      shots: added.shots.map((s) =>
        s.id === "s-new"
          ? { ...s, status: "deleted", statusBeforeDelete: "added" }
          : s,
      ),
    };
    expect(suggestionState(SUGGESTION, undone)).toBe("open");
  });

  test("done once the pair's first stroke is out or in the net", () => {
    const ruled = (fields: Partial<LabelShot>): LabelPoint => {
      const point = pairPoint();
      return {
        ...point,
        shots: point.shots.map((s) =>
          s.eventId === 502 ? { ...s, ...fields } : s,
        ),
      };
    };
    expect(suggestionState(SUGGESTION, ruled({ result: "out" }))).toBe("done");
    expect(suggestionState(SUGGESTION, ruled({ result: "net" }))).toBe("done");
    expect(suggestionState(SUGGESTION, ruled({ result: "in" }))).toBe("open");

    // Placed coordinates outrank a stale stored call: long past the far
    // baseline is out whatever `result` still says, and a landing inside the
    // court keeps it open whatever it says.
    const placedLong = {
      contactX: 1,
      contactY: 2,
      landingX: 1,
      landingY: 26,
    };
    expect(
      suggestionState(SUGGESTION, ruled({ ...placedLong, result: "in" })),
    ).toBe("done");
    expect(
      suggestionState(
        SUGGESTION,
        ruled({ ...placedLong, landingY: 20, result: "out" }),
      ),
    ).toBe("open");

    // A deleted stroke answers nothing, nor does another stroke going out.
    expect(
      suggestionState(
        SUGGESTION,
        ruled({ result: "out", status: "deleted", statusBeforeDelete: "kept" }),
      ),
    ).toBe("open");
    const point = pairPoint();
    const laterOut: LabelPoint = {
      ...point,
      shots: point.shots.map((s) =>
        s.eventId === 504 ? { ...s, result: "out" } : s,
      ),
    };
    expect(suggestionState(SUGGESTION, laterOut)).toBe("open");

    // The "Same side twice" mark settles with its slot.
    expect(markState(pairMark(), pairPoint(), [SUGGESTION])).toBe("open");
    expect(markState(pairMark(), ruled({ result: "out" }), [SUGGESTION])).toBe(
      "settled",
    );
  });

  test("dismissed by its own key only, and done outranks dismissed", () => {
    const point = pairPoint();
    expect(suggestionState(SUGGESTION, { ...point, dismissed: [KEY] })).toBe(
      "dismissed",
    );
    expect(
      suggestionState(SUGGESTION, {
        ...point,
        dismissed: ["missing_shot:999", "missing_point"],
      }),
    ).toBe("open");
    expect(
      suggestionState(SUGGESTION, { ...withAdded(point), dismissed: [KEY] }),
    ).toBe("done");
    // A missing point is dismissed by its key and has no `done` here.
    const missingPoint = {
      kind: "missing_point",
      key: "missing_point",
    } as const;
    expect(suggestionState(missingPoint, withAdded(point))).toBe("open");
    expect(
      suggestionState(missingPoint, { ...point, dismissed: ["missing_point"] }),
    ).toBe("dismissed");
  });
});

test.describe("planDismiss", () => {
  test("“Did the point end here?” is dismissed by its stroke's id — not a draft's", () => {
    const key = "point_ended:3f1c2a9e-7b1d-4c2e-9a51-0b6f7d2e8c40";
    expect(planDismiss({ dismissed: [] }, key)).toEqual({
      ok: true,
      write: { dismissed: [key] },
    });
    for (const refused of ["point_ended:", "point_ended:pending-shot-3"]) {
      expect(planDismiss({ dismissed: [] }, refused), refused).toEqual({
        error: "That is not a suggestion this point can dismiss.",
      });
    }
  });

  test("appends the key to the array read", () => {
    expect(planDismiss({ dismissed: [] }, KEY)).toEqual({
      ok: true,
      write: { dismissed: [KEY] },
    });
    expect(planDismiss({ dismissed: [KEY] }, "missing_point")).toEqual({
      ok: true,
      write: { dismissed: [KEY, "missing_point"] },
    });
  });

  test("refuses a key of any other shape, and one already there", () => {
    for (const key of [
      "",
      "missing_shot:",
      "missing_shot:abc",
      "missing_shot:502 ",
      "missing_shot:-1",
      "missing_points",
      "phantom_strokes_dropped",
      502,
      null,
      undefined,
    ]) {
      expect(planDismiss({ dismissed: [] }, key), String(key)).toEqual({
        error: "That is not a suggestion this point can dismiss.",
      });
    }
    expect(planDismiss({ dismissed: [KEY] }, KEY)).toEqual({
      error: "This suggestion is already dismissed.",
    });
  });

  test("applyDismiss is the plan on the console's row, and a no-op when it refuses", () => {
    const point = pairPoint();
    const after = applyDismiss(point, KEY);
    expect(after).toEqual({ ...point, dismissed: [KEY] });
    expect(point.dismissed).toEqual([]);
    expect(applyDismiss(after, KEY)).toBe(after);
    expect(applyDismiss(point, "nonsense")).toBe(point);
  });
});

// ── The service ────────────────────────────────────────────────────────────

interface Call {
  table: string;
  op: "select" | "update";
  values?: Record<string, unknown>;
  filters: Record<string, unknown>;
}

function fakeClient(rows: {
  point?: Record<string, unknown> | null;
  session?: Record<string, unknown> | null;
  /** The compare-and-set matched nothing — another tab got there first. */
  raced?: boolean;
}) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, op: "select", filters: {} };
      calls.push(call);
      const answer = () => {
        if (call.op === "update") {
          return {
            data: rows.raced ? [] : [{ id: call.filters.id }],
            error: null,
          };
        }
        if (table === "label_sessions") {
          return {
            data:
              rows.session === undefined
                ? { status: "labelling", marks_enabled: true }
                : rows.session,
            error: null,
          };
        }
        if (table === "label_points") {
          return { data: rows.point ?? null, error: null };
        }
        return { data: null, error: { message: `unexpected ${table}` } };
      };
      const builder = {
        select: () => builder,
        update: (values: Record<string, unknown>) => {
          call.op = "update";
          call.values = values;
          return builder;
        },
        eq: (column: string, value: unknown) => {
          call.filters[column] = value;
          return builder;
        },
        maybeSingle: async () => answer(),
        then: (
          resolve: (v: unknown) => unknown,
          reject?: (e: unknown) => unknown,
        ) => Promise.resolve(answer()).then(resolve, reject),
      };
      return builder;
    },
  };
  return { calls, supabase: client as unknown as AdminClient };
}

const POINT_ROW = {
  id: POINT_ID,
  session_id: SESSION_ID,
  status: "unchanged",
  dismissed: ["missing_point"],
};

const updates = (fake: ReturnType<typeof fakeClient>) =>
  fake.calls.filter((c) => c.op === "update");

test.describe("writeLabelSuggestionDismiss", () => {
  test("ONE update on label_points: the array read plus the key, matched on the id and the status read", async () => {
    const fake = fakeClient({ point: POINT_ROW });
    const result = await writeLabelSuggestionDismiss({
      supabase: fake.supabase,
      pointId: POINT_ID,
      key: KEY,
    });
    expect(result).toEqual({ ok: true, dismissed: ["missing_point", KEY] });
    expect(updates(fake)).toEqual([
      {
        table: "label_points",
        op: "update",
        values: { dismissed: ["missing_point", KEY] },
        filters: { id: POINT_ID, status: "unchanged" },
      },
    ]);
    // It read the session's gate — status AND marks_enabled — first.
    expect(fake.calls.find((c) => c.table === "label_sessions")).toMatchObject({
      op: "select",
      filters: { id: SESSION_ID },
    });
    for (const call of fake.calls) {
      expect(call.table).toMatch(/^label_(points|sessions)$/);
    }
  });

  test("a row older than the column reads as nothing dismissed", async () => {
    const fake = fakeClient({ point: { ...POINT_ROW, dismissed: null } });
    expect(
      await writeLabelSuggestionDismiss({
        supabase: fake.supabase,
        pointId: POINT_ID,
        key: KEY,
      }),
    ).toEqual({ ok: true, dismissed: [KEY] });
  });

  test("a session labelled without marks, and a complete one, are refused before anything is written", async () => {
    const blind = fakeClient({
      point: POINT_ROW,
      session: { status: "labelling", marks_enabled: false },
    });
    expect(
      await writeLabelSuggestionDismiss({
        supabase: blind.supabase,
        pointId: POINT_ID,
        key: KEY,
      }),
    ).toEqual({
      error:
        "This session is labelled without the site's marks, so there is nothing to dismiss.",
    });
    expect(updates(blind)).toEqual([]);

    const frozen = fakeClient({
      point: POINT_ROW,
      session: { status: "complete", marks_enabled: true },
    });
    expect(
      await writeLabelSuggestionDismiss({
        supabase: frozen.supabase,
        pointId: POINT_ID,
        key: KEY,
      }),
    ).toEqual({
      error: "This session is complete, so its labels can no longer change.",
    });
    expect(updates(frozen)).toEqual([]);
  });

  test("a missing row, a bad id, a race and the plan's refusals", async () => {
    expect(
      await writeLabelSuggestionDismiss({
        supabase: fakeClient({ point: null }).supabase,
        pointId: POINT_ID,
        key: KEY,
      }),
    ).toEqual({ error: "Point not found." });

    expect(
      await writeLabelSuggestionDismiss({
        supabase: fakeClient({}).supabase,
        pointId: "not-a-uuid",
        key: KEY,
      }),
    ).toEqual({ error: "Invalid point id." });

    const raced = fakeClient({ point: POINT_ROW, raced: true });
    expect(
      await writeLabelSuggestionDismiss({
        supabase: raced.supabase,
        pointId: POINT_ID,
        key: KEY,
      }),
    ).toEqual({ error: "This row changed in another tab. Reload to see it." });

    for (const [key, error] of [
      ["site_removal", "That is not a suggestion this point can dismiss."],
      ["missing_point", "This suggestion is already dismissed."],
    ] as const) {
      const fake = fakeClient({ point: POINT_ROW });
      expect(
        await writeLabelSuggestionDismiss({
          supabase: fake.supabase,
          pointId: POINT_ID,
          key,
        }),
      ).toEqual({ error });
      expect(updates(fake)).toEqual([]);
    }
  });

  test("the entry point refuses without an admin, before a client is built", async () => {
    let built = 0;
    const result = await dismissLabelSuggestion(POINT_ID, KEY, {
      requireAdmin: async () => null,
      createAdminClient: () => {
        built += 1;
        return fakeClient({}).supabase;
      },
    });
    expect(result).toEqual({ error: "Administrator access is required." });
    expect(built).toBe(0);

    const fake = fakeClient({ point: POINT_ROW });
    expect(
      await dismissLabelSuggestion(POINT_ID.toUpperCase(), KEY, {
        requireAdmin: async () => ({ id: "admin" }),
        createAdminClient: () => fake.supabase,
      }),
    ).toMatchObject({ ok: true });
    expect(updates(fake)[0].filters).toMatchObject({ id: POINT_ID });
  });
});

// ── The black rail ─────────────────────────────────────────────────────────

type WellProps = {
  point: LabelPoint;
  edit: Record<string, unknown>;
  marks?: LabelMarks | null;
};
/** Row operations that record every request made of them. */
function recordingOperations() {
  const calls: Array<[string, ...unknown[]]> = [];
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push([name, ...args]);
    };
  const operations = Object.fromEntries(
    [
      "onAskDeleteShot",
      "onAskDeletePoint",
      "onRestoreShot",
      "onRestorePoint",
      "onRestoreSiteRemoval",
      "onDismissSuggestion",
      "onMovePoint",
      "onSetChecked",
      "onAddShot",
      "onAskResetShot",
      "onAskResetPoint",
    ].map((name) => [name, record(name)]),
  );
  return { calls, operations };
}

const editContext = (overrides: Record<string, unknown> = {}) =>
  sharedEditContext({
    operations: recordingOperations().operations,
    openGhostIds: new Set<string>(),
    onToggleGhost: noop,
    ...overrides,
  });

function renderWell(
  point: LabelPoint,
  marks: LabelMarks | null,
  edit: Record<string, unknown> = editContext(),
): string {
  const { BlackShotsWell } = createLoader().load(WELL) as {
    BlackShotsWell: React.ComponentType<WellProps>;
  };
  return renderToStaticMarkup(
    React.createElement(BlackShotsWell, { point, edit, marks }),
  );
}

test.describe("a suggested shot in the black well", () => {
  test("nothing is added until a click; the two buttons are the console's requests", () => {
    const point = pairPoint();
    const { calls, operations } = recordingOperations();
    const edit = editContext({ operations });
    const html = renderWell(point, marksOf(point), edit);
    expect(html).toContain("data-shot-suggestion=");
    expect(html).toContain("A shot by Lee is probably missing here");
    // A render asked for nothing.
    expect(calls).toEqual([]);

    const { BlackShotsWell } = createLoader().load(WELL) as {
      BlackShotsWell: (props: WellProps) => React.ReactElement;
    };
    const tree = BlackShotsWell({ point, edit, marks: marksOf(point) });
    const click = (attr: string) => {
      const button = find(tree, attr);
      expect(button, attr).not.toBeNull();
      let stopped = 0;
      (button!.props.onClick as (e: unknown) => void)({
        stopPropagation: () => (stopped += 1),
      });
      expect(stopped).toBe(1);
    };
    expect(calls).toEqual([]);
    click("data-suggestion-add");
    // The EXISTING add request, after the pair's first stroke.
    expect(calls).toEqual([["onAddShot", P4, "s-b"]]);
    click("data-suggestion-dismiss");
    expect(calls).toEqual([
      ["onAddShot", P4, "s-b"],
      ["onDismissSuggestion", P4, KEY],
    ]);
  });

  test("with marks off, or none built, no suggestion renders", () => {
    const point = pairPoint();
    const marks = marksOf(point);
    expect(renderWell(point, null)).not.toContain("data-shot-suggestion");
    // Another point's suggestion is not this one's.
    expect(
      renderWell(point, {
        ...marks,
        suggestions: [{ ...SUGGESTION, pointId: "p-0001" }],
      }),
    ).not.toContain("data-shot-suggestion");
  });
});

// ── The console ────────────────────────────────────────────────────────────

test.describe("the console", () => {
  type ConsoleProps = {
    session: LabelSession;
    video: null;
    marks?: LabelMarks | null;
    initialLayoutMode?: "black";
    initialExpandedPointId?: string | null;
    operations?: Record<string, unknown>;
    onSaveShot?: () => Promise<unknown>;
    onSavePoint?: () => Promise<unknown>;
  };

  function renderConsole(props: ConsoleProps): string {
    const { LabelConsole } = createLoader().load(CONSOLE) as {
      LabelConsole: React.ComponentType<ConsoleProps>;
    };
    return renderToStaticMarkup(React.createElement(LabelConsole, props));
  }

  function sessionWithPair(): LabelSession {
    const session = labelSessionFixture();
    return {
      ...session,
      points: session.points.map((p) => (p.id === P4 ? pairPoint() : p)),
    };
  }

  /** Every console operation, counting the calls a render makes of it. */
  function countingOperations() {
    const called: string[] = [];
    const operations = Object.fromEntries(
      [
        "deleteShot",
        "restoreShot",
        "deletePoint",
        "restorePoint",
        "addShot",
        "movePoint",
        "setChecked",
        "resetShot",
        "resetPoint",
        "setGameServer",
        "setGameType",
        "restoreSiteRemoval",
        "dismissSuggestion",
      ].map((name) => [
        name,
        async () => {
          called.push(name);
          return { error: "not in a render" };
        },
      ]),
    );
    return { called, operations };
  }

  test("not on a session with marks off; the default layout draws them with marks on", () => {
    const { called, operations } = countingOperations();
    const saves = {
      onSaveShot: async () => ({ ok: true, status: "edited" }),
      onSavePoint: async () => ({ ok: true, status: "edited" }),
    };
    const off = renderConsole({
      session: { ...sessionWithPair(), marksEnabled: false },
      video: null,
      marks: null,
      initialLayoutMode: "black",
      initialExpandedPointId: P4,
      operations,
      ...saves,
    });
    expect(off).not.toContain("data-shot-suggestion");
    expect(off).toContain('data-shot-id="s-b"');

    // The default layout (docked side) is the same rail: with marks on it
    // draws the suggestion too.
    const docked = renderConsole({
      session: sessionWithPair(),
      video: null,
      marks: marksOf(pairPoint()),
      initialExpandedPointId: P4,
      operations,
      ...saves,
    });
    expect(docked).toContain('data-label-layout-mode="docked-side"');
    expect(docked).toContain(`data-shot-suggestion="${KEY}"`);
    expect(docked).toContain('data-shot-id="s-b"');
    // A render asked the console's operations for nothing.
    expect(called).toEqual([]);
  });
});

/**
 * The first element in a React tree whose props carry `attr`. Only the
 * suggestion's own component is entered: the stroke rows around it hold
 * editors that use hooks and cannot be called outside a render.
 */
function find(
  node: React.ReactNode,
  attr: string,
): React.ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = find(child, attr);
      if (found) return found;
    }
    return null;
  }
  if (!React.isValidElement(node)) return null;
  const element = node as React.ReactElement<Record<string, unknown>>;
  if (attr in element.props) return element;
  if (typeof element.type === "function") {
    if (element.type.name !== "BlackSuggestedShot") return null;
    return find(
      (element.type as (p: unknown) => React.ReactNode)(element.props),
      attr,
    );
  }
  for (const child of React.Children.toArray(
    element.props.children as React.ReactNode,
  )) {
    const found = find(child, attr);
    if (found) return found;
  }
  return null;
}
