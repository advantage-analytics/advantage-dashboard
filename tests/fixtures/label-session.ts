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
    deleteReason: null,
    hitter: "p1",
    stroke: null,
    result: null,
    contactX: null,
    contactY: null,
    landingX: null,
    landingY: null,
    videoTime: null,
    ...fields,
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
  }),
  shot("s-serve", P1, {
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
  shot("s-phantom", P1, {
    eventId: 103,
    hitter: "p1",
    stroke: "forehand",
    videoTime: 2473.6,
    status: "deleted",
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
    status: "unchanged",
    checkedAt: null,
    shots: [],
    ...fields,
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
    points: [
      point(P1, 0, {
        winner: "p2",
        ending: "error",
        endedBy: "p1",
        status: "edited",
        shots: orderLabelShots(POINT_1_SHOTS),
      }),
      point(P2, 1, {
        serveSide: "ad",
        winner: "p1",
        ending: "ace",
        endedBy: "p1",
        checkedAt: "2026-09-28T10:00:00Z",
        shots: [
          shot("s-ace", P2, {
            eventId: 201,
            stroke: "first_serve",
            result: "in",
            videoTime: 2490.2,
          }),
        ],
      }),
      point(P3, 2, { status: "deleted", ending: "let_replayed" }),
      point(P4, 3, { gameNumber: 2, server: "p2" }),
    ],
  };
}

export const FIXTURE_POINT_IDS = { P1, P2, P3, P4 } as const;
