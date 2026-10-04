import {
  orderLabelShots,
  type LabelPoint,
  type LabelSession,
  type LabelShot,
} from "@/lib/services/labels/session";

/**
 * A small hand-labelling session for the console specs: four points, one of
 * them a tombstone, one checked, and a first point whose strokes cover every
 * shot state the table draws — kept, edited, added and deleted.
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

function shot(
  id: string,
  labelPointId: string,
  fields: Partial<LabelShot>,
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
    contactX: null,
    contactY: null,
    landingX: null,
    landingY: null,
    videoTime: null,
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
  const row = shot(id, labelPointId, fields);
  return {
    ...row,
    seed: row.seed ?? {
      hitter: row.hitter,
      stroke: row.stroke,
      result: row.result,
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
  shot("s-return", P1, {
    eventId: 102,
    hitter: "p2",
    stroke: "backhand",
    result: "in",
    contactX: 1.8,
    contactY: 24.49,
    landingX: -2.1,
    landingY: 3.49,
    videoTime: 2473.1,
    status: "edited",
    // Seeded as a forehand the vendor put 30 cm wider.
    seed: {
      hitter: "p2",
      stroke: "forehand",
      result: "in",
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
  shot("s-added", P1, {
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

function point(
  id: string,
  pointIndex: number,
  fields: Partial<LabelPoint>,
): LabelPoint {
  return {
    id,
    pointIndex,
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
  const row = point(id, pointIndex, fields);
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
    points: [
      point(P1, 0, {
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
            videoTime: 2490.2,
          }),
        ],
      }),
      seededPoint(P3, 2, {
        status: "deleted",
        statusBeforeDelete: "unchanged",
        ending: "let_replayed",
      }),
      seededPoint(P4, 3, { gameNumber: 2, server: "p2" }),
    ],
  };
}

export const FIXTURE_POINT_IDS = { P1, P2, P3, P4 } as const;
