import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import {
  rosterProfileId,
  teammatePick,
  teammateSeat,
} from "@/components/dashboard/matches/new-match-wizard/teammates";
import {
  DEFAULT_FORM_DATA,
  type FormData,
} from "@/components/dashboard/matches/new-match-wizard/types";
import {
  buildMatchData,
  determineWinner,
} from "@/components/dashboard/matches/new-match-wizard/utils";
import { programSide } from "@/lib/data/program-side";
import type { RosterPlayerOption } from "@/lib/data/roster-shared";
import { playerSeat, viewerSide, youSeat } from "@/lib/data/viewer-side";

/**
 * T5 of the practice sessions queue — a teammate opponent takes seat two.
 *
 * Every other opponent's id goes to `matches.opponent_player_id` and never to
 * `player2_id`, which is an arm of the `matches` SELECT policy. A teammate is
 * the one exception: `player2_id` is what every seat reader keys on, and a
 * program member already reads the program's matches. Offline — the save's
 * pure half (`teammateSeat` → `buildMatchData`) and the three seat readers.
 */

const WIZARD = "src/components/dashboard/matches/new-match-wizard";
/** Source text with comment wrapping flattened, so a re-wrap is not a failure. */
const read = (file: string) =>
  readFileSync(resolve(process.cwd(), file), "utf8")
    .replace(/\n\s*(\*|\/\/|>)(?= |\n)/g, "")
    .replace(/[ \t]+/g, " ");

const person = (
  playerId: string,
  name: string,
  userId: string | null = null,
): RosterPlayerOption => ({
  playerId,
  userId,
  name,
  ladderPosition: null,
  classYear: null,
  email: null,
  managedBy: userId ? "self" : "coach",
  hand: null,
  backhand: null,
});

/** The subject: a claimed profile, so two ids of their own. */
const ACE = person("pp-ace", "Ace Player", "u-ace");
/** The teammate: also claimed. */
const BEN = person("pp-ben", "Ben Okafor", "u-ben");
/** The RPC's safety arm: a seat-holder with no profile — both ids the login. */
const SAM = person("u-sam", "Sam Seat", "u-sam");
const ROSTER = [ACE, BEN, SAM];
const PROGRAM = "33333333-3333-4333-8333-333333333333";

/**
 * One fixed form: a video upload's answers included, so the camera/end
 * fields are part of what is compared.
 */
const BASE: FormData = {
  ...DEFAULT_FORM_DATA,
  playerName: ACE.name,
  opponentName: BEN.name,
  playerScores: [6, 3, 7],
  opponentScores: [4, 6, 6],
  playerTiebreaks: [null, null, 7],
  opponentTiebreaks: [null, null, 4],
  bestOf: "3",
  matchType: "Practice",
  adScoring: false,
  playOnLets: true,
  fixedCamera: true,
  initialTopPlayerIsPlayer1: false,
  videoStartSeconds: 12,
  videoEndSeconds: 3600,
  playerHand: "right",
  playerBackhand: "two-handed",
  opponentHand: "left",
  opponentBackhand: "one-handed",
};

/** What the hook does between the form and the insert, minus the network. */
function saved(
  form: FormData,
  roster: RosterPlayerOption[] | null = ROSTER,
  subjectId: string | null = ACE.playerId,
) {
  const { winner, loser } = determineWinner(
    form.playerScores,
    form.opponentScores,
    3,
    subjectId,
    form.playerName,
    form.opponentName,
  );
  const teammate = teammateSeat(form, roster, subjectId);
  const viaTeammates = form.opponentSource === "teammate";
  return buildMatchData("m1", form, winner, loser, false, {
    userId: "u-coach",
    sourceProvider: "splitstep",
    analysisMethod: "ai",
    matchType: form.matchType,
    programId: PROGRAM,
    opponentPlayerId: viaTeammates
      ? (teammate?.profileId ?? null)
      : (form.opponentPlayerId ?? null),
    teammateSeatId: teammate?.seatId ?? null,
  });
}

const typed: FormData = { ...BASE };
/**
 * The same form with Ben picked from Teammates — only the two identity keys
 * the pick sets, so the comparison below is about the opponent's identity and
 * not about the style a roster row happens to carry.
 */
const pickedBen = teammatePick(BEN);
const versusBen: FormData = {
  ...BASE,
  opponentSource: pickedBen.opponentSource,
  opponentPlayerId: pickedBen.opponentPlayerId,
};

// ---- 1. The two ids -------------------------------------------------------

test("a teammate opponent: opponent_player_id is their program_players id, player2_id the id their matches carry", () => {
  const row = saved(versusBen);
  expect(row.opponent_player_id).toBe("pp-ben");
  expect(row.player2_id).toBe("pp-ben");
  // Never the claimed login — neither column takes `userId`.
  expect(row.player2_id).not.toBe(BEN.userId);
  expect(row.player1_id).toBe("pp-ace");
});

test("the seat follows the teammate whoever won", () => {
  const lost: FormData = {
    ...versusBen,
    playerScores: [2, 3, null],
    opponentScores: [6, 6, null],
    playerTiebreaks: [null, null, null],
    opponentTiebreaks: [null, null, null],
  };
  const row = saved(lost);
  expect(row.player1_id).toBe("pp-ace");
  expect(row.player2_id).toBe("pp-ben");
  expect(row.opponent_player_id).toBe("pp-ben");
});

test("every non-teammate opponent: player2_id is exactly what it was — null", () => {
  // A typed name.
  expect(saved(typed).player2_id).toBeNull();
  expect(saved(typed).opponent_player_id).toBeNull();

  // An opponent picked off ANOTHER program's roster: identity, no seat.
  const rival: FormData = {
    ...BASE,
    opponentName: "Pat Rival",
    opponentSource: "roster",
    opponentPlayerId: "pp-rival",
  };
  expect(saved(rival).player2_id).toBeNull();
  expect(saved(rival).opponent_player_id).toBe("pp-rival");

  // …even when that id happens to be on our roster: the seat is granted by
  // the Teammates pick, never inferred from an id.
  for (const source of ["roster", "history", "event", "new"] as const) {
    const row = saved({ ...versusBen, opponentSource: source });
    expect(row.player2_id, source).toBeNull();
  }

  // And `buildMatchData` alone, with no seat handed in, is as before.
  const bare = buildMatchData(
    "m1",
    versusBen,
    { id: "pp-ace", name: ACE.name, scores: [] },
    { id: null, name: BEN.name, scores: [] },
    false,
    { userId: "u", sourceProvider: "swingvision", analysisMethod: "elc" },
  );
  expect(bare.player2_id).toBeNull();
});

// ---- 2. Nothing else moves ------------------------------------------------

test("for one form, every other key is identical with and without a teammate opponent", () => {
  const without = saved(typed);
  const withTeammate = saved(versusBen);

  const a: Record<string, unknown> = { ...withTeammate };
  const b: Record<string, unknown> = { ...without };
  const differing = Object.keys(a).filter(
    (key) => JSON.stringify(a[key]) !== JSON.stringify(b[key]),
  );
  expect(differing.sort()).toEqual(["opponent_player_id", "player2_id"]);
  expect(Object.keys(withTeammate).sort()).toEqual(Object.keys(without).sort());

  // Spelled out, so a key dropped from BOTH outputs still fails here.
  for (const key of [
    "player1_id",
    "player1_name",
    "player2_name",
    "score",
    "format",
    "result",
    "stop_reason",
    "program_id",
    "match_type",
    "player_hand",
    "player_backhand",
    "opponent_hand",
    "opponent_backhand",
  ] as const) {
    expect(withTeammate, key).toHaveProperty(key);
    expect(withTeammate[key], key).toEqual(without[key]);
  }
  expect(withTeammate.player1_id).toBe("pp-ace");
  expect(withTeammate.player2_name).toBe(BEN.name);

  // The camera/end answers ride beside `buildMatchData`'s output, straight
  // off the form — the hook must not have started deriving them from the
  // opponent.
  const hook = read(`${WIZARD}/useUploadMatchWizard.ts`);
  expect(hook).toContain("fixed_camera: formData.fixedCamera ?? null");
  expect(hook).toMatch(
    /initial_top_player_is_player1:\s+formData\.initialTopPlayerIsPlayer1 \?\? null/,
  );
  expect(versusBen.fixedCamera).toBe(typed.fixedCamera);
  expect(versusBen.initialTopPlayerIsPlayer1).toBe(
    typed.initialTopPlayerIsPlayer1,
  );
  expect(versusBen.videoStartSeconds).toBe(typed.videoStartSeconds);
});

// ---- 3. The seat readers --------------------------------------------------

test("on such a row the teammate reads seat two, the subject seat one, the program seat one", () => {
  const row = { ...saved(versusBen), event_entry_id: null };
  expect(row.player1_id).toBe("pp-ace");
  expect(row.player2_id).toBe("pp-ben");

  // What `my_player_ids()` yields for each: the login and the profile.
  const bensIds = [BEN.userId!, BEN.playerId];
  const acesIds = [ACE.userId!, ACE.playerId];
  const rosterIds = ROSTER.map((p) => p.playerId);

  expect(playerSeat(row, bensIds)).toBe("player2");
  expect(viewerSide(row, bensIds, BEN.userId!, "u-coach")).toBe("player2");
  expect(youSeat(row, bensIds, rosterIds)).toBe("player2");

  expect(playerSeat(row, acesIds)).toBe("player1");
  expect(viewerSide(row, acesIds, ACE.userId!, "u-coach")).toBe("player1");
  expect(youSeat(row, acesIds, rosterIds)).toBe("player1");

  // A coach, in neither seat: the page orients to the subject.
  expect(viewerSide(row, ["u-coach"], "u-coach", "u-coach")).toBeNull();
  expect(youSeat(row, ["u-coach"], rosterIds)).toBe("player1");

  // The program's side is the subject's, with or without a schedule line.
  expect(programSide(row, new Set(rosterIds))).toBe("player1");
  expect(
    programSide({ ...row, event_entry_id: "e1" }, new Set(rosterIds)),
  ).toBe("player1");
});

// ---- 4. A row that cannot be vouched for never breaks the save ------------

test("a safety-arm row (no program_players row) takes the seat and leaves opponent_player_id null", () => {
  // `program_roster_full`'s third arm emits the member's login as both ids.
  expect(rosterProfileId(SAM)).toBeNull();
  expect(rosterProfileId(BEN)).toBe("pp-ben");
  expect(rosterProfileId(person("pp-new", "Unclaimed"))).toBe("pp-new");

  const row = saved({ ...BASE, ...teammatePick(SAM) });
  // Their matches carry the login id, so the seat is that id…
  expect(row.player2_id).toBe("u-sam");
  // …and the FK column, which points at `program_players`, is left empty.
  expect(row.opponent_player_id).toBeNull();
});

test("a teammate the live roster does not list saves as a typed name", () => {
  // A resumed draft whose teammate was archived or merged since.
  const gone = saved(versusBen, [ACE, SAM]);
  expect(gone.player2_id).toBeNull();
  expect(gone.opponent_player_id).toBeNull();
  expect(gone.player2_name).toBe(BEN.name);

  // The roster never loaded.
  const unknown = saved(versusBen, null);
  expect(unknown.player2_id).toBeNull();
  expect(unknown.opponent_player_id).toBeNull();
});

test("the subject is never seated opposite themselves, under either id", () => {
  const self: FormData = { ...BASE, ...teammatePick(ACE) };
  expect(teammateSeat(self, ROSTER, ACE.playerId)).toBeNull();
  expect(teammateSeat(self, ROSTER, ACE.userId)).toBeNull();
  const row = saved(self);
  expect(row.player1_id).toBe("pp-ace");
  expect(row.player2_id).toBeNull();
  expect(row.opponent_player_id).toBeNull();

  // `buildMatchData` holds the same line for any caller.
  const direct = buildMatchData(
    "m1",
    self,
    { id: "pp-ace", name: ACE.name, scores: [] },
    { id: null, name: ACE.name, scores: [] },
    false,
    {
      userId: "u",
      sourceProvider: "swingvision",
      analysisMethod: "elc",
      teammateSeatId: "pp-ace",
    },
  );
  expect(direct.player2_id).toBeNull();
});

// ---- 5. The wiring, and the comments that carry the rule ------------------

test("the save takes the teammate's ids from teammateSeat(), in a team workspace only", () => {
  const hook = read(`${WIZARD}/useUploadMatchWizard.ts`);
  expect(hook).toContain(
    'import { opponentIsTeammate, teammateSeat } from "./teammates";',
  );
  expect(hook).toMatch(
    /activeWorkspace\.kind === "team"\s*\? teammateSeat\(formData, teamRoster, playerUserId\)\s*: null/,
  );
  // The form's remembered id is not written as it stands for a teammate.
  expect(hook).toMatch(
    /let opponentPlayerId: string \| null = viaTeammates\s*\? \(teammate\?\.profileId \?\? null\)\s*: \(formData\.opponentPlayerId \?\? null\);/,
  );
  expect(hook).toContain("teammateSeatId: teammate?.seatId ?? null,");
  // A teammate is never contributed to another program's roster.
  expect(hook).toMatch(/!opponentPlayerId &&\s*!viaTeammates &&/);
  // The fill of an existing line's match does not write the seat.
  expect(hook).not.toMatch(/player2_id:/);
});

test("every comment that forbids an opponent id in player2_id states the teammate exception", () => {
  const utils = read(`${WIZARD}/utils.ts`);
  expect(utils).toContain("The one exception is a TEAMMATE");
  expect(utils).toContain("`player2_id` adds the seat, not the access");

  const types = read(`${WIZARD}/types.ts`);
  expect(types).toContain("except for a TEAMMATE");
  expect(types).toContain("access a program member already has");

  const opponents = read("src/lib/data/opponents-server.ts");
  expect(opponents).toContain("One opponent is written to both columns");
  expect(opponents).toContain("it adds their seat, not access");

  const side = read("src/lib/data/program-side.ts");
  expect(side).toContain(
    "The one opponent who does sit in `player2_id` is a teammate",
  );
  expect(side).toContain("the access that column grants is safe");

  const guardrails = read("docs/ui-revamp-guardrails.md");
  expect(guardrails).toContain("a teammate opponent takes seat two");
});

test("two players with one name: the subject keeps seat one whoever won", () => {
  // Two roster players can share a name, and nothing clears the opponent's
  // name when the subject changes. `buildMatchData` must not find the player
  // by name, or an opponent win seats the subject in seat two.
  const twin = person("pp-ace2", ACE.name, "u-ace2");
  const roster = [ACE, twin];
  for (const [p, o] of [
    [
      [6, 6, null],
      [2, 2, null],
    ],
    [
      [2, 2, null],
      [6, 6, null],
    ],
  ] as const) {
    const form: FormData = {
      ...BASE,
      ...teammatePick(twin),
      playerName: ACE.name,
      playerScores: [...p],
      opponentScores: [...o],
      playerTiebreaks: [null, null, null],
      opponentTiebreaks: [null, null, null],
    };
    const row = saved(form, roster);
    expect(row.player1_id).toBe(ACE.playerId);
    expect(row.player2_id).toBe(twin.playerId);
    expect(row.score.player1).toEqual([...p].slice(0, 2));
  }
});

test("a parsed file never renames a teammate opponent", () => {
  // The seat names the teammate; a re-parsed export's opponent name would
  // otherwise sit beside it in `player2_name`.
  const hook = read(`${WIZARD}/useUploadMatchWizard.ts`);
  const start = hook.indexOf("opponentName:\n                  (eventOwns ||");
  expect(start).toBeGreaterThan(-1);
  expect(hook.slice(start, start + 200)).toContain(
    'prev.opponentSource === "teammate"',
  );
});
