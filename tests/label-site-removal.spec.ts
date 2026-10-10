import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { AdminClient } from "@/lib/supabase/admin";
import {
  LABEL_MARK_META,
  type LabelMark,
  type LabelMarks,
} from "@/lib/services/labels/marks";
import type {
  LabelPoint,
  LabelSession,
  LabelShot,
} from "@/lib/services/labels/session";
import {
  applySiteRemovalRestore,
  planSiteRemovalRestore,
} from "@/lib/services/labels/site-removal";
import {
  restoreLabelSiteRemoval,
  writeLabelSiteRemovalRestore,
} from "@/lib/services/labels/site-removal-session";
import { inner, tag, text } from "./fixtures/html-probe";
import {
  FIXTURE_POINT_IDS,
  labelSessionFixture,
  editContext as sharedEditContext,
  noop,
  ROW_OPERATIONS,
} from "./fixtures/label-session";
import { findByProp } from "./fixtures/react-tree";
import { createLoader } from "./fixtures/vm-modules";

const WELL = "src/components/admin/labels/label-black-shot-row.tsx";
const ROW = "src/components/admin/labels/label-black-point-row.tsx";
const CONSOLE = "src/components/admin/labels/label-console.tsx";

const SHOT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const AT = "2026-10-05T12:00:00.000Z";
const GHOST = "s-p4-ghost";
const { P4 } = FIXTURE_POINT_IDS;

function point4(): LabelPoint {
  return labelSessionFixture().points.find((p) => p.id === P4)!;
}

function ghostOf(point: LabelPoint): LabelShot {
  return point.shots.find((s) => s.id === GHOST)!;
}

// ── The pure rules ─────────────────────────────────────────────────────────

test.describe("planSiteRemovalRestore", () => {
  const ghost = { status: "kept", siteRemoval: "hit_after_fault" } as const;

  test("a ghost plans the one column", () => {
    expect(
      planSiteRemovalRestore({ ...ghost, siteRemovalRestoredAt: null }, AT),
    ).toEqual({ ok: true, write: { site_removal_restored_at: AT } });
  });

  test("refuses a stroke the site never removed, one already restored, and a tombstone", () => {
    expect(
      planSiteRemovalRestore(
        { status: "kept", siteRemoval: null, siteRemovalRestoredAt: null },
        AT,
      ),
    ).toEqual({ error: "The site did not remove this shot." });
    expect(
      planSiteRemovalRestore({ ...ghost, siteRemovalRestoredAt: AT }, AT),
    ).toEqual({ error: "This shot is already restored." });
    expect(
      planSiteRemovalRestore(
        { ...ghost, status: "deleted", siteRemovalRestoredAt: null },
        AT,
      ),
    ).toEqual({ error: "Undo this shot's delete first." });
  });

  test("applySiteRemovalRestore sets the moment on a ghost and leaves any other row alone", () => {
    const ghost = ghostOf(point4());
    const restored = applySiteRemovalRestore(ghost, AT);
    expect(restored).toEqual({ ...ghost, siteRemovalRestoredAt: AT });
    expect(restored.status).toBe("kept");
    // Not a ghost any more: the same object comes back.
    expect(applySiteRemovalRestore(restored, "later")).toBe(restored);
    const plain = point4().shots.find((s) => s.id === "s-p4-serve")!;
    expect(applySiteRemovalRestore(plain, AT)).toBe(plain);
  });
});

// ── The service, over a fake client ─────────────────────────────────────────

interface Call {
  table: string;
  op: "select" | "update";
  values?: Record<string, unknown>;
  filters: Record<string, unknown>;
  /** `.not(column, "is", null)` — the column must be set. */
  notNull: string[];
  /** `.is(column, null)` — the column must be unset. */
  isNull: string[];
}

/** The ghost's point when a test says nothing of it: no ending yet. */
const POINT_ROW = {
  id: FIXTURE_POINT_IDS.P4,
  session_id: SESSION_ID,
  updated_at: "2026-10-01T10:00:00+00:00",
  status: "unchanged",
  seed: null,
  set_number: 1,
  game_number: 2,
  server: "p2",
  serve_side: null,
  winner: null,
  ending: null,
  ended_by: null,
};

/**
 * The ghost's row, its point's row and the point's shot rows (`shots`, read
 * by `label_point_id` for the ending the restore settles). The point row
 * takes each successful `label_points` update.
 */
function fakeClient(rows: {
  shot?: Record<string, unknown> | null;
  point?: Record<string, unknown> | null;
  shots?: Record<string, unknown>[];
  session?: Record<string, unknown> | null;
  /** The compare-and-set matched nothing — another tab got there first. */
  raced?: boolean;
}) {
  const calls: Call[] = [];
  let point = rows.point === undefined ? POINT_ROW : rows.point;
  const client = {
    from(table: string) {
      const call: Call = {
        table,
        op: "select",
        filters: {},
        notNull: [],
        isNull: [],
      };
      calls.push(call);
      const answer = () => {
        if (call.op === "update") {
          if (rows.raced) return { data: [], error: null };
          if (table === "label_points" && point) {
            point = { ...point, ...call.values };
          }
          return { data: [{ id: call.filters.id }], error: null };
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
        if (table === "label_shots") {
          return "label_point_id" in call.filters
            ? { data: rows.shots ?? [], error: null }
            : { data: rows.shot ?? null, error: null };
        }
        if (table === "label_points") return { data: point, error: null };
        return { data: null, error: { message: `unexpected ${table}` } };
      };
      const builder = {
        select: () => builder,
        returns: () => builder,
        update: (values: Record<string, unknown>) => {
          call.op = "update";
          call.values = values;
          return builder;
        },
        eq: (column: string, value: unknown) => {
          call.filters[column] = value;
          return builder;
        },
        not: (column: string, operator: string, value: unknown) => {
          expect(operator).toBe("is");
          expect(value).toBeNull();
          call.notNull.push(column);
          return builder;
        },
        is: (column: string, value: unknown) => {
          expect(value).toBeNull();
          call.isNull.push(column);
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

const GHOST_ROW = {
  id: SHOT_ID,
  session_id: SESSION_ID,
  label_point_id: FIXTURE_POINT_IDS.P4,
  status: "kept",
  site_removal: "hit_after_fault",
  site_removal_restored_at: null,
};

const updates = (fake: ReturnType<typeof fakeClient>) =>
  fake.calls.filter((c) => c.op === "update");

test.describe("writeLabelSiteRemovalRestore", () => {
  test("ONE update on label_shots: the moment, matched on the id and the two columns read", async () => {
    const fake = fakeClient({ shot: GHOST_ROW });
    const result = await writeLabelSiteRemovalRestore({
      supabase: fake.supabase,
      shotId: SHOT_ID,
      at: AT,
    });
    expect(result).toEqual({ ok: true, siteRemovalRestoredAt: AT });
    expect(updates(fake)).toEqual([
      {
        table: "label_shots",
        op: "update",
        values: { site_removal_restored_at: AT },
        filters: { id: SHOT_ID },
        notNull: ["site_removal"],
        isNull: ["site_removal_restored_at"],
      },
    ]);
    // It read the session's gate — status AND marks_enabled — first.
    const session = fake.calls.find((c) => c.table === "label_sessions");
    expect(session).toMatchObject({
      op: "select",
      filters: { id: SESSION_ID },
    });
    for (const call of fake.calls) {
      expect(call.table).toMatch(/^label_(points|shots|sessions)$/);
    }
  });

  test("a ghost put back is a stroke of the rally: the point's ending follows in the same call", async () => {
    // The fixture's fourth point: Vargas's faulted first serve, Lee's swing
    // at it (the ghost) and her second serve in — an ace, as stored. Put the
    // swing back and the point is a stroke longer; its last stroke is still
    // the serve, so nothing moves. Restore a ghost AFTER the second serve
    // instead and the rows end on it.
    const rows = point4().shots.map((shot) => ({
      id: shot.id,
      label_point_id: FIXTURE_POINT_IDS.P4,
      event_id: shot.eventId,
      after_event_id: null,
      status: shot.status,
      status_before_delete: null,
      delete_reason: null,
      hitter: shot.hitter,
      stroke: shot.stroke,
      result: shot.result,
      spin: shot.spin,
      contact_x: shot.contactX,
      contact_y: shot.contactY,
      landing_x: shot.landingX,
      landing_y: shot.landingY,
      video_time: shot.videoTime,
      site_removal: shot.siteRemoval,
      site_removal_restored_at: shot.siteRemovalRestoredAt,
      seed: shot.seed,
    }));
    const point = { ...POINT_ROW, winner: "p2", ending: "ace", ended_by: "p2" };
    const between = fakeClient({
      shot: { ...GHOST_ROW, id: GHOST },
      shots: rows,
      point,
    });
    expect(
      await writeLabelSiteRemovalRestore({
        supabase: between.supabase,
        shotId: SHOT_ID,
        at: AT,
      }),
    ).toEqual({ ok: true, siteRemovalRestoredAt: AT });
    expect(updates(between).map((w) => w.table)).toEqual(["label_shots"]);

    // Lee's swing after the second serve, removed by the site: back, it is a
    // return with no result yet, read as Lee's winner by the labelled loser
    // — an error, by him.
    const late = fakeClient({
      shot: GHOST_ROW,
      shots: [
        ...rows,
        {
          ...rows[1],
          id: SHOT_ID,
          event_id: 404,
          video_time: null,
        },
      ],
      point,
    });
    expect(
      await writeLabelSiteRemovalRestore({
        supabase: late.supabase,
        shotId: SHOT_ID,
        at: AT,
      }),
    ).toEqual({
      ok: true,
      siteRemovalRestoredAt: AT,
      point: { ending: "error", endedBy: "p1", winner: "p2", status: "edited" },
    });
    expect(updates(late).map((w) => [w.table, w.values])).toEqual([
      ["label_shots", { site_removal_restored_at: AT }],
      ["label_points", { ending: "error", ended_by: "p1", status: "edited" }],
    ]);
  });

  test("a session labelled without marks is refused before anything is written", async () => {
    const fake = fakeClient({
      shot: GHOST_ROW,
      session: { status: "labelling", marks_enabled: false },
    });
    expect(
      await writeLabelSiteRemovalRestore({
        supabase: fake.supabase,
        shotId: SHOT_ID,
      }),
    ).toEqual({
      error:
        "This session is labelled without the site's marks, so there is nothing to restore.",
    });
    expect(updates(fake)).toEqual([]);
  });

  test("a complete session, a missing row and a race are refused", async () => {
    const frozen = fakeClient({
      shot: GHOST_ROW,
      session: { status: "complete", marks_enabled: true },
    });
    expect(
      await writeLabelSiteRemovalRestore({
        supabase: frozen.supabase,
        shotId: SHOT_ID,
      }),
    ).toEqual({
      error: "This session is complete, so its labels can no longer change.",
    });
    expect(updates(frozen)).toEqual([]);

    const missing = fakeClient({ shot: null });
    expect(
      await writeLabelSiteRemovalRestore({
        supabase: missing.supabase,
        shotId: SHOT_ID,
      }),
    ).toEqual({ error: "Shot not found." });

    const raced = fakeClient({ shot: GHOST_ROW, raced: true });
    expect(
      await writeLabelSiteRemovalRestore({
        supabase: raced.supabase,
        shotId: SHOT_ID,
      }),
    ).toEqual({ error: "This row changed in another tab. Reload to see it." });

    expect(
      await writeLabelSiteRemovalRestore({
        supabase: fakeClient({}).supabase,
        shotId: "not-a-uuid",
      }),
    ).toEqual({ error: "Invalid shot id." });
  });

  test("the entry point refuses without an admin, before a client is built", async () => {
    let built = 0;
    const result = await restoreLabelSiteRemoval(SHOT_ID, {
      requireAdmin: async () => null,
      createAdminClient: () => {
        built += 1;
        return fakeClient({}).supabase;
      },
    });
    expect(result).toEqual({ error: "Administrator access is required." });
    expect(built).toBe(0);

    const fake = fakeClient({ shot: GHOST_ROW });
    expect(
      await restoreLabelSiteRemoval(SHOT_ID.toUpperCase(), {
        requireAdmin: async () => ({ id: "admin" }),
        createAdminClient: () => fake.supabase,
      }),
    ).toMatchObject({ ok: true });
    expect(updates(fake)[0].filters).toEqual({ id: SHOT_ID });
  });
});

// ── The black rail ─────────────────────────────────────────────────────────

type WellProps = {
  point: LabelPoint;
  edit: Record<string, unknown>;
  marks?: LabelMarks | null;
};
type RowProps = {
  point: LabelPoint;
  open: boolean;
  playing: boolean;
  score: string | null;
  edit: Record<string, unknown>;
  marks?: LabelMarks | null;
};

const OPERATIONS = { ...ROW_OPERATIONS, onRestoreSiteRemoval: noop };

const editContext = (overrides: Record<string, unknown> = {}) =>
  sharedEditContext({
    operations: OPERATIONS,
    openGhostIds: new Set<string>(),
    onToggleGhost: noop,
    ...overrides,
  });

/**
 * The mark that describes the ghost (vendor stroke 402). It is `hidden`: the
 * console is never handed it, and a row handed it anyway draws no chip —
 * the ghost is the struck-through row, and that is all there is to draw.
 */
function phantomMark(eventIds: number[] = [402]): LabelMark {
  const meta = LABEL_MARK_META.phantom_strokes_dropped;
  return {
    code: "phantom_strokes_dropped",
    tier: meta.tier,
    scope: meta.scope,
    params: { eventIds, hitter: "p1" },
  } as LabelMark;
}

function marksOf(point: LabelPoint, pointMarks: LabelMark[]): LabelMarks {
  return {
    points: { [point.id]: pointMarks },
    shots: {},
    suggestions: [],
    serveSides: {},
  };
}

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

function renderRow(
  point: LabelPoint,
  marks: LabelMarks | null,
  edit: Record<string, unknown> = editContext(),
): string {
  const { BlackPointRow } = createLoader().load(ROW) as {
    BlackPointRow: React.ComponentType<RowProps>;
  };
  return renderToStaticMarkup(
    React.createElement(BlackPointRow, {
      point,
      open: false,
      playing: false,
      score: "0–0",
      edit,
      marks,
    }),
  );
}

/** The number drawn in a stroke row's first track. */
function numberOf(html: string, shotId: string): string {
  const at = html.indexOf(`data-shot-id="${shotId}"`);
  expect(at, shotId).toBeGreaterThan(-1);
  const row = html.slice(at);
  const span = row.indexOf("<span", row.indexOf("data-shot-number"));
  const start = row.indexOf(">", span) + 1;
  return row.slice(start, row.indexOf("<", start));
}

/** Everything from one marker to the next row of any kind. */
function block(html: string, marker: string): string {
  const at = html.indexOf(marker);
  expect(at, marker).toBeGreaterThan(-1);
  const start = html.lastIndexOf("<div", at);
  const next = html.indexOf("data-row=", html.indexOf(">", at));
  return html.slice(
    start,
    next === -1 ? undefined : html.lastIndexOf("<", next),
  );
}

test.describe("a ghost in the black well", () => {
  test("a ghost never draws the stroke tray, even selected", () => {
    const point = point4();
    for (const openGhostIds of [new Set<string>(), new Set([GHOST])]) {
      const html = renderWell(
        point,
        marksOf(point, [phantomMark()]),
        editContext({ openGhostIds, selectedShotId: GHOST }),
      );
      expect(html).toContain(`data-shot-ghost="${GHOST}"`);
      expect(html).not.toContain("data-shot-tray");
    }
  });

  test("shown: the struck-through row under the line, its reason and Restore", () => {
    const point = point4();
    const html = renderWell(
      point,
      marksOf(point, [phantomMark()]),
      editContext({ openGhostIds: new Set([GHOST]) }),
    );
    const line = block(html, `data-shot-ghost="${GHOST}"`);
    expect(text(line)).toBe("1 shot removed: Lee hit the fault back Hide");
    expect(tag(line, "data-ghost-toggle")).toContain('aria-expanded="true"');

    const row = block(html, `data-shot-ghost-row="${GHOST}"`);
    const open = tag(row, "data-shot-ghost-row");
    expect(open).toContain('data-row="ghost-shot-row"');
    // The stroke row's own tracks (`SHOT_TRACKS`), the reason and Restore
    // spanning the placement and result tracks (`col-[8/-1]`, the frame's
    // `.fx-gt`): the columns line up with the stroke row's by construction,
    // and at the rail's narrowest the span is the two floors and the gap
    // between them — 76px, which holds Restore whole — so the reason's
    // words are what give, and nothing passes the rail's edge.
    const { SHOT_FLOORS_PX, GHOST_TAIL_MIN_PX } = createLoader().load(WELL) as {
      SHOT_FLOORS_PX: readonly number[];
      GHOST_TAIL_MIN_PX: number;
    };
    expect(GHOST_TAIL_MIN_PX).toBe(76);
    expect(GHOST_TAIL_MIN_PX).toBe(SHOT_FLOORS_PX[7] + 8 + SHOT_FLOORS_PX[8]);
    expect(SHOT_FLOORS_PX.reduce((sum, px) => sum + px, 0) + 8 * 8 + 28).toBe(
      520,
    );
    // The reason's words give before Restore does.
    const reason = tag(row, "data-ghost-reason");
    expect(reason).toContain("col-[8/-1]");
    expect(reason).toContain("min-w-0");
    // On a narrow well there is no placement track (`SHOT_TRACKS_NARROW`):
    // the struck landed-at cell leaves and the tail starts at its track, so
    // it spans landed at + result — wider than its 76px floor here.
    expect(reason).toContain("@max-[640px]/shots:col-[7/-1]");
    expect(tag(row, 'data-xy="landed"')).toContain("@max-[640px]/shots:hidden");
    expect(tag(row, 'data-xy="hit"')).not.toContain("/shots:hidden");
    expect(SHOT_FLOORS_PX[6] + 8 + SHOT_FLOORS_PX[8]).toBeGreaterThan(
      GHOST_TAIL_MIN_PX,
    );
    expect(tag(row, "data-restore-site-removal")).toContain("shrink-0");
    // The number's dash, then the struck values.
    expect(text(row)).toMatch(/^– /);
    expect(text(row)).toContain("Lee Forehand Topspin");
    expect(text(row)).toContain("1.92 24.60");
    expect(text(row)).toContain("Hit after the fault Restore");
    for (const value of ["Lee", "Forehand", "Topspin", "1.92", "24.60"]) {
      const at = row.indexOf(`>${value}<`);
      expect(at, value).toBeGreaterThan(-1);
      const cell = row.slice(row.lastIndexOf("<", at), at + 1);
      expect(cell, value).toContain("line-through");
    }

    const restore = tag(row, "data-restore-site-removal");
    expect(restore).toContain('aria-label="Restore the shot"');
    expect(row).toContain("lucide-undo-2");
    // Still no number and no stroke row of its own.
    expect(numberOf(html, "s-p4-serve")).toBe("2");
    expect(row).not.toContain('data-row="shot"');
  });

  test("Show, Hide and Restore are the console's requests", () => {
    const toggled: string[] = [];
    const restored: string[] = [];
    const { BlackGhostShot } = createLoader().load(WELL) as {
      BlackGhostShot: (props: Record<string, unknown>) => React.ReactElement;
    };
    const tree = BlackGhostShot({
      shot: ghostOf(point4()),
      edit: editContext({
        openGhostIds: new Set([GHOST]),
        onToggleGhost: (id: string) => toggled.push(id),
        operations: {
          ...OPERATIONS,
          onRestoreSiteRemoval: (id: string) => restored.push(id),
        },
      }),
    });
    const click = (attr: string) => {
      const button = findByProp(tree, attr, "all")!;
      expect(button, attr).toBeDefined();
      let stopped = 0;
      (button.props.onClick as (e: unknown) => void)({
        stopPropagation: () => (stopped += 1),
      });
      expect(stopped).toBe(1);
    };
    click("data-ghost-toggle");
    expect(toggled).toEqual([GHOST]);
    click("data-restore-site-removal");
    expect(restored).toEqual([GHOST]);
  });

  test("with marks off, or none built, the ghost is an ordinary numbered row", () => {
    const point = point4();
    const marks = marksOf(point, [phantomMark()]);
    for (const html of [renderWell(point, null)]) {
      expect(html).not.toContain("data-shot-ghost");
      expect(html).not.toContain("1 shot removed");
      expect(html.match(/data-row="shot"/g)).toHaveLength(3);
      expect(numberOf(html, "s-p4-fault")).toBe("1");
      expect(numberOf(html, GHOST)).toBe("2");
      expect(numberOf(html, "s-p4-serve")).toBe("3");
    }
  });
});

test.describe("the point row over a ghost", () => {
  /**
   * Point 4 with its serves relabelled as groundstrokes, so the rally count
   * runs over every live stroke and the ghost would be counted or not.
   */
  function noServes(): LabelPoint {
    const point = point4();
    return {
      ...point,
      shots: point.shots.map((s) =>
        s.stroke === "first_serve" || s.stroke === "second_serve"
          ? { ...s, stroke: "backhand" as const, result: "in" as const }
          : s,
      ),
    };
  }

  test("the rally count, the deciding stroke and the sentence skip a drawn ghost", () => {
    const point = noServes();
    const marks = marksOf(point, [phantomMark()]);
    // Drawn as a ghost: two strokes in the rally.
    expect(inner(renderRow(point, marks), "data-point-detail")).toBe(
      "2 shot rally",
    );
    // An ordinary row — marks off, or none — and it counts.
    expect(inner(renderRow(point, null), "data-point-detail")).toBe(
      "3 shot rally",
    );

    // The sentence reads the last live stroke: Vargas's backhand — and so
    // does the settled hover line of a mark.
    const ended: LabelPoint = {
      ...point,
      ending: "error",
      endedBy: "p2",
      status: "edited",
      shots: point.shots.map((s) =>
        s.id === "s-p4-serve" ? { ...s, result: "out" as const } : s,
      ),
    };
    const html = renderRow(ended, marksOf(ended, [phantomMark()]));
    expect(inner(html, "data-point-sentence")).toBe("Backhand error by Vargas");
    expect(inner(html, "data-point-detail")).toBe("2 shot rally");
    expect(html).toContain("data-pencil");
  });
});

test.describe("the console", () => {
  type ConsoleProps = {
    session: LabelSession;
    video: null;
    marks?: LabelMarks | null;
    initialLayoutMode?: "black";
    initialExpandedPointId?: string | null;
    initialOpenGhostIds?: readonly string[];
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

  const SAVES = {
    onSaveShot: async () => ({ ok: true, status: "edited" }),
    onSavePoint: async () => ({ ok: true, status: "edited" }),
  };

  test("the black view draws the ghost only on a session with marks on", () => {
    const session = labelSessionFixture();
    const marks = marksOf(point4(), [phantomMark()]);
    const on = renderConsole({
      session,
      video: null,
      marks,
      initialLayoutMode: "black",
      initialExpandedPointId: P4,
      initialOpenGhostIds: [GHOST],
      ...SAVES,
    });
    expect(on).toContain(`data-shot-ghost="${GHOST}"`);
    expect(on).toContain(`data-shot-ghost-row="${GHOST}"`);
    expect(on).toContain("Hit after the fault");

    const off = renderConsole({
      session: { ...session, marksEnabled: false },
      video: null,
      marks: null,
      initialLayoutMode: "black",
      initialExpandedPointId: P4,
      ...SAVES,
    });
    expect(off).not.toContain("data-shot-ghost");
    expect(off).toContain(`data-shot-id="${GHOST}"`);

    const none = renderConsole({
      session,
      video: null,
      marks: null,
      initialLayoutMode: "black",
      initialExpandedPointId: P4,
      ...SAVES,
    });
    expect(none).not.toContain("data-shot-ghost");
  });
});
