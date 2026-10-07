import type { AdminClient } from "@/lib/supabase/admin";
import { labelScores } from "@/lib/services/labels/score";
import {
  orderLabelShots,
  type LabelPoint,
  type LabelSession,
  type LabelShot,
} from "@/lib/services/labels/session";

/**
 * A small hand-labelling session for the console specs: four points, one of
 * them a tombstone, one checked, a first point whose strokes cover every
 * shot state the table draws — kept, edited, added and deleted — and a fourth
 * whose strokes are untimed (so it has no place on the film) and carry the
 * one ghost: a stroke the SITE removed (`siteRemoval`) between a faulted
 * first serve and the second serve, which the black rail draws as a quiet
 * line and the three light layouts as an ordinary row.
 *
 * Seeds: every vendor row carries the values it was seeded with, and the two
 * edited rows (point 1 and its return, `s-return`) carry seeds that differ
 * from what they hold now. Added rows have none.
 *
 * Point 1's strokes are listed OUT of video order on purpose (the loader
 * sorts them with `orderLabelShots` before the console ever sees them), so
 * the fixture runs them through that same function.
 */

const SESSION_ID = "11111111-1111-4111-8111-111111111111";

/** A kept, untimed stroke by player 1 with nothing labelled on it. */
export function labelShot(
  id: string,
  labelPointId: string,
  fields: Partial<LabelShot> = {},
): LabelShot {
  return {
    id,
    labelPointId,
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

/** A kept shot's seed: exactly what it holds. */
function seededShot(
  id: string,
  labelPointId: string,
  fields: Partial<LabelShot>,
): LabelShot {
  const row = labelShot(id, labelPointId, fields);
  return {
    ...row,
    seed: row.seed ?? {
      hitter: row.hitter,
      stroke: row.stroke,
      result: row.result,
      spin: row.spin,
      contact_x: row.contactX,
      contact_y: row.contactY,
      landing_x: row.landingX,
      landing_y: row.landingY,
      video_time: row.videoTime,
    },
  };
}

const P1 = "p-0001";
const P2 = "p-0002";
const P3 = "p-0003";
const P4 = "p-0004";

export const POINT_1_SHOTS: LabelShot[] = [
  labelShot("s-return", P1, {
    eventId: 102,
    hitter: "p2",
    stroke: "backhand",
    result: "in",
    spin: "topspin",
    contactX: 1.8,
    contactY: 24.49,
    landingX: -2.1,
    landingY: 3.49,
    videoTime: 2473.1,
    status: "edited",
    // Seeded as a forehand the vendor put 30 cm wider; the spin is the seed's.
    seed: {
      hitter: "p2",
      stroke: "forehand",
      result: "in",
      spin: "topspin",
      contact_x: 2.1,
      contact_y: 24.49,
      landing_x: -2.1,
      landing_y: 3.49,
      video_time: 2473.1,
    },
  }),
  seededShot("s-serve", P1, {
    eventId: 101,
    hitter: "p1",
    stroke: "first_serve",
    result: "in",
    spin: "flat",
    contactX: -0.8,
    contactY: -0.32,
    landingX: 0.6,
    landingY: 17.79,
    videoTime: 2472.0,
  }),
  seededShot("s-phantom", P1, {
    eventId: 103,
    hitter: "p1",
    stroke: "forehand",
    videoTime: 2473.6,
    status: "deleted",
    statusBeforeDelete: "kept",
    deleteReason: "not_a_stroke",
  }),
  labelShot("s-added", P1, {
    afterEventId: 102,
    hitter: "p1",
    stroke: "forehand",
    result: "out",
    contactX: -2.3,
    contactY: -1.02,
    landingX: 4.2,
    landingY: 24.9,
    videoTime: 2474.4,
    status: "added",
  }),
];

/** An unchanged, unseeded point of game 1 with no strokes. */
export function labelPoint(
  id: string,
  pointIndex: number,
  fields: Partial<LabelPoint> = {},
): LabelPoint {
  return {
    id,
    pointIndex,
    // One vendor rally per seeded point, numbered after the point.
    vendorRallyIds: [1001 + pointIndex],
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

/** An unchanged point's seed: exactly what it holds. */
function seededPoint(
  id: string,
  pointIndex: number,
  fields: Partial<LabelPoint>,
): LabelPoint {
  const row = labelPoint(id, pointIndex, fields);
  return {
    ...row,
    seed: row.seed ?? {
      set_number: row.setNumber,
      game_number: row.gameNumber,
      server: row.server,
      serve_side: row.serveSide,
      winner: row.winner,
      ending: row.ending,
      ended_by: row.endedBy,
    },
  };
}

export function labelSessionFixture(): LabelSession {
  return {
    id: SESSION_ID,
    jobId: "22222222-2222-4222-8222-222222222222",
    matchId: "33333333-3333-4333-8333-333333333333",
    status: "labelling",
    derivationVersion: "0.3.2",
    player1Name: "Jordan Lee",
    player2Name: "Elena Vargas",
    adScoring: true,
    marksEnabled: true,
    finalScore: null,
    videoEndsEarly: null,
    matchScore: { player1: [6, 4], player2: [3, 6] },
    points: [
      labelPoint(P1, 0, {
        winner: "p2",
        ending: "error",
        endedBy: "p1",
        status: "edited",
        // Seeded as won by Lee on Lee's winner.
        seed: {
          set_number: 1,
          game_number: 1,
          server: "p1",
          serve_side: "deuce",
          winner: "p1",
          ending: "winner",
          ended_by: "p1",
        },
        shots: orderLabelShots(POINT_1_SHOTS),
      }),
      seededPoint(P2, 1, {
        serveSide: "ad",
        winner: "p1",
        ending: "ace",
        endedBy: "p1",
        checkedAt: "2026-09-28T10:00:00Z",
        note: "Clean ace down the T.",
        shots: [
          seededShot("s-ace", P2, {
            eventId: 201,
            stroke: "first_serve",
            result: "in",
            spin: "flat",
            videoTime: 2490.2,
          }),
        ],
      }),
      seededPoint(P3, 2, {
        status: "deleted",
        statusBeforeDelete: "unchanged",
        ending: "let_replayed",
        // One shot row of its own, deleted with the point: a tombstone with
        // NO shot rows is what a combine leaves (`isCombinedTombstone`) and
        // offers no Undo, which this ordinary deleted point must.
        shots: [
          labelShot("s-let", P3, {
            stroke: "first_serve",
            status: "deleted",
            statusBeforeDelete: "added",
            deleteReason: "other",
          }),
        ],
      }),
      seededPoint(P4, 3, {
        gameNumber: 2,
        server: "p2",
        shots: orderLabelShots(POINT_4_SHOTS),
      }),
    ],
  };
}

/**
 * Point 4's strokes: Vargas's faulted first serve, Lee's swing at it — the
 * ghost, removed by the site before the transcript was built — and the second
 * serve. None is timed, so the point never plays and the strokes order by
 * vendor id.
 */
export const POINT_4_SHOTS: LabelShot[] = [
  seededShot("s-p4-fault", P4, {
    eventId: 401,
    hitter: "p2",
    stroke: "first_serve",
    result: "net",
    spin: "flat",
  }),
  seededShot("s-p4-ghost", P4, {
    eventId: 402,
    hitter: "p1",
    stroke: "forehand",
    spin: "topspin",
    contactX: 1.92,
    contactY: 24.6,
    siteRemoval: "hit_after_fault",
  }),
  seededShot("s-p4-serve", P4, {
    eventId: 403,
    hitter: "p2",
    stroke: "second_serve",
    result: "in",
  }),
];

export const FIXTURE_POINT_IDS = { P1, P2, P3, P4 } as const;

export const noop = () => {};

/** The requests every rail row is handed; a spec adds its feature's own. */
export const ROW_OPERATIONS = {
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

/**
 * The rail rows' `EditContext`: writable, nothing selected, every request a
 * no-op, over the fixture session's points unless `session` says otherwise.
 */
export function editContext(
  overrides: Record<string, unknown> = {},
  session: {
    points: readonly LabelPoint[];
    adScoring: boolean;
  } = labelSessionFixture(),
) {
  return {
    editable: true,
    names: { p1: "Lee", p2: "Vargas" },
    selectedShotId: null,
    onPatchPoint: noop,
    onPatchShot: noop,
    operations: ROW_OPERATIONS,
    points: session.points,
    scores: labelScores(session.points, session.adScoring).points,
    ...overrides,
  };
}

/**
 * A `label_shots` row as the services read it: a kept forehand by player 1,
 * seeded with exactly what it holds unless `fields` names a seed.
 */
export function labelShotRow(
  id: string,
  labelPointId: string,
  fields: Record<string, unknown> = {},
) {
  const row = {
    id,
    label_point_id: labelPointId,
    event_id: 1,
    after_event_id: null,
    status: "kept",
    status_before_delete: null,
    delete_reason: null,
    hitter: "p1",
    stroke: "forehand",
    result: "in",
    spin: null,
    contact_x: null,
    contact_y: null,
    landing_x: null,
    landing_y: null,
    video_time: null,
    site_removal: null,
    site_removal_restored_at: null,
    ...fields,
  };
  const seed = {
    hitter: row.hitter,
    stroke: row.stroke,
    result: row.result,
    spin: row.spin,
    contact_x: row.contact_x,
    contact_y: row.contact_y,
    landing_x: row.landing_x,
    landing_y: row.landing_y,
    video_time: row.video_time,
  };
  return { ...row, seed: "seed" in fields ? fields.seed : seed };
}

/** One `from(table)` chain of the fake client, as the service built it. */
export interface FakeLabelCall {
  table: string;
  op: "select" | "update" | "insert";
  /** The column list of a read. */
  columns?: string;
  values?: Record<string, unknown>;
  filters: Record<string, unknown>;
  /** `.neq(column, value)`; absent until one is asked. */
  negated?: Record<string, unknown>;
  /** `.in(column, values)`; absent until one is asked. */
  in?: Record<string, readonly unknown[]>;
  /** `.not(column, "is", null)` — the column must be set; absent until asked. */
  notNull?: string[];
  /** `.is(column, null)` — the column must be unset; absent until asked. */
  isNull?: string[];
}

type FakeLabelAnswer = { data: unknown; error: { message: string } | null };

/**
 * A Supabase client for the labels services' specs: it records every chain
 * and answers each from `answer`. A chain `answer` leaves unanswered succeeds
 * when it is an update (one row, the id it filtered on) and fails otherwise.
 */
export function fakeLabelClient(
  answer: (call: FakeLabelCall) => FakeLabelAnswer | undefined,
) {
  const calls: FakeLabelCall[] = [];
  const supabase = {
    from(table: string) {
      const call: FakeLabelCall = { table, op: "select", filters: {} };
      calls.push(call);
      const settle = async (): Promise<FakeLabelAnswer> =>
        answer(call) ??
        (call.op === "update"
          ? { data: [{ id: call.filters.id }], error: null }
          : { data: null, error: { message: `unexpected ${table}` } });
      const builder = {
        select: (columns?: string) => {
          if (call.op === "select") call.columns = columns;
          return builder;
        },
        order: () => builder,
        returns: () => builder,
        update: (values: Record<string, unknown>) => {
          call.op = "update";
          call.values = values;
          return builder;
        },
        insert: (values: Record<string, unknown>) => {
          call.op = "insert";
          call.values = values;
          return builder;
        },
        eq: (column: string, value: unknown) => {
          call.filters[column] = value;
          return builder;
        },
        neq: (column: string, value: unknown) => {
          call.negated = { ...call.negated, [column]: value };
          return builder;
        },
        in: (column: string, values: readonly unknown[]) => {
          call.in = { ...call.in, [column]: values };
          return builder;
        },
        not: (column: string, operator: string, value: unknown) => {
          if (operator !== "is" || value !== null) {
            throw new Error(`unexpected .not(${column}, ${operator})`);
          }
          call.notNull = [...(call.notNull ?? []), column];
          return builder;
        },
        is: (column: string, value: unknown) => {
          if (value !== null) throw new Error(`unexpected .is(${column})`);
          call.isNull = [...(call.isNull ?? []), column];
          return builder;
        },
        /** One page of a `readAllPages` read: the fake holds under a page. */
        range: settle,
        maybeSingle: settle,
        single: settle,
        then: (
          resolve: (v: unknown) => unknown,
          reject?: (e: unknown) => unknown,
        ) => settle().then(resolve, reject),
      };
      return builder;
    },
  };
  return { calls, supabase: supabase as unknown as AdminClient };
}
