import { expect, test } from "@playwright/test";
import {
  classifyFlags,
  countsSentence,
  groupLabelJobs,
  jobState,
  PERSONAL_KEY,
  type GroupableJob,
  type GroupableOwner,
} from "@/lib/services/labels/job-groups";
import {
  formatEnteredScore,
  programLabel,
} from "@/lib/data/label-overview-server";

/**
 * The Labels list's grouping (job-groups.ts): by program, then by player,
 * with what needs labelling first at every level.
 */
const job = (
  jobId: string,
  matchId: string,
  session: GroupableJob["session"] = null,
  player1Name = "Ana",
): GroupableJob => ({
  jobId,
  matchId,
  player1Name,
  player2Name: "Opponent",
  completedAt: "2026-10-01T00:00:00Z",
  session,
});

const owner = (
  programId: string | null,
  playerKey: string,
  playerName: string,
  playedAt: string | null = null,
): GroupableOwner => ({
  programId,
  programName: programId ? `Program ${programId}` : null,
  playerKey,
  playerName,
  playedAt,
});

const OPEN = { status: "labelling" as const };
const DONE = { status: "complete" as const };

test("a job is to do, under way or done by its session", () => {
  expect(jobState(job("a", "m"))).toBe("todo");
  expect(jobState(job("a", "m", OPEN))).toBe("doing");
  expect(jobState(job("a", "m", DONE))).toBe("done");
});

test("programs before personal matches, the one with the most to label first", () => {
  const groups = groupLabelJobs(
    [
      job("j1", "m1", DONE),
      job("j2", "m2"),
      job("j3", "m3"),
      job("j4", "m4"),
      job("j5", "m5", OPEN),
    ],
    {
      m1: owner("p-quiet", "x", "Xu"),
      m2: owner("p-busy", "a", "Ana"),
      m3: owner("p-busy", "b", "Bea"),
      m4: owner(null, "solo", "Solo"),
      m5: owner("p-busy", "a", "Ana"),
    },
  );
  expect(groups.map((g) => g.key)).toEqual(["p-busy", "p-quiet", PERSONAL_KEY]);
  expect(groups[0].counts).toEqual({ todo: 2, doing: 1, done: 0 });
  expect(groups[2].name).toBe("Personal matches");
});

test("a player's matches sit together: needs labelling first, then newest", () => {
  const [program] = groupLabelJobs(
    [
      job("done", "m1", DONE),
      job("old", "m2"),
      job("new", "m3"),
      job("doing", "m4", OPEN),
      job("other", "m5", DONE),
    ],
    {
      m1: owner("p", "a", "Ana", "2026-09-01"),
      m2: owner("p", "a", "Ana", "2026-08-01"),
      m3: owner("p", "a", "Ana", "2026-09-20"),
      m4: owner("p", "a", "Ana", "2026-09-10"),
      m5: owner("p", "b", "Bea", "2026-09-10"),
    },
  );
  // Ana has work left, Bea has none: Ana first.
  expect(program.players.map((p) => p.name)).toEqual(["Ana", "Bea"]);
  expect(program.players[0].jobs.map((j) => j.jobId)).toEqual([
    "new",
    "old",
    "doing",
    "done",
  ]);
  expect(program.players[0].counts).toEqual({ todo: 2, doing: 1, done: 1 });
});

test("one view keeps one state, and drops the groups it empties", () => {
  const jobs = [job("j1", "m1"), job("j2", "m2", DONE)];
  const owners = { m1: owner("p1", "a", "Ana"), m2: owner("p2", "b", "Bea") };
  expect(groupLabelJobs(jobs, owners, "todo").map((g) => g.key)).toEqual([
    "p1",
  ]);
  expect(groupLabelJobs(jobs, owners, "doing")).toEqual([]);
});

test("a job with no owner row still lists, under its own player 1", () => {
  const [group] = groupLabelJobs([job("j", "gone", null, "Ghost Player")], {});
  expect(group.key).toBe(PERSONAL_KEY);
  expect(group.players[0].name).toBe("Ghost Player");
  // Two such jobs of one name are one player.
  const [again] = groupLabelJobs(
    [job("a", "x", null, "Ghost Player"), job("b", "y", null, "ghost player")],
    {},
  );
  expect(again.players).toHaveLength(1);
});

test("a group's state reads as a sentence, with only what it has", () => {
  expect(countsSentence({ todo: 2, doing: 1, done: 3 })).toBe(
    "2 need labelling · 1 in progress · 3 labelled",
  );
  expect(countsSentence({ todo: 1, doing: 0, done: 0 })).toBe(
    "1 needs labelling",
  );
  expect(countsSentence({ todo: 0, doing: 0, done: 0 })).toBe("");
});

test("the entered score and the program read as the upload wrote them", () => {
  expect(formatEnteredScore({ player1: [4, 6, 5], player2: [6, 0, 2] })).toBe(
    "4–6, 6–0, 5–2",
  );
  expect(formatEnteredScore({ player1: [], player2: [] })).toBeNull();
  expect(formatEnteredScore(null)).toBeNull();
  expect(
    programLabel({ school_name: "Dartmouth College", team: "womens" }),
  ).toBe("Dartmouth College · Women’s");
  expect(programLabel({ school_name: "Dartmouth College", team: null })).toBe(
    "Dartmouth College",
  );
  expect(programLabel({ school_name: null, team: "mens" })).toBeNull();
});

test("a match's stored flags sort into amber and grey by the rail's own table", () => {
  expect(
    classifyFlags([
      ["winner_disputed", "phantom_strokes_dropped"],
      ["same_player_consecutive"],
      ["ending_suspect_line", "not_a_code"],
      [],
    ]),
  ).toEqual({
    // Can move the score.
    amber: 1,
    // A counted mark about the data, and a hint. The hidden mark and a code
    // the console does not draw are not counted.
    grey: 2,
  });
});
