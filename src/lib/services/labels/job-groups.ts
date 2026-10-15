/**
 * The Labels list, grouped: every completed job filed under the program its
 * match belongs to (or "Personal matches"), then under the player on the
 * match's near side — the profile a coach would look the match up by — with
 * what needs labelling first at every level. Pure.
 *
 * A job is in one of three states, read off its session:
 * - `todo`: nobody has started a session. Needs labelling.
 * - `doing`: a session is open.
 * - `done`: its session is complete, which is also when its labels were
 *   published to the match.
 */

import { DATA_MARK_CODES, LABEL_MARK_META } from "./marks";

export type LabelJobState = "todo" | "doing" | "done";

/** A match's flags as the list shows them: amber and grey, counted. */
export interface FlagCounts {
  amber: number;
  grey: number;
}

/**
 * Sort a match's stored flag codes (`points.flags`, one array a point) into
 * the console's two colours by the same table the rail reads
 * (`LABEL_MARK_META`): a counted mark that can move the score is amber, a
 * counted one about the data and every hint are grey, and a hidden mark or a
 * code the console does not draw is not counted.
 */
export function classifyFlags(
  pointFlags: readonly (readonly string[])[],
): FlagCounts {
  const counts: FlagCounts = { amber: 0, grey: 0 };
  const meta = LABEL_MARK_META as Record<string, { tier: string } | undefined>;
  for (const flags of pointFlags) {
    for (const code of flags) {
      const tier = meta[code]?.tier;
      if (tier === "count") {
        if (DATA_MARK_CODES.has(code as never)) counts.grey += 1;
        else counts.amber += 1;
      } else if (tier === "hint") counts.grey += 1;
    }
  }
  return counts;
}

/** What grouping reads of a job. A `LabelJobRow` satisfies it. */
export interface GroupableJob {
  jobId: string;
  matchId: string;
  player1Name: string;
  player2Name: string;
  completedAt: string | null;
  session: { status: "labelling" | "complete" } | null;
}

/** What grouping reads of a match's owner. A `LabelJobOwner` satisfies it. */
export interface GroupableOwner {
  programId: string | null;
  programName: string | null;
  playerKey: string;
  playerName: string;
  playedAt: string | null;
}

export const jobState = (job: GroupableJob): LabelJobState =>
  job.session === null
    ? "todo"
    : job.session.status === "complete"
      ? "done"
      : "doing";

/** How many jobs of a group are in each state. */
export type StateCounts = Record<LabelJobState, number>;

export interface PlayerGroup<J> {
  key: string;
  name: string;
  counts: StateCounts;
  jobs: J[];
}

export interface ProgramGroup<J> {
  /** The program's id, or `PERSONAL_KEY`. */
  key: string;
  name: string;
  personal: boolean;
  counts: StateCounts;
  players: PlayerGroup<J>[];
}

export const PERSONAL_KEY = "personal";
export const PERSONAL_NAME = "Personal matches";

const ORDER: Record<LabelJobState, number> = { todo: 0, doing: 1, done: 2 };

const counted = (jobs: readonly GroupableJob[]): StateCounts => {
  const counts: StateCounts = { todo: 0, doing: 0, done: 0 };
  for (const job of jobs) counts[jobState(job)] += 1;
  return counts;
};

/** Most still to label first, then most in progress, then by name. */
const byWork = (
  a: { counts: StateCounts; name: string },
  b: { counts: StateCounts; name: string },
) =>
  b.counts.todo - a.counts.todo ||
  b.counts.doing - a.counts.doing ||
  a.name.localeCompare(b.name);

/**
 * `jobs` grouped by program, then player. A job whose match has no owner row
 * (the match is gone, or the read failed) files under Personal matches and
 * its own player 1 name, so it is never dropped from the list. `only` keeps
 * one state's jobs; groups left empty by it are not returned.
 */
export function groupLabelJobs<J extends GroupableJob>(
  jobs: readonly J[],
  owners: Readonly<Record<string, GroupableOwner | undefined>>,
  only: LabelJobState | null = null,
): ProgramGroup<J>[] {
  const programs = new Map<
    string,
    { name: string; personal: boolean; players: Map<string, PlayerGroup<J>> }
  >();
  for (const job of jobs) {
    if (only !== null && jobState(job) !== only) continue;
    const owner = owners[job.matchId];
    const programKey = owner?.programId ?? PERSONAL_KEY;
    const program = programs.get(programKey) ?? {
      name:
        programKey === PERSONAL_KEY
          ? PERSONAL_NAME
          : (owner?.programName ?? "Unnamed program"),
      personal: programKey === PERSONAL_KEY,
      players: new Map<string, PlayerGroup<J>>(),
    };
    programs.set(programKey, program);
    const playerKey =
      owner?.playerKey ?? `name:${job.player1Name.toLowerCase()}`;
    const player = program.players.get(playerKey) ?? {
      key: playerKey,
      name: owner?.playerName ?? job.player1Name,
      counts: { todo: 0, doing: 0, done: 0 },
      jobs: [],
    };
    program.players.set(playerKey, player);
    player.jobs.push(job);
  }

  const played = (job: J) =>
    owners[job.matchId]?.playedAt ?? job.completedAt ?? "";
  return [...programs.entries()]
    .map(([key, program]) => {
      const players = [...program.players.values()].map((player) => ({
        ...player,
        counts: counted(player.jobs),
        // Needs labelling first, then newest match first.
        jobs: [...player.jobs].sort(
          (a, b) =>
            ORDER[jobState(a)] - ORDER[jobState(b)] ||
            played(b).localeCompare(played(a)),
        ),
      }));
      return {
        key,
        name: program.name,
        personal: program.personal,
        counts: counted(players.flatMap((player) => player.jobs)),
        players: players.sort(byWork),
      };
    })
    .sort((a, b) => Number(a.personal) - Number(b.personal) || byWork(a, b));
}

/** "2 need labelling · 1 in progress · 3 labelled": a group's state, in words. */
export function countsSentence(counts: StateCounts): string {
  const parts = [
    counts.todo > 0
      ? `${counts.todo} ${counts.todo === 1 ? "needs" : "need"} labelling`
      : null,
    counts.doing > 0 ? `${counts.doing} in progress` : null,
    counts.done > 0 ? `${counts.done} labelled` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}
