/**
 * A made-up match for `/design/labels`: two sets of points with strokes, a
 * spread of open marks, some of it checked and some of it edited, and a
 * handful of jobs for the list. Deterministic — no clock, no randomness — so
 * the page reads the same on the server and in the browser.
 */

import type { LabelUploadInfo } from "@/lib/data/label-overview-server";
import type { LabelJobOwner } from "@/lib/data/label-overview-server";
import type { LabelJobRow } from "@/lib/data/labels-server";
import type { LabelMark, LabelMarks } from "@/lib/services/labels/marks";
import type {
  LabelPoint,
  LabelShot,
  LabelSide,
} from "@/lib/services/labels/session";

export const NAMES: Record<LabelSide, string> = {
  p1: "Maya Okafor",
  p2: "Elena Vargas",
};

/**
 * Each game as who won it and how many points the loser took: no-ad, first to
 * four. Set 1 is 6–3 to p1; set 2 is labelled 3–6 against a record of 4–6.
 */
const GAMES: [LabelSide, number][][] = [
  [
    ["p1", 1],
    ["p2", 2],
    ["p1", 0],
    ["p2", 3],
    ["p1", 1],
    ["p1", 2],
    ["p2", 3],
    ["p1", 0],
    ["p1", 1],
  ],
  [
    ["p2", 1],
    ["p1", 2],
    ["p2", 0],
    ["p2", 3],
    ["p1", 1],
    ["p2", 2],
    ["p1", 3],
    ["p2", 0],
    ["p2", 1],
  ],
];

/** A game's points in order: the loser's spread through, the winner's last. */
function gamePoints(winner: LabelSide, loserPoints: number): LabelSide[] {
  const loser: LabelSide = winner === "p1" ? "p2" : "p1";
  const points: LabelSide[] = [];
  let lost = 0;
  for (let won = 0; won < 4; won += 1) {
    if (won > 0 && lost < loserPoints) {
      points.push(loser);
      lost += 1;
    }
    points.push(winner);
    if (won === 1) {
      while (lost < loserPoints - 1) {
        points.push(loser);
        lost += 1;
      }
    }
  }
  // Whatever is left of the loser's goes before the winning point.
  const last = points.pop() as LabelSide;
  while (lost < loserPoints) {
    points.push(loser);
    lost += 1;
  }
  points.push(last);
  return points;
}

const SETS: LabelSide[][][] = GAMES.map((set) =>
  set.map(([winner, loserPoints]) => gamePoints(winner, loserPoints)),
);

const other = (side: LabelSide): LabelSide => (side === "p1" ? "p2" : "p1");

function shot(
  id: string,
  pointId: string,
  eventId: number,
  hitter: LabelSide,
  stroke: LabelShot["stroke"],
  result: LabelShot["result"],
  videoTime: number,
  status: LabelShot["status"] = "kept",
): LabelShot {
  // Metres, near baseline at y = 0: p1 hits from the near end, p2 from the
  // far one. A serve carries no landing, so no rule reads its box.
  const near = hitter === "p1";
  const serve = stroke === "first_serve" || stroke === "second_serve";
  const landingY = serve
    ? null
    : result === "in"
      ? near
        ? 18
        : 5
      : near
        ? 25.5
        : -1.5;
  return {
    id,
    labelPointId: pointId,
    eventId,
    afterEventId: null,
    status,
    statusBeforeDelete: null,
    deleteReason: null,
    hitter,
    stroke,
    result,
    spin: null,
    contactX: 2,
    contactY: near ? 1 : 22.7,
    landingX: landingY === null ? null : 3,
    landingY,
    videoTime,
    unclear: [],
    siteRemoval: null,
    siteRemovalRestoredAt: null,
    seed: null,
  };
}

const mark = (code: string, tier: "count" | "hint", params: object = {}) =>
  ({ code, tier, scope: "point", params }) as unknown as LabelMark;

/** The marks dealt out along the match, by the point's place in it. */
const DEALT: [number, LabelMark][] = [
  [3, mark("winner_disputed", "count")],
  [9, mark("reserve_after_in", "count")],
  [14, mark("winner_disputed", "count")],
  [14, mark("ending_suspect_line", "hint")],
  [21, mark("second_serve_called_out", "count")],
  [27, mark("winner_guessed", "count")],
  [33, mark("ending_suspect_line", "hint")],
  [38, mark("winner_disputed", "count")],
  [44, mark("result_type_unknown", "hint")],
  [51, mark("winner_to_error_by_bounce", "hint", { loser: "p2" })],
  [58, mark("winner_disputed", "count")],
  [63, mark("second_serve_called_out", "count")],
  [70, mark("ending_suspect_line", "hint")],
  [76, mark("winner_guessed", "count")],
];

export function fixtureMatch(): { points: LabelPoint[]; marks: LabelMarks } {
  const points: LabelPoint[] = [];
  const marks: LabelMarks = {
    points: {},
    shots: {},
    suggestions: [],
    serveSides: {},
  };
  let index = 0;
  let event = 1;
  let game = 0;
  let time = 20;
  SETS.forEach((set, s) => {
    set.forEach((winners, g) => {
      game += 1;
      const server: LabelSide = (s + g) % 2 === 0 ? "p1" : "p2";
      winners.forEach((winner, n) => {
        const id = `p-${index + 1}`;
        // The rally: a serve in, then as many strokes as the point's place
        // asks for, the last one in (a winner) or out (an error).
        const rally = 1 + ((index * 3) % 5);
        const ace = rally === 1 && winner === server;
        const shots: LabelShot[] = [
          shot(`${id}-1`, id, event++, server, "first_serve", "in", time),
        ];
        let hitter = other(server);
        for (let k = 1; k < rally; k += 1) {
          shots.push(
            shot(
              `${id}-${k + 1}`,
              id,
              event++,
              hitter,
              k % 2 === 0 ? "forehand" : "backhand",
              "in",
              time + k * 1.4,
            ),
          );
          hitter = other(hitter);
        }
        const last = shots[shots.length - 1];
        const lastWon = last.hitter === winner;
        if (!ace && !lastWon) {
          last.result = "out";
          last.landingY = last.hitter === "p1" ? 25.5 : -1.5;
        }
        // The first two-fifths are checked; a few of those were edited.
        const checked = index < 34;
        const edited = checked && index % 6 === 2;
        const ending = ace ? "ace" : lastWon ? "winner" : "error";
        points.push({
          id,
          pointIndex: index,
          vendorRallyIds: [index + 1],
          setNumber: s + 1,
          gameNumber: game,
          server,
          serveSide: n % 2 === 0 ? "deuce" : "ad",
          winner,
          ending,
          endedBy: last.hitter,
          gameType: "game",
          status: edited ? "edited" : "unchanged",
          statusBeforeDelete: null,
          checkedAt: checked ? "2026-10-12T18:00:00Z" : null,
          note: null,
          dismissed: [],
          seed: {
            set_number: s + 1,
            game_number: game,
            server,
            serve_side: null,
            winner: edited ? other(winner) : winner,
            ending,
            ended_by: last.hitter,
          },
          shots,
        });
        time += rally * 1.4 + 22;
        index += 1;
      });
      time += g % 2 === 0 ? 30 : 120;
    });
    time += 280;
  });
  for (const [at, dealt] of DEALT) {
    const point = points[at];
    if (point) (marks.points[point.id] ??= []).push(dealt);
  }
  return { points, marks };
}

export const MATCH_SCORE = { player1: [6, 4], player2: [3, 6] };

export const UPLOAD: LabelUploadInfo = {
  playedAt: "2026-09-27T18:30:00Z",
  event: "vs Northfield University",
  round: "Line 2",
  matchType: "Singles",
  courtType: "Outdoor hard court",
  bestOf: 3,
  adScoring: false,
  playOnLets: true,
  enteredScore: "6–3, 4–6",
  player1: { hand: "right", backhand: "two-handed" },
  player2: { hand: "left", backhand: null },
  fixedCamera: true,
  topPlayerIsPlayer1: false,
  trim: { start: 18, end: 4310 },
  submittedAt: "2026-09-28T02:10:00Z",
  analysedAt: "2026-09-28T03:24:00Z",
  uploadedBy: "Dana Whitfield",
  program: "Lakeshore College · Women’s",
  programCrestUrl: null,
  confidence: "medium",
};

// ── The list ───────────────────────────────────────────────────────────────

const job = (
  n: number,
  matchId: string,
  points: number,
  session: LabelJobRow["session"],
): LabelJobRow => ({
  jobId: `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`,
  matchId,
  player1Name: "",
  player2Name: "",
  pointCount: points,
  completedAt: `2026-10-${String(2 + n).padStart(2, "0")}T14:${String(10 + n * 3).padStart(2, "0")}:00Z`,
  session,
});

const open = (id: string, checked: number, total: number) => ({
  id,
  status: "labelling" as const,
  checked,
  total,
  openCounts: { amber: Math.max(0, 12 - checked), grey: 3 },
});
const done = (id: string, total: number) => ({
  id,
  status: "complete" as const,
  checked: total,
  total,
  openCounts: { amber: 0, grey: 0 },
});

export const JOBS: LabelJobRow[] = [
  job(1, "m1", 132, null),
  job(2, "m2", 98, null),
  job(3, "m3", 141, open("s3", 37, 141)),
  job(4, "m4", 87, done("s4", 87)),
  job(5, "m5", 110, null),
  job(6, "m6", 76, open("s6", 4, 76)),
  job(7, "m7", 154, done("s7", 154)),
  job(8, "m8", 93, null),
  job(9, "m9", 120, done("s9", 120)),
];

const owner = (
  programId: string | null,
  programName: string | null,
  playerKey: string,
  playerName: string,
  opponentName: string,
  event: string | null,
  playedAt: string,
): LabelJobOwner => ({
  programId,
  programName,
  programCrestUrl: null,
  playerKey,
  playerName,
  opponentName,
  event,
  playedAt,
});

const LAKESHORE = "Lakeshore College · Women’s";
const HARBOR = "Harbor State · Men’s";

export const OWNERS: Record<string, LabelJobOwner> = {
  m1: owner(
    "lake",
    LAKESHORE,
    "maya",
    "Maya Okafor",
    "Elena Vargas",
    "vs Northfield University",
    "2026-09-27",
  ),
  m2: owner(
    "lake",
    LAKESHORE,
    "maya",
    "Maya Okafor",
    "Priya Nair",
    "vs Easton College",
    "2026-09-20",
  ),
  m3: owner(
    "lake",
    LAKESHORE,
    "maya",
    "Maya Okafor",
    "Sofia Lindqvist",
    "Fall Invitational",
    "2026-09-13",
  ),
  m4: owner(
    "lake",
    LAKESHORE,
    "jo",
    "Jo Castellanos",
    "Hana Mori",
    "vs Northfield University",
    "2026-09-27",
  ),
  m5: owner(
    "lake",
    LAKESHORE,
    "jo",
    "Jo Castellanos",
    "Ruth Adeyemi",
    "vs Easton College",
    "2026-09-20",
  ),
  m6: owner(
    "harbor",
    HARBOR,
    "theo",
    "Theo Marchetti",
    "Luis Ferreira",
    "vs Bayview",
    "2026-09-25",
  ),
  m7: owner(
    "harbor",
    HARBOR,
    "theo",
    "Theo Marchetti",
    "Omar Haddad",
    "Coastal Classic",
    "2026-09-18",
  ),
  m8: owner(
    null,
    null,
    "sam",
    "Sam Arroyo",
    "Ken Watanabe",
    null,
    "2026-09-30",
  ),
  m9: owner(
    null,
    null,
    "sam",
    "Sam Arroyo",
    "Milo Brandt",
    "Club championship",
    "2026-09-22",
  ),
};

/** The flags each sample match's analysis raised: amber, then grey. */
export const FLAGS: Record<string, { amber: number; grey: number }> = {
  m1: { amber: 14, grey: 31 },
  m2: { amber: 9, grey: 22 },
  m3: { amber: 11, grey: 27 },
  m4: { amber: 0, grey: 0 },
  m5: { amber: 12, grey: 19 },
  m6: { amber: 7, grey: 16 },
  m7: { amber: 0, grey: 0 },
  m8: { amber: 8, grey: 24 },
  m9: { amber: 0, grey: 2 },
};
